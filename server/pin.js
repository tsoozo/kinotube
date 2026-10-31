// Утас + 4 оронтой кодоор нэвтрэх. Supabase auth-д имэйл хэрэгтэй тул далд имэйл ашиглана
// (хэрэглэгчид харагдахгүй, имэйл илгээгдэхгүй). Код Postgres-д bcrypt-ээр (private.pin_logins).
import { createClient } from '@supabase/supabase-js'
import { allow, json, serviceClient } from './core.js'

export const PHONE_RE = /^[0-9]{8}$/
export const PIN_RE = /^[0-9]{4}$/

const TOO_MANY = 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.'

const randomHex = (bytes) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('')

// Далд имэйл: SQL-ийн private.is_hidden_email-тэй таарна.
export const hiddenEmail = () => `u-${randomHex(12)}@kinotube.pages.dev`

const ip = (request) => request.headers.get('cf-connecting-ip') || 'unknown'

// { phone, pin, name } уншиж шалгана, эсвэл алдааны Response.
export async function readBody(request) {
  const body = await request.json().catch(() => null)
  const phone = String(body?.phone ?? '').replace(/\D/g, '')
  const pin = String(body?.pin ?? '')
  if (!PHONE_RE.test(phone)) return { error: json({ error: 'Утасны дугаараа 8 оронтойгоор оруулна уу.' }, 400) }
  if (!PIN_RE.test(pin)) return { error: json({ error: '4 оронтой кодоо оруулна уу.' }, 400) }
  return { phone, pin, name: String(body?.name ?? '').trim().slice(0, 80) }
}

export async function limited(env, request, key, max, seconds) {
  return !(await allow(env, `${key}:${ip(request)}`, max, seconds))
}

export const tooMany = () => json({ error: TOO_MANY }, 429)

// Хэрэглэгчид шинэ session (access + refresh token) үүсгэнэ. Нууц үг ашиглахгүй:
// админ magic link-ийн token-ийг имэйл илгээлгүйгээр шууд баталгаажуулна.
export async function createSession(env, userId) {
  const db = serviceClient(env)
  const { data: u, error: userError } = await db.auth.admin.getUserById(userId)
  if (userError || !u?.user?.email) throw new Error(userError?.message || 'user has no email')
  const { data: link, error: linkError } = await db.auth.admin.generateLink({ type: 'magiclink', email: u.user.email })
  if (linkError) throw new Error(linkError.message)
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY
  const anon = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
  const { data, error } = await anon.auth.verifyOtp({ token_hash: link.properties.hashed_token, type: 'magiclink' })
  if (error || !data.session) throw new Error(error?.message || 'no session')
  return { access_token: data.session.access_token, refresh_token: data.session.refresh_token }
}
