// Админ хэсгийн өгөгдлийн давхарга. Бүгд Supabase-ийн admin_* функцууд, functions/api/admin/-аар
// (сервер админ эсэхийг шалгана). Кино, Shorts-ийн жагсаалт catalog хүснэгтэд, видео, зураг R2-д.
import { api, fail, need } from './auth.js'
import { SHORTS_MAX_SECONDS, toSeconds } from './data.js'

// ---------- Кино ба Shorts ----------

const DURATION_RE = /^\d{1,2}(:\d{2}){1,2}$/
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/

// Монгол кирилл нэрээс латин ID (жишээ: "Генерал" → "general").
const LATIN = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j', з: 'z', и: 'i', й: 'i', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', ө: 'u', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ү: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh',
  щ: 'sh', ъ: '', ы: 'y', ь: 'i', э: 'e', ю: 'yu', я: 'ya',
}
export const slugify = (title) =>
  [...title.toLowerCase()].map((c) => LATIN[c] ?? c).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '')

// Формын утгыг шалгаж, admin_save_catalog-д өгөх мөр болгоно. Буруу бол Error.
export function cleanItem(kind, form, list, originalId) {
  const id = form.id.trim().toLowerCase()
  if (!SLUG.test(id)) throw new Error('ID зөвхөн латин жижиг үсэг, тоо, зураастай байна (жишээ: the-general).')
  if (id !== originalId && list.some((m) => m.id === id)) throw new Error('Ийм ID-тай бичлэг аль хэдийн байна.')
  if (!form.title.trim()) throw new Error('Нэрийг оруулна уу.')
  const duration = form.duration.trim()
  if (duration && !DURATION_RE.test(duration)) throw new Error('Үргэлжлэх хугацааг "Ц:ММ:СС" эсвэл "М:СС" хэлбэрээр бичнэ үү.')
  const item = {
    id,
    kind: kind === 'shorts' ? 'short' : 'movie',
    title: form.title.trim(),
    duration,
    description: form.description.trim(),
    added: form.added || new Date().toISOString().slice(0, 10),
    published: Boolean(form.published),
  }
  if (kind === 'shorts') {
    const sec = toSeconds(duration)
    if (duration && (sec <= 0 || sec > SHORTS_MAX_SECONDS)) throw new Error('Shorts 20 минутаас урт байж болохгүй.')
    return { ...item, movie_id: form.movie || null }
  }
  const year = form.year ? Number(form.year) : null
  if (year !== null && (!Number.isInteger(year) || year < 1880 || year > 2100)) throw new Error('Оныг зөв оруулна уу.')
  const genres = form.genres.split(',').map((g) => g.trim()).filter(Boolean)
  const priceText = String(form.price || '').replace(/[\s,₮]/g, '')
  const price = priceText ? Number(priceText) : null
  if (price !== null && (!Number.isInteger(price) || price < 100 || price > 1000000)) throw new Error('Үнийг 100–1,000,000₮ хооронд бүхэл тоогоор оруулна уу.')
  return { ...item, year, genres, categories: form.categories || [], price_mnt: price }
}

export async function saveCatalogItem(item) {
  const { data, error } = await need().rpc('admin_save_catalog', { p: item })
  if (error) throw fail(error)
  return data
}

const upload = (body) => api('/api/admin/upload', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})
export { upload as uploadAction }

// Видео, зураг, мөрийг хамт устгана.
export const deleteCatalogItem = (kind, id) => upload({ action: 'delete', kind, id })

// Зургийг R2 руу шууд хуулж, түлхүүрийг (thumbnails/...) буцаана.
export async function uploadThumbnail(kind, id, file) {
  const { key, url } = await upload({ action: 'thumb', kind, id, type: file.type, size: file.size })
  const res = await fetch(url, { method: 'PUT', body: file, headers: { 'content-type': file.type } }).catch(() => null)
  if (!res?.ok) throw new Error('Зураг хуулж чадсангүй. R2-ийн CORS тохиргоог шалгана уу (README).')
  return key
}

// Видео файлын уртыг "Ц:ММ:СС" хэлбэрээр (хөтөч уншиж чадахгүй бол '').
export function videoDuration(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video')
    const url = URL.createObjectURL(file)
    const done = (value) => {
      URL.revokeObjectURL(url)
      resolve(value)
    }
    v.preload = 'metadata'
    v.onloadedmetadata = () => {
      const s = Math.round(v.duration || 0)
      if (!s || !isFinite(s)) return done('')
      const pad = (n) => String(n).padStart(2, '0')
      const h = Math.floor(s / 3600)
      done(h ? `${h}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${Math.floor(s / 60)}:${pad(s % 60)}`)
    }
    v.onerror = () => done('')
    v.src = url
  })
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
