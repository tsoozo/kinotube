// Telegram webhook: админ ✅/❌ товчоор баталж/татгалзана, татгалзсан мессежид хариу бичвэл шалтгаан болно.
import { adminName, decodePaymentCallback, parseAdminIds, timingSafeEqual } from '../../../server/telegram.js'
import { json, serviceClient, syncTelegramDecision, telegram } from '../../../server/core.js'

export async function onRequestPost({ request, env }) {
  const expected = env.TELEGRAM_WEBHOOK_SECRET ?? ''
  const got = request.headers.get('x-telegram-bot-api-secret-token') ?? ''
  if (!expected || !timingSafeEqual(got, expected)) return json({ error: 'unauthorized' }, 401)

  const update = await request.json().catch(() => null)
  try {
    if (update?.callback_query) await onCallback(env, update.callback_query)
    else if (update?.message) await onMessage(env, update.message)
  } catch (e) {
    console.error('telegram webhook', e)
  }
  // Telegram дахин илгээхгүйн тулд үргэлж 200; алдааг лог-д бичнэ.
  return json({ ok: true })
}

async function onCallback(env, cq) {
  const tg = telegram(env)
  let answer = ''
  try {
    if (!parseAdminIds(env.ADMIN_TELEGRAM_IDS).has(cq.from.id)) {
      answer = 'Эрхгүй'
      return
    }
    const parsed = decodePaymentCallback(cq.data)
    if (!parsed) {
      answer = 'Буруу хүсэлт'
      return
    }
    const db = serviceClient(env)
    const fn = parsed.action === 'approve' ? 'approve_payment' : 'reject_payment'
    const { data: result, error } = await db.rpc(fn, { p_request_id: parsed.requestId, p_admin_telegram_id: cq.from.id })
    if (error) throw new Error(error.message)

    if (result.ok) {
      await syncTelegramDecision(env, parsed.requestId, adminName(cq.from))
      answer = result.already ? 'Аль хэдийн шийдвэрлэсэн' : parsed.action === 'approve' ? 'Батлагдлаа' : 'Татгалзлаа'
    } else {
      answer = `Өөрчлөх боломжгүй (${result.status})`
    }
  } catch (e) {
    console.error('telegram callback', e)
    answer = 'Алдаа гарлаа'
  } finally {
    // Товч эргэлдсээр байхгүйн тулд үргэлж хариулна.
    await tg?.answerCallbackQuery(cq.id, answer || undefined).catch(() => {})
  }
}

async function onMessage(env, m) {
  if (!m.from || !parseAdminIds(env.ADMIN_TELEGRAM_IDS).has(m.from.id)) return
  const replyTo = m.reply_to_message?.message_id
  const text = m.text?.trim()
  if (!replyTo || !text) return

  const db = serviceClient(env)
  const { data: r } = await db
    .from('payment_requests')
    .select('id, ref_code, status')
    .eq('telegram_chat_id', m.chat.id)
    .eq('telegram_message_id', replyTo)
    .maybeSingle()
  if (!r) return

  const tg = telegram(env)
  if (r.status !== 'rejected') {
    await tg?.sendMessage(m.chat.id, `${r.ref_code}: шалтгааныг зөвхөн татгалзсан хүсэлтэд бичнэ.`)
    return
  }
  await db.rpc('set_payment_reject_reason', { p_request_id: r.id, p_reason: text })
  await tg?.sendMessage(m.chat.id, `${r.ref_code}: шалтгаан хадгалагдлаа.`)
}
