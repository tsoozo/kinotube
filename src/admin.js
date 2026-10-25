// Админ хэсгийн өгөгдлийн давхарга. Одоо localStorage дээр (mock) ажиллана.
// Supabase-д шилжихдээ зөвхөн энэ файлын функцуудыг API дуудлагаар солино.
import {
  addMonths, allUsers, findUser, formatDate, isActive, isAdmin, isValidPin, read, removeUser, saveUser, write,
} from './auth.js'
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

export const listUsers = () => allUsers().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))

function update(phone, fn) {
  const u = findUser(phone)
  if (!u) throw new Error('Хэрэглэгч олдсонгүй.')
  const next = fn(u)
  saveUser(next)
  return next
}

const adminTx = (amount, note) => ({ at: new Date().toISOString(), type: 'admin', amount, note })

export function adminSetPin(phone, pin) {
  if (!isValidPin(pin)) throw new Error('Код 4 оронтой тоо байх ёстой.')
  return update(phone, (u) => ({ ...u, pin }))
}

export const randomPin = () => String(Math.floor(Math.random() * 10000)).padStart(4, '0')

// Үнэгүй эрх олгоно. Идэвхтэй бол дуусах хугацаан дээр нь нэмнэ.
export function adminGrant(phone, { days = 0, months = 0 }) {
  return update(phone, (u) => {
    const base = isActive(u) ? new Date(u.subscription.endsAt) : new Date()
    const end = addMonths(base, months)
    end.setDate(end.getDate() + days)
    const label = months ? `${months} сарын эрх` : `${days} хоногийн эрх`
    return {
      ...u,
      subscription: { plan: 'admin', label: `${label} (админ)`, endsAt: end.toISOString() },
      transactions: [adminTx(0, `Админ: ${label} олгов`), ...u.transactions],
    }
  })
}

// Эрхийн дуусах өдрийг шууд тохируулна (тухайн өдрийн 23:59 хүртэл).
export function adminSetEnd(phone, date) {
  const end = new Date(`${date}T23:59:00`)
  if (isNaN(end) || end <= new Date()) throw new Error('Өнөөдрөөс хойшхи огноо сонгоно уу.')
  return update(phone, (u) => ({
    ...u,
    subscription: { plan: 'admin', label: 'Админ олгосон эрх', endsAt: end.toISOString() },
    transactions: [adminTx(0, `Админ: эрх ${formatDate(end.toISOString())} хүртэл тохируулав`), ...u.transactions],
  }))
}

export function adminCancelPlan(phone) {
  return update(phone, (u) => ({
    ...u,
    subscription: u.subscription && { ...u.subscription, endsAt: new Date().toISOString() },
    transactions: [adminTx(0, 'Админ: эрх цуцлав'), ...u.transactions],
  }))
}

export function adminAdjustBalance(phone, amount, note) {
  if (!Number.isInteger(amount) || amount === 0) throw new Error('Дүнг бүхэл тоогоор оруулна уу (хасах бол -5000 гэх мэт).')
  return update(phone, (u) => {
    if (u.balance + amount < 0) throw new Error('Үлдэгдэл хасах дүнд хүрэхгүй байна.')
    return {
      ...u,
      balance: u.balance + amount,
      transactions: [adminTx(amount, `Админ: ${note.trim() || 'данс засвар'}`), ...u.transactions],
    }
  })
}

export const adminSetBlocked = (phone, blocked) => update(phone, (u) => ({ ...u, blocked }))

export const adminSetRole = (phone, admin) => update(phone, (u) => ({ ...u, role: admin ? 'admin' : undefined }))

export function adminDeleteUser(phone) {
  removeUser(phone)
}

// ---------- Гүйлгээ ба статистик ----------

export const TX_TYPES = { topup: 'Цэнэглэлт', plan: 'Сарын эрх', rent: 'Нэг кино', admin: 'Админ' }

export function allTransactions() {
  return allUsers()
    .flatMap((u) => (u.transactions || []).map((t) => ({ ...t, phone: u.phone, name: u.name })))
    .sort((a, b) => b.at.localeCompare(a.at))
}

// Кино бүрийг хэдэн хэрэглэгч үзсэн, хэд нь дуусгасан. Үзээгүй кино 0-тэй орно.
// Ихээс бага руу эрэмбэлсэн.
export function viewRanking(movies) {
  const views = {}
  allUsers().forEach((u) =>
    (u.history || []).forEach((h) => {
      const v = (views[h.id] ||= { count: 0, done: 0, last: null })
      v.count++
      if (h.done) v.done++
      if (h.at && (!v.last || h.at > v.last)) v.last = h.at
    })
  )
  return movies
    .map((movie) => ({ movie, count: 0, done: 0, last: null, ...views[movie.id] }))
    .sort((a, b) => b.count - a.count || b.done - a.done || a.movie.title.localeCompare(b.movie.title))
}

export function stats(movies, shorts) {
  const users = allUsers()
  const tx = allTransactions()
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)
  const thisMonth = tx.filter((t) => new Date(t.at) >= monthStart)
  const sum = (list, type) => list.filter((t) => t.type === type).reduce((s, t) => s + Math.abs(t.amount), 0)

  const ranking = viewRanking(movies)
  const top = ranking.filter((x) => x.count > 0).slice(0, 5)
  const least = ranking.slice(-5).reverse()

  const monthAgo = Date.now() - 30 * 86400000
  return {
    users: users.length,
    newUsers: users.filter((u) => new Date(u.createdAt).getTime() > monthAgo).length,
    active: users.filter(isActive).length,
    admins: users.filter(isAdmin).length,
    blocked: users.filter((u) => u.blocked).length,
    topupMonth: sum(thisMonth, 'topup'),
    planMonth: sum(thisMonth, 'plan'),
    rentMonth: sum(thisMonth, 'rent'),
    topupAll: sum(tx, 'topup'),
    planAll: sum(tx, 'plan'),
    rentAll: sum(tx, 'rent'),
    balances: users.reduce((s, u) => s + (u.balance || 0), 0),
    movies: movies.length,
    shorts: shorts.length,
    top,
    least,
    recent: users.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5),
  }
}
