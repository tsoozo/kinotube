// Cloudflare Pages Functions-ийн туслах функцууд. env = context.env (Pages-ийн Variables and Secrets).
import { createClient } from '@supabase/supabase-js'
import { TelegramClient, decidedMessage, paymentKeyboard, paymentRequestMessage } from './telegram.js'

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
const supabaseUrl = (env) => env.SUPABASE_URL || env.VITE_SUPABASE_URL
const anonKey = (env) => env.SUPABASE_ANON_KEY || env.VITE_SUPABASE_ANON_KEY

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } })

// Service role: RLS-ийг алгасна. Зөвхөн сервер дээр.
export function serviceClient(env) {
  if (!supabaseUrl(env) || !env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(supabaseUrl(env), env.SUPABASE_SERVICE_ROLE_KEY, { auth: noSession })
}

// "Authorization: Bearer <access token>" → хэрэглэгч (RLS-тэй client-тэй хамт), эсвэл null.
export async function userFromRequest(request, env) {
  const token = /^Bearer (.+)$/i.exec(request.headers.get('authorization') ?? '')?.[1]?.trim()
  if (!token || !supabaseUrl(env) || !anonKey(env)) return null
  const client = createClient(supabaseUrl(env), anonKey(env), { global: { headers: { Authorization: `Bearer ${token}` } }, auth: noSession })
  const { data, error } = await client.auth.getClaims(token)
  if (error || !data?.claims?.sub) return null
  return { id: data.claims.sub, client }
}

// Админ эсэхийг серверт шалгана: { user, me } эсвэл алдааны Response.
export async function requireAdmin(request, env) {
  const user = await userFromRequest(request, env)
  if (!user) return { error: json({ error: 'Нэвтэрнэ үү.' }, 401) }
  const { data: me } = await user.client.rpc('me')
  if (!me?.is_admin) return { error: json({ error: 'Эрхгүй.' }, 403) }
  return { user, me }
}

// Админы группт энгийн мессеж (тохируулаагүй бол алгасна).
export async function notifyAdmins(env, text) {
  const tg = telegram(env)
  if (!tg || !env.TELEGRAM_ADMIN_CHAT_ID) return
  await tg.sendMessage(env.TELEGRAM_ADMIN_CHAT_ID, text).catch((e) => console.error('telegram notify', e.message))
}

// Бүх instance-д нэгдсэн хязгаар (Postgres дээр). Алдаа гарвал зөвшөөрнө.
export async function allow(env, key, max, windowSeconds) {
  const { data, error } = await serviceClient(env).rpc('check_rate_limit', { p_key: key, p_max: max, p_window_seconds: windowSeconds })
  if (error) {
    console.error('rate limit check failed', error.message)
    return true
  }
  return data === true
}

export function telegram(env) {
  return env.TELEGRAM_BOT_TOKEN ? new TelegramClient(env.TELEGRAM_BOT_TOKEN, env.TELEGRAM_API_BASE || 'https://api.telegram.org') : null
}

// Админы мессежид харагдах мэдээлэл.
export async function loadRequestInfo(env, requestId) {
  const db = serviceClient(env)
  const { data: r, error } = await db
    .from('payment_requests')
    .select('id, user_id, ref_code, amount_mnt, status, movie_title, submitted_at, created_at, decided_at, telegram_chat_id, telegram_message_id, products(title)')
    .eq('id', requestId)
    .maybeSingle()
  if (error) console.error('loadRequestInfo', requestId, error.message)
  if (!r) return null
  const { data: u, error: userError } = await db.auth.admin.getUserById(r.user_id)
  if (userError) console.error('getUserById', userError.message)
  return {
    ...r,
    input: {
      refCode: r.ref_code,
      email: u?.user?.email ?? null,
      productTitle: r.products?.title ?? '—',
      movieTitle: r.movie_title,
      amountMnt: r.amount_mnt,
      submittedAt: r.submitted_at ?? r.created_at,
    },
  }
}

// "Шинэ төлбөр — KT-…" мессежийг ✅/❌ товчтой илгээж, мессежийн дугаарыг хадгална.
export async function notifyPaymentSubmitted(env, requestId) {
  const tg = telegram(env)
  if (!tg || !env.TELEGRAM_ADMIN_CHAT_ID) {
    console.warn('Telegram not configured; payment request', requestId, 'is waiting in the admin panel')
    return false
  }
  const info = await loadRequestInfo(env, requestId)
  if (!info || info.status !== 'submitted') {
    console.warn('payment request', requestId, 'not found or not submitted; Telegram message skipped')
    return false
  }
  const msg = await tg.sendMessage(env.TELEGRAM_ADMIN_CHAT_ID, paymentRequestMessage(info.input), paymentKeyboard(requestId))
  await serviceClient(env)
    .from('payment_requests')
    .update({ telegram_chat_id: msg.chat.id, telegram_message_id: msg.message_id })
    .eq('id', requestId)
  return true
}

// Шийдвэрийн дараа админы мессежийг засна (товчнууд алга болно).
export async function syncTelegramDecision(env, requestId, by) {
  const tg = telegram(env)
  const info = await loadRequestInfo(env, requestId)
  if (!tg || !info?.telegram_chat_id || !info.telegram_message_id) return
  if (info.status !== 'approved' && info.status !== 'rejected') return
  try {
    await tg.editMessageText(info.telegram_chat_id, info.telegram_message_id,
      decidedMessage(info.input, info.status, by, info.decided_at ? new Date(info.decided_at) : new Date()))
  } catch (e) {
    console.warn('editMessageText', e.message)
  }
}

const ERROR_TEXT = {
  not_authenticated: 'Нэвтэрнэ үү.',
  not_found: 'Олдсонгүй.',
  rate_limited: 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.',
}
export const errorText = (error) => ERROR_TEXT[error?.message?.trim()] || 'Алдаа гарлаа. Дахин оролдоно уу.'

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/
