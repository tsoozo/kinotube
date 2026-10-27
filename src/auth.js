// Хэрэглэгч, үзэх эрх, төлбөр Supabase дээр (supabase/migrations). Нэвтрэлт: имэйлээр ирэх 6 оронтой код.
// Төлбөр: банкны шилжүүлэг → "Гүйлгээ хийсэн" → Telegram бот руу ✅/❌ (functions/) → эрх нээгдэнэ.
// Үнэ, эрх олгох бүх шийдвэрийг сервер гаргана. Үзсэн түүх, дараа үзэх жагсаалт хөтөч дээр (localStorage).
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY)
export const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

// Төлбөр хүлээн авах данс.
export const BANK = {
  name: 'Хаан банк',
  accountNumber: '600005005303317077',
  accountHolder: 'Батмэнд Хишигцогзол',
}

// Харуулах үнэ. Жинхэнэ дүнг сервер products хүснэгтээс авна.
export const PLANS = [{ id: 'month', label: '1 сарын эрх', months: 1, price: 15900 }]
export const RENTAL = { days: 3, price: 4900 }
// Нэг киноны үнэ: админ тохируулсан бол тэр, үгүй бол үндсэн үнэ.
export const rentPrice = (movie) => movie?.price || RENTAL.price

const USER_KEY = 'kino-user'
const GUEST_HISTORY_KEY = 'kino-history'
const RETURN_KEY = 'kino-return'
const POLL_MS = 10_000

let memory = {}

export function read(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : JSON.parse(v)
  } catch {
    return key in memory ? memory[key] : fallback
  }
}

export function write(key, value) {
  memory[key] = value
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Хадгалах боломжгүй үед санах ойд л үлдэнэ.
  }
}

// SQL функцуудын алдааны кодыг монгол текст болгоно.
const ERROR_TEXT = {
  not_authenticated: 'Нэвтэрнэ үү.',
  not_found: 'Олдсонгүй.',
  forbidden: 'Эрхгүй.',
  blocked: 'Таны бүртгэл түр хаагдсан байна.',
  product_not_found: 'Ийм эрх олдсонгүй.',
  movie_required: 'Кино сонгоно уу.',
  too_many_open: 'Танд дуусаагүй 3 төлбөрийн хүсэлт байна. Эхлээд тэдгээрийг дуусгана уу.',
  rate_limited: 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.',
  invalid_period: 'Хугацааг зөв оруулна уу (өнөөдрөөс хойш).',
}
export const fail = (error) => new Error(ERROR_TEXT[error?.message?.trim()] || 'Алдаа гарлаа. Дахин оролдоно уу.')

export function need() {
  if (!supabase) throw new Error('Сервер тохируулаагүй байна. README-ийн дагуу .env файлаа бөглөнө үү.')
  return supabase
}

// Нэвтэрсэн хэрэглэгчийн token-тэй /api/... дуудлага.
export async function api(path, options = {}) {
  const { data } = await need().auth.getSession()
  const headers = { ...options.headers }
  if (data.session) headers.authorization = `Bearer ${data.session.access_token}`
  const res = await fetch(path, { ...options, headers }).catch(() => null)
  if (!res) throw new Error('Сервертэй холбогдож чадсангүй. Дахин оролдоно уу.')
  const json = await res.json().catch(() => null)
  if (!res.ok || !json || json.error) {
    const e = new Error(json?.error || 'Алдаа гарлаа. Дахин оролдоно уу.')
    e.status = res.status
    throw e
  }
  return json
}

/* Нэвтрэлт */

export const isValidEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim())

export async function sendCode(email) {
  const { error } = await need().auth.signInWithOtp({ email: email.trim().toLowerCase(), options: { shouldCreateUser: true } })
  if (error) {
    throw new Error(error.status === 429 ? 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.' : 'Код илгээж чадсангүй. Дахин оролдоно уу.')
  }
}

export async function verifyCode(email, code) {
  const { error } = await need().auth.verifyOtp({ email: email.trim().toLowerCase(), token: code, type: 'email' })
  if (error) throw new Error('Код буруу эсвэл хугацаа нь дууссан байна.')
  const u = await loadUser()
  if (!u) throw new Error('Нэвтэрч чадсангүй. Дахин оролдоно уу.')
  if (u.blocked) {
    await logout()
    throw new Error(ERROR_TEXT.blocked)
  }
  return u
}

// me() → апп доторх хэрэглэгчийн хэлбэр.
function toUser(m) {
  const until = m.subscription_until || m.last_subscription_end
  return {
    id: m.id,
    email: m.email,
    name: m.name || 'Хэрэглэгч',
    createdAt: m.created_at,
    role: m.is_admin ? 'admin' : undefined,
    blocked: m.blocked,
    subscription: until
      ? { label: m.subscription_source === 'admin' ? 'Админ олгосон эрх' : 'Сарын эрх', endsAt: until }
      : null,
    rentals: m.rentals || [],
  }
}

// Серверээс хэрэглэгчийн мэдээллийг дахин уншина. Нэвтрээгүй бол null.
export async function loadUser() {
  if (!supabase) return null
  const { data: s } = await supabase.auth.getSession()
  if (!s.session) {
    write(USER_KEY, null)
    return null
  }
  const { data, error } = await supabase.rpc('me')
  // Сүлжээ тасарсан бол хадгалсан мэдээллээр үргэлжилнэ.
  if (error) return currentUser()
  const u = data ? toUser(data) : null
  write(USER_KEY, u)
  return u
}

// Сүүлд уншсан хэрэглэгч (хуудас нээгдэхэд шууд харуулна, дараа нь loadUser шинэчилнэ).
export function currentUser() {
  const u = configured ? read(USER_KEY, null) : null
  return u && !u.blocked ? { ...u } : null
}

// Нэвтрэх/гарах бүрт (өөр tab-д ч) дуудагдана.
export function onAuthChange(fn) {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
      // Supabase-ийн callback дотроос шууд дуудвал түгжирнэ.
      setTimeout(() => loadUser().then(fn).catch(() => {}), 0)
    }
  })
  return () => data.subscription.unsubscribe()
}

