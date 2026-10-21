// Серверийн туслах функцууд (Vercel Functions).
// "_" -ээр эхэлсэн тул Vercel үүнийг тусдаа endpoint болгохгүй.
import { createClient } from '@supabase/supabase-js'
import { TelegramClient, decidedMessage, paymentKeyboard, paymentRequestMessage } from './telegram.js'

const env = (name) => process.env[name] ?? ''
const supabaseUrl = () => env('SUPABASE_URL') || env('VITE_SUPABASE_URL')
const anonKey = () => env('SUPABASE_ANON_KEY') || env('VITE_SUPABASE_ANON_KEY')

export const config = {
  telegramAdminChatId: () => env('TELEGRAM_ADMIN_CHAT_ID'),
  adminTelegramIds: () => env('ADMIN_TELEGRAM_IDS'),
  telegramWebhookSecret: () => env('TELEGRAM_WEBHOOK_SECRET'),
}

const noSession = { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }

// Service role: RLS-ийг алгасна. Зөвхөн webhook, мэдэгдэлд.
export function serviceClient() {
  if (!supabaseUrl() || !env('SUPABASE_SERVICE_ROLE_KEY')) throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set')
  return createClient(supabaseUrl(), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: noSession })
}

// "Authorization: Bearer <access token>" эзэмшигчийн нэрийн өмнөөс (RLS үйлчилнэ). Токен буруу бол null.
export async function userFromRequest(req) {
  const token = /^Bearer (.+)$/i.exec(req.headers.authorization ?? '')?.[1]?.trim()
  if (!token || !supabaseUrl() || !anonKey()) return null
  const client = createClient(supabaseUrl(), anonKey(), { global: { headers: { Authorization: `Bearer ${token}` } }, auth: noSession })
  const { data, error } = await client.auth.getClaims(token)
  if (error || !data?.claims?.sub) return null
  return { id: data.claims.sub, client }
}

// Бүх instance-д нэгдсэн хязгаар (Postgres дээр). Дэд бүтцийн алдаа гарвал зөвшөөрнө.
export async function allow(key, max, windowSeconds) {
  const { data, error } = await serviceClient().rpc('check_rate_limit', { p_key: key, p_max: max, p_window_seconds: windowSeconds })
  if (error) {
    console.error('rate limit check failed', error.message)
    return true
  }
  return data === true
}

export function telegram() {
  const token = env('TELEGRAM_BOT_TOKEN')
  return token ? new TelegramClient(token, env('TELEGRAM_API_BASE') || 'https://api.telegram.org') : null
}

// Админы мессежид харагдах бүх мэдээлэл.
export async function loadRequestInfo(requestId) {
  const db = serviceClient()
  const { data: r } = await db
    .from('payment_requests')
    .select('id, user_id, ref_code, amount_mnt, status, submitted_at, created_at, decided_at, telegram_chat_id, telegram_message_id, products(title)')
    .eq('id', requestId)
    .maybeSingle()
  if (!r) return null
  const { data: u } = await db.auth.admin.getUserById(r.user_id)
  return {
    ...r,
    input: {
      refCode: r.ref_code,
      email: u?.user?.email ?? null,
      productTitle: r.products?.title ?? '—',
      amountMnt: r.amount_mnt,
      submittedAt: r.submitted_at ?? r.created_at,
    },
  }
}

// "Шинэ төлбөр — KT-…" мессежийг ✅/❌ товчтой илгээж, мессежийн дугаарыг хадгална.
export async function notifyPaymentSubmitted(requestId) {
  const tg = telegram()
  const chatId = config.telegramAdminChatId()
  if (!tg || !chatId) {
    console.warn('Telegram not configured; payment request', requestId, 'is waiting for approval')
    return false
  }
  const info = await loadRequestInfo(requestId)
  if (!info || info.status !== 'submitted') return false
  const msg = await tg.sendMessage(chatId, paymentRequestMessage(info.input), paymentKeyboard(requestId))
  await serviceClient()
    .from('payment_requests')
    .update({ telegram_chat_id: msg.chat.id, telegram_message_id: msg.message_id })
    .eq('id', requestId)
  return true
}

// Шийдвэрийн дараа админы мессежийг засна (товчнууд алга болно).
export async function syncTelegramDecision(requestId, by) {
  const tg = telegram()
  const info = await loadRequestInfo(requestId)
  if (!tg || !info?.telegram_chat_id || !info.telegram_message_id) return
  if (info.status !== 'approved' && info.status !== 'rejected') return
  try {
    await tg.editMessageText(info.telegram_chat_id, info.telegram_message_id,
      decidedMessage(info.input, info.status, by, info.decided_at ? new Date(info.decided_at) : new Date()))
  } catch (e) {
    console.warn('editMessageText', e.message)
  }
}

export const ERROR_TEXT = {
  not_authenticated: 'Нэвтэрнэ үү.',
  not_found: 'Олдсонгүй.',
  rate_limited: 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.',
}
export const errorText = (error) => ERROR_TEXT[error?.message?.trim()] || 'Алдаа гарлаа. Дахин оролдоно уу.'
