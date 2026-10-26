// Админ хэсгийн өгөгдлийн давхарга. Хэрэглэгч, төлбөр, статистик Supabase-ийн admin_* функцуудаар
// (сервер админ эсэхийг шалгана). Кино, Shorts-ийн жагсаалтыг энэ хөтөч дээр засаад json татаж авна.
import { api, fail, need, read, write } from './auth.js'
import { CATALOG_KEYS, SHORTS_MAX_SECONDS, toSeconds } from './data.js'

// ---------- Кино ба Shorts ----------

export const isCatalogEdited = (kind) => read(CATALOG_KEYS[kind], null) !== null

export function saveCatalog(kind, list) {
  write(CATALOG_KEYS[kind], list)
}

// Засварыг арилгаж, json файл руу буцна.
export function resetCatalog(kind) {
  write(CATALOG_KEYS[kind], null)
}

const DURATION_RE = /^\d{1,2}(:\d{2}){1,2}$/

// Буруу бол алдааны мессеж буцаана, зөв бол цэвэрлэсэн мөр.
export function cleanItem(kind, form, list, originalId) {
  const id = form.id.trim().toLowerCase()
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(id)) throw new Error('ID зөвхөн латин жижиг үсэг, тоо, зураастай байна (жишээ: the-general).')
  if (id !== originalId && list.some((m) => m.id === id)) throw new Error('Ийм ID-тай бичлэг аль хэдийн байна.')
  if (!form.title.trim()) throw new Error('Нэрийг оруулна уу.')
  const duration = form.duration.trim()
  if (!DURATION_RE.test(duration)) throw new Error('Үргэлжлэх хугацааг "Ц:ММ:СС" эсвэл "М:СС" хэлбэрээр бичнэ үү.')
  const item = {
    id,
    title: form.title.trim(),
    duration,
    description: form.description.trim(),
    video: form.video.trim(),
    thumbnail: form.thumbnail.trim(),
    added: form.added || new Date().toISOString().slice(0, 10),
  }
  if (kind === 'shorts') {
    const sec = toSeconds(duration)
    if (sec <= 0 || sec > SHORTS_MAX_SECONDS) throw new Error('Shorts 20 минутаас урт байж болохгүй.')
    if (form.movie) item.movie = form.movie
    return item
  }
  const year = Number(form.year)
  if (!Number.isInteger(year) || year < 1880 || year > 2100) throw new Error('Оныг зөв оруулна уу.')
  const genres = form.genres.split(',').map((g) => g.trim()).filter(Boolean)
  return { id, title: item.title, year, genres, ...item }
}

export function downloadJson(name, data) {
  const blob = new Blob([JSON.stringify(data, null, 2) + '\n'], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}

// ---------- Хэрэглэгч ----------

// Серверийн user_json → апп доторх хэлбэр (auth.js-ийн isActive, daysLeft ажиллана).
function toUser(x) {
  const until = x.subscription_until || x.last_subscription_end
  return {
    id: x.id,
    email: x.email,
    name: x.name || x.email,
    createdAt: x.created_at,
    role: x.is_admin ? 'admin' : undefined,
    blocked: x.blocked,
    subscription: until ? { label: 'Эрх', endsAt: until } : null,
    rentals: x.rentals || 0,
    views: x.views || 0,
    paid: x.paid_mnt || 0,
  }
}

async function rpc(name, args) {
  const { data, error } = await need().rpc(name, args)
  if (error) throw fail(error)
  return data
}

export const listUsers = async (filter = 'all', query = '') =>
  (await rpc('admin_list_users', { p_filter: filter, p_query: query.trim() || null })).map(toUser)

export async function findUserByEmail(email) {
  const x = await rpc('admin_find_user', { p_email: email.trim() })
  return x ? toUser(x) : null
}

// Үнэгүй эрх олгоно. Идэвхтэй бол дуусах хугацаан дээр нь нэмнэ.
export const adminGrant = async (id, { days = 0, months = 0 }) =>
  toUser(await rpc('admin_grant', { p_user: id, p_days: days, p_months: months }))

// Эрхийн дуусах өдрийг шууд тохируулна (тухайн өдрийн 23:59 хүртэл).
export async function adminSetEnd(id, date) {
  const end = new Date(`${date}T23:59:00`)
  if (isNaN(end) || end <= new Date()) throw new Error('Өнөөдрөөс хойшхи огноо сонгоно уу.')
  return toUser(await rpc('admin_set_end', { p_user: id, p_end: end.toISOString() }))
}

export const adminCancelPlan = async (id) => toUser(await rpc('admin_cancel', { p_user: id }))
export const adminSetBlocked = async (id, blocked) => toUser(await rpc('admin_set_blocked', { p_user: id, p_blocked: blocked }))
export const adminSetRole = async (id, admin) => toUser(await rpc('admin_set_role', { p_user: id, p_admin: admin }))

// ---------- Төлбөр ----------

export const listPaymentRequests = (status = 'all') => rpc('admin_list_payments', { p_status: status })

// Telegram-аас гадна вэбээс батлах / татгалзах.
export const approvePayment = (id) => rpc('approve_payment', { p_request_id: id })
export const rejectPayment = (id, reason) => rpc('reject_payment', { p_request_id: id, p_reason: reason?.trim() || null })

// Telegram-ийн тохиргоог шалгаж тест мессеж илгээнэ (functions/api/admin/telegram-check.js).
export const checkTelegram = async () => (await api('/api/admin/telegram-check', { method: 'POST' })).steps

// ---------- Үзэлт ба статистик ----------

// Кино бүрийг хэдэн хэрэглэгч үзсэн, хэд нь дуусгасан. Үзээгүй кино 0-тэй орно. Ихээс бага руу.
export async function viewRanking(movies) {
  const views = Object.fromEntries((await rpc('admin_views')).map((v) => [v.movie_id, v]))
  return movies
    .map((movie) => ({ movie, count: views[movie.id]?.count || 0, done: views[movie.id]?.done || 0, last: views[movie.id]?.last || null }))
    .sort((a, b) => b.count - a.count || b.done - a.done || a.movie.title.localeCompare(b.movie.title))
}

export async function stats(movies, shorts) {
  const [s, ranking] = await Promise.all([rpc('admin_stats'), viewRanking(movies)])
  return {
    users: s.users,
    newUsers: s.new_users,
    active: s.active,
    renting: s.renting,
    admins: s.admins,
    blocked: s.blocked,
    pending: s.pending,
    planMonth: s.month_month,
    rentMonth: s.month_rent,
    planAll: s.all_month,
    rentAll: s.all_rent,
    movies: movies.length,
    shorts: shorts.length,
    top: ranking.filter((x) => x.count > 0).slice(0, 5),
    least: ranking.slice(-5).reverse(),
    recent: (s.recent || []).map(toUser),
  }
}