export async function logout() {
  write(USER_KEY, null)
  await supabase?.auth.signOut().catch(() => {})
}

export async function updateName(user, name) {
  const display = name.trim().slice(0, 80)
  if (!display || display === user.name) return user
  const { error } = await need().from('profiles').update({ display_name: display }).eq('id', user.id)
  if (error) throw fail(error)
  const u = { ...user, name: display }
  write(USER_KEY, u)
  return u
}

/* Эрх */

export const isAdmin = (user) => user?.role === 'admin'

export function isActive(user) {
  return Boolean(user?.subscription && new Date(user.subscription.endsAt) > new Date())
}

export function daysLeft(user) {
  if (!isActive(user)) return 0
  return Math.ceil((new Date(user.subscription.endsAt) - new Date()) / 86400000)
}

// Тухайн киноны түрээсийн дуусах хугацаа, идэвхгүй бол null.
export function rentalEndsAt(user, id) {
  const r = (user?.rentals || []).find((x) => x.id === id)
  return r && new Date(r.endsAt) > new Date() ? r.endsAt : null
}

export const activeRentals = (user) => (user?.rentals || []).filter((r) => new Date(r.endsAt) > new Date())

// Сарын эрх эсвэл тухайн киноны түрээс байвал үзэж болно (сервер дахин шалгана).
export const canWatchMovie = (user, id) => isActive(user) || Boolean(rentalEndsAt(user, id))

/* Төлбөр */

export const PAYMENT_STATUS_TEXT = {
  created: 'Төлбөр хүлээгдэж байна',
  submitted: 'Шалгаж байна',
  approved: 'Батлагдсан',
  rejected: 'Татгалзсан',
  expired: 'Хугацаа дууссан',
}

const PAYMENT_COLUMNS = 'id, product, movie_id, movie_title, ref_code, amount_mnt, status, reject_reason, created_at, decided_at, products(title)'

// KT-1234 гүйлгээний утгатай хүсэлт үүсгэнэ. Ижил нээлттэй хүсэлт байвал түүнийг буцаана.
export async function createPayment(kind, movie) {
  const args = kind === 'rent' ? { p_product: 'rent', p_movie_id: movie.id, p_movie_title: movie.title } : { p_product: 'month' }
  const { data, error } = await need().rpc('create_payment_request', args)
  if (error) throw fail(error)
  return (await getPayment(data.id)) || data
}

// Энэ эрхийн дуусаагүй хүсэлт (хуудсыг дахин нээхэд).
export async function findOpenPayment(kind, movieId) {
  let q = need().from('payment_requests').select(PAYMENT_COLUMNS).eq('product', kind).in('status', ['created', 'submitted'])
  q = kind === 'rent' ? q.eq('movie_id', movieId) : q.is('movie_id', null)
  const { data, error } = await q.order('created_at', { ascending: false }).limit(1)
  if (error) throw fail(error)
  return data.find((p) => effectiveStatus(p) !== 'expired') || null
}

export async function getPayment(id) {
  const { data, error } = await need().from('payment_requests').select(PAYMENT_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw fail(error)
  return data
}

export async function listPayments() {
  const { data, error } = await need()
    .from('payment_requests')
    .select(PAYMENT_COLUMNS)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw fail(error)
  return data
}

// "Гүйлгээ хийсэн" дараагүй хүсэлт 24 цагийн дараа хүчингүй (сервер ч мөн адил).
export function effectiveStatus(p) {
  return p.status === 'created' && Date.now() - new Date(p.created_at) > 24 * 3600_000 ? 'expired' : p.status
}

// "Гүйлгээ хийсэн": created → submitted, админд Telegram мессеж (functions/api/payments/[id]/submit.js).
export async function submitPayment(id) {
  const json = await api(`/api/payments/${encodeURIComponent(id)}/submit`, { method: 'POST' })
  return json.status
}

// Төлөв өөрчлөгдөхийг Realtime-аар, 10 секунд тутмын шалгалтаар нөөцлөн хүлээнэ.
export function watchPayment(id, onChange) {
  const sb = need()
  let stopped = false
  const refresh = () => getPayment(id).then((p) => !stopped && p && onChange(p)).catch(() => {})
  const channel = sb.channel(`payment:${id}`)
  sb.auth.getSession().then(({ data }) => {
    if (stopped) return
    if (data.session) sb.realtime.setAuth(data.session.access_token)
    channel
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'payment_requests', filter: `id=eq.${id}` }, refresh)
      .subscribe((state) => {
        // Холбогдохоос өмнө шийдвэрлэгдсэн байж болзошгүй.
        if (state === 'SUBSCRIBED') refresh()
      })
  })
  const timer = setInterval(refresh, POLL_MS)
  return () => {
    stopped = true
    clearInterval(timer)
    sb.removeChannel(channel)
  }
}

