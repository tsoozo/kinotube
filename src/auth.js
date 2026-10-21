// Хэрэглэгч, үзэх эрх, төлбөр KinoTube-ийн Supabase төсөл дээр хадгалагдана (supabase/migrations).
// Нэвтрэлт: имэйлээр ирэх 6 оронтой код. Төлбөр: банкны шилжүүлэг → "Гүйлгээ хийсэн" →
// Telegram бот руу ✅/❌ товчтой мессеж (api/) → админ баталмагц эрх нээгдэнэ.
// Үнэ, эрх олгох бүх шийдвэрийг сервер (Postgres функцууд) гаргана.
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || ''
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// Төлбөр хүлээн авах данс. Төлбөрийн дэлгэц дээр харагдана.
export const BANK = {
  name: 'Хаан банк',
  accountNumber: '600005005303317077',
  accountHolder: 'Батмэнд Хишигцогзол',
}
export const configured = Boolean(SUPABASE_URL && SUPABASE_KEY)
export const supabase = configured ? createClient(SUPABASE_URL, SUPABASE_KEY) : null

const GUEST_HISTORY_KEY = 'kino-history'
const POLL_MS = 10_000

// SQL функцуудын алдааны кодыг монгол текст болгоно.
const ERROR_TEXT = {
  not_authenticated: 'Нэвтэрнэ үү.',
  not_found: 'Олдсонгүй.',
  product_not_found: 'Бүтээгдэхүүн олдсонгүй.',
  too_many_open: 'Танд дуусаагүй 3 төлбөрийн хүсэлт байна. Эхлээд тэдгээрийг дуусгана уу.',
  rate_limited: 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.',
  forbidden: 'Эрхгүй.',
}
const fail = (error) => new Error(ERROR_TEXT[error?.message?.trim()] || 'Алдаа гарлаа. Дахин оролдоно уу.')

function need() {
  if (!supabase) throw new Error('Сервер тохируулаагүй байна. README-ийн дагуу .env файлаа бөглөнө үү.')
  return supabase
}

export const PAYMENT_STATUS_TEXT = {
  created: 'Төлбөр хүлээгдэж байна',
  submitted: 'Шалгаж байна',
  approved: 'Батлагдсан',
  rejected: 'Татгалзсан',
  expired: 'Хугацаа дууссан',
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
  return loadUser()
}

// Нэвтэрсэн хэрэглэгч: нэр, имэйл, KinoTube-ийн эрх хэзээ хүртэл.
export async function loadUser() {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  const u = data.session?.user
  if (!u) return null
  const [{ data: profile }, { data: until }] = await Promise.all([
    supabase.from('profiles').select('display_name, created_at').eq('id', u.id).maybeSingle(),
    supabase.rpc('my_access_until'),
  ])
  return {
    id: u.id,
    email: u.email,
    name: profile?.display_name || u.email?.split('@')[0] || 'Хэрэглэгч',
    createdAt: profile?.created_at || u.created_at,
    accessUntil: until || null,
  }
}

export async function logout() {
  await supabase?.auth.signOut()
}

export async function updateName(user, name) {
  const display = name.trim()
  if (!display || display === user.name) return user
  const { error } = await need().from('profiles').update({ display_name: display.slice(0, 80) }).eq('id', user.id)
  if (error) throw fail(error)
  return { ...user, name: display }
}

/* Эрх */

export function isActive(user) {
  return Boolean(user?.accessUntil && new Date(user.accessUntil) > new Date())
}

export function daysLeft(user) {
  if (!isActive(user)) return 0
  return Math.ceil((new Date(user.accessUntil) - new Date()) / 86400000)
}

/* Төлбөр */

// Үнэ products хүснэгтээс; Supabase → Table Editor → products дээр өөрчилнө.
export async function listPlans() {
  const { data, error } = await need()
    .from('products')
    .select('code, title, description, price_mnt, duration_days')
    .eq('active', true)
    .order('sort_order')
  if (error) throw fail(error)
  return data
}

// KT-1234 гүйлгээний утгатай хүсэлт үүсгэнэ. Дүнг сервер products-оос авна.
export async function createPayment(productCode) {
  const { data, error } = await need().rpc('create_payment_request', { p_product_code: productCode })
  if (error) throw fail(error)
  return data
}

const PAYMENT_COLUMNS = 'id, ref_code, amount_mnt, status, reject_reason, created_at, products(title)'

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

// Баталгаажуулаагүй хүсэлт 24 цагийн дараа хүчингүй болно (сервер ч мөн адил).
export function effectiveStatus(p) {
  return p.status === 'created' && Date.now() - new Date(p.created_at) > 24 * 3600_000 ? 'expired' : p.status
}


// "Гүйлгээ хийсэн": created → submitted, Telegram руу админд мэдэгдэнэ (api/payments/[id]/submit.js).
export async function submitPayment(id) {
  const { data } = await need().auth.getSession()
  if (!data.session) throw new Error('Нэвтэрнэ үү.')
  const res = await fetch(`/api/payments/${encodeURIComponent(id)}/submit`, {
    method: 'POST',
    headers: { authorization: `Bearer ${data.session.access_token}` },
  }).catch(() => null)
  if (!res) throw new Error('Сервертэй холбогдож чадсангүй. Дахин оролдоно уу.')
  const json = await res.json().catch(() => null)
  if (!json || json.error) throw new Error(json?.error || 'Алдаа гарлаа. Дахин оролдоно уу.')
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
        // Сувагт холбогдохоос өмнө шийдвэрлэгдсэн байж болзошгүй.
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

/* Үзсэн түүх: хөтөч дээр, хэрэглэгч бүрт тусдаа. */

const historyKey = (user) => (user ? `${GUEST_HISTORY_KEY}:${user.id}` : GUEST_HISTORY_KEY)

export function getHistory(user) {
  try {
    const list = JSON.parse(localStorage.getItem(historyKey(user)) || '[]')
    return list.map((x) => (typeof x === 'string' ? { id: x, at: null } : x))
  } catch {
    return []
  }
}

export function pushHistory(user, id) {
  const list = [{ id, at: new Date().toISOString() }, ...getHistory(user).filter((x) => x.id !== id)].slice(0, 50)
  try {
    localStorage.setItem(historyKey(user), JSON.stringify(list))
  } catch {
    // Хадгалах боломжгүй (хувийн цонх г.м.) үед түүх хадгалагдахгүй.
  }
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

export const formatMoney = (n) => `${n.toLocaleString('en-US')}₮`
