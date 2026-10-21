// Хэрэглэгч, данс, эрхийн мэдээллийг хөтөч дотор (localStorage) хадгална.
// Энэ бол сервергүй туршилтын хувилбар: жинхэнэ сайтад эдгээр функцийг
// серверийн API дуудлагаар солих хэрэгтэй (SMS илгээх, төлбөр авах, код шалгах).

const USERS_KEY = 'kino-users'
const SESSION_KEY = 'kino-session'
const GUEST_HISTORY_KEY = 'kino-history'

let memory = {}

function read(key, fallback) {
  try {
    const v = localStorage.getItem(key)
    return v === null ? fallback : JSON.parse(v)
  } catch {
    return key in memory ? memory[key] : fallback
  }
}

function write(key, value) {
  memory[key] = value
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Хадгалах боломжгүй үед санах ойд л үлдэнэ.
  }
}

export const PLANS = [
  { id: '1m', label: '1 сарын эрх', months: 1, price: 9900 },
  { id: '3m', label: '3 сарын эрх', months: 3, price: 24900 },
  { id: '12m', label: '1 жилийн эрх', months: 12, price: 89000 },
]

export const TOPUP_AMOUNTS = [5000, 10000, 20000, 50000]

export const DEMO = { phone: '99112233', pin: '1234' }

function seed() {
  const users = read(USERS_KEY, null)
  if (users) return users
  const demo = {
    phone: DEMO.phone,
    pin: DEMO.pin,
    name: 'Туршилтын хэрэглэгч',
    createdAt: '2026-09-01T10:00:00.000Z',
    balance: 15000,
    subscription: { plan: '1m', label: '1 сарын эрх', endsAt: '2026-11-01T15:00:00.000Z' },
    transactions: [
      { at: '2026-10-01T09:12:00.000Z', type: 'topup', amount: 20000, note: 'Данс цэнэглэлт' },
      { at: '2026-10-01T09:13:00.000Z', type: 'plan', amount: -9900, note: '1 сарын эрх' },
      { at: '2026-10-15T18:40:00.000Z', type: 'topup', amount: 5000, note: 'Данс цэнэглэлт' },
    ],
    history: [
      { id: 'nosferatu', at: '2026-10-19T21:05:00.000Z', pos: 2130, dur: 5640 },
      { id: 'the-general', at: '2026-10-18T19:30:00.000Z', pos: 0, dur: 4520, done: true },
    ],
  }
  const initial = { [DEMO.phone]: demo }
  write(USERS_KEY, initial)
  return initial
}

const users = () => seed()
const saveUser = (u) => write(USERS_KEY, { ...users(), [u.phone]: u })

export const normalizePhone = (s) => s.replace(/\D/g, '')
export const isValidPhone = (s) => /^[6-9]\d{7}$/.test(normalizePhone(s))
export const isValidPin = (s) => /^\d{4}$/.test(s)

export function currentUser() {
  const phone = read(SESSION_KEY, null)
  return (phone && users()[phone]) || null
}

export function userExists(phone) {
  return Boolean(users()[normalizePhone(phone)])
}

export function login(phone, pin) {
  const u = users()[normalizePhone(phone)]
  if (!u) throw new Error('Энэ дугаараар бүртгэл олдсонгүй. Эхлээд бүртгүүлнэ үү.')
  if (u.pin !== pin) throw new Error('Код буруу байна. Дахин оролдоно уу.')
  write(SESSION_KEY, u.phone)
  return u
}

export function register(phone, name, pin) {
  const p = normalizePhone(phone)
  if (users()[p]) throw new Error('Энэ дугаар бүртгэлтэй байна. Нэвтэрнэ үү.')
  const u = {
    phone: p,
    pin,
    name: name.trim() || 'Хэрэглэгч',
    createdAt: new Date().toISOString(),
    balance: 0,
    subscription: null,
    transactions: [],
    history: [],
  }
  saveUser(u)
  write(SESSION_KEY, p)
  return u
}

export function logout() {
  write(SESSION_KEY, null)
}

// Код мартсан: SMS-ээр илгээх баталгаажуулах кодыг туршилтад дэлгэцэнд харуулна.
let pendingReset = null

export function requestReset(phone) {
  const p = normalizePhone(phone)
  if (!users()[p]) throw new Error('Энэ дугаараар бүртгэл олдсонгүй.')
  const code = String(Math.floor(100000 + Math.random() * 900000))
  pendingReset = { phone: p, code, expires: Date.now() + 5 * 60 * 1000 }
  return code
}

export function confirmReset(smsCode, newPin) {
  if (!pendingReset || Date.now() > pendingReset.expires) throw new Error('Кодын хугацаа дууссан. Дахин код авна уу.')
  if (smsCode !== pendingReset.code) throw new Error('Баталгаажуулах код буруу байна.')
  const u = { ...users()[pendingReset.phone], pin: newPin }
  saveUser(u)
  write(SESSION_KEY, u.phone)
  pendingReset = null
  return u
}

export function updateName(user, name) {
  const u = { ...user, name: name.trim() || user.name }
  saveUser(u)
  return u
}

export function changePin(user, oldPin, newPin) {
  if (user.pin !== oldPin) throw new Error('Одоогийн код буруу байна.')
  const u = { ...user, pin: newPin }
  saveUser(u)
  return u
}

export function topUp(user, amount) {
  const u = {
    ...user,
    balance: user.balance + amount,
    transactions: [{ at: new Date().toISOString(), type: 'topup', amount, note: 'Данс цэнэглэлт' }, ...user.transactions],
  }
  saveUser(u)
  return u
}

function addMonths(date, months) {
  const d = new Date(date)
  d.setMonth(d.getMonth() + months)
  return d
}

// Эрх идэвхтэй байвал дуусах хугацаан дээр нь нэмж сунгана.
export function buyPlan(user, planId) {
  const plan = PLANS.find((p) => p.id === planId)
  if (user.balance < plan.price) throw new Error('Дансны үлдэгдэл хүрэлцэхгүй байна. Эхлээд данс цэнэглэнэ үү.')
  const base = isActive(user) ? new Date(user.subscription.endsAt) : new Date()
  const u = {
    ...user,
    balance: user.balance - plan.price,
    subscription: { plan: plan.id, label: plan.label, endsAt: addMonths(base, plan.months).toISOString() },
    transactions: [{ at: new Date().toISOString(), type: 'plan', amount: -plan.price, note: plan.label }, ...user.transactions],
  }
  saveUser(u)
  return u
}

export function isActive(user) {
  return Boolean(user?.subscription && new Date(user.subscription.endsAt) > new Date())
}

export function daysLeft(user) {
  if (!isActive(user)) return 0
  return Math.ceil((new Date(user.subscription.endsAt) - new Date()) / 86400000)
}

// Үзсэн түүх: нэвтэрсэн бол хэрэглэгч бүрт тусдаа, үгүй бол хөтөч дээр.
export function getHistory(user) {
  if (user) return user.history || []
  return read(GUEST_HISTORY_KEY, []).map((x) => (typeof x === 'string' ? { id: x, at: null } : x))
}

function saveHistory(user, list) {
  if (user) {
    const u = { ...users()[user.phone], history: list }
    saveUser(u)
    return u
  }
  write(GUEST_HISTORY_KEY, list)
  return null
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

export const formatPhone = (p) => `${p.slice(0, 4)} ${p.slice(4)}`