/* Видео */

// R2 дээрх видеоны хугацаатай линк. Видео сервер тохируулаагүй (локал хөгжүүлэлт) бол json доторх замаар.
export async function videoUrl(item, kind = 'movie') {
  if (!configured) return item.video
  const q = kind === 'short' ? '?kind=short' : ''
  try {
    const { url } = await api(`/api/video/${encodeURIComponent(item.id)}${q}`)
    return url
  } catch (e) {
    if (e.status === 503 || (import.meta.env.DEV && e.status === 404)) return item.video
    throw e
  }
}

// Үзэлт бүртгэх (админы "Үзэлт" хэсэгт). Алдаа гарсан ч үзэхэд саад болохгүй.
export function recordView(user, movieId, done = false) {
  if (!user || !supabase) return
  supabase.rpc('record_view', { p_movie_id: movieId, p_done: done }).then(() => {}, () => {})
}

/* Үзсэн түүх, дараа үзэх: хөтөч дээр, хэрэглэгч бүрт тусдаа. */

const historyKey = (user) => (user ? `${GUEST_HISTORY_KEY}-${user.id}` : GUEST_HISTORY_KEY)
const laterKey = (user) => `kino-later-${user.id}`

export function getHistory(user) {
  return read(historyKey(user), []).map((x) => (typeof x === 'string' ? { id: x, at: null } : x))
}

// Хадгалаад шинэ user объект буцаана (дахин зурахад), зочин бол null.
function saveHistory(user, list) {
  write(historyKey(user), list)
  return user ? { ...user } : null
}

// Үзэж эхэлсэн киног түүхийн эхэнд гаргана. Өмнөх байрлалыг (pos) хадгална.
export function pushHistory(user, id) {
  const old = getHistory(user).find((x) => x.id === id)
  const entry = { ...old, id, at: new Date().toISOString() }
  return saveHistory(user, [entry, ...getHistory(user).filter((x) => x.id !== id)].slice(0, 100))
}

// Хаана хүртэл үзсэнийг (секунд) хадгална. Төгсгөлд ойртвол дууссан гэж үзнэ.
export function saveProgress(user, id, pos, dur) {
  if (!dur || !isFinite(dur)) return null
  const done = pos > dur - 30 || pos / dur > 0.97
  const list = getHistory(user).map((x) =>
    x.id === id ? { ...x, pos: done ? 0 : Math.floor(pos), dur: Math.floor(dur), done } : x,
  )
  return saveHistory(user, list)
}

// Үзсэн хэсгийн харьцаа (0..1), картын улаан зурвасанд.
export function watchedRatio(h) {
  if (!h) return 0
  if (h.done) return 1
  return h.dur ? Math.min(1, (h.pos || 0) / h.dur) : 0
}

export function getProgress(user, id) {
  return getHistory(user).find((x) => x.id === id) || null
}

export function removeHistory(user, id) {
  return saveHistory(user, getHistory(user).filter((x) => x.id !== id))
}

export function clearHistory(user) {
  return saveHistory(user, [])
}

// Сүүлд нэмсэн нь эхэндээ.
export function getLater(user) {
  return user ? read(laterKey(user), []) : []
}

export const isLater = (user, id) => getLater(user).some((x) => x.id === id)

export function toggleLater(user, id) {
  const list = getLater(user)
  const next = list.some((x) => x.id === id)
    ? list.filter((x) => x.id !== id)
    : [{ id, at: new Date().toISOString() }, ...list].slice(0, 200)
  write(laterKey(user), next)
  return { ...user }
}

/* Формат */

export function formatDate(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`
}

export function formatDateTime(iso) {
  const d = new Date(iso)
  const pad = (n) => String(n).padStart(2, '0')
  return `${formatDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export const formatMoney = (n) => `${Number(n || 0).toLocaleString('en-US')}₮`

// Нэвтэрч, эрх авсны дараа буцаж орох кино (30 минутын дотор).
export function setReturnTo(movieId) {
  write(RETURN_KEY, { id: movieId, at: Date.now() })
}

export function peekReturnTo() {
  const r = read(RETURN_KEY, null)
  return r && Date.now() - r.at < 30 * 60000 ? r.id : null
}

export function takeReturnTo() {
  const id = peekReturnTo()
  write(RETURN_KEY, null)
  return id
}
