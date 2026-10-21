// Telegram webhook: админ ✅/❌ товчоор баталж/татгалзана, татгалзсан мессежид хариу бичвэл шалтгаан болно.
import { adminName, decodePaymentCallback, parseAdminIds, timingSafeEqual } from '../_lib/telegram.js'
import { config, serviceClient, syncTelegramDecision, telegram } from '../_lib/server.js'

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  const expected = config.telegramWebhookSecret()
  const got = req.headers['x-telegram-bot-api-secret-token'] ?? ''
  if (!expected || !timingSafeEqual(String(got), expected)) return res.status(401).json({ error: 'unauthorized' })

  const update = req.body && typeof req.body === 'object' ? req.body : null
  try {
    if (update?.callback_query) await onCallback(update.callback_query)
    else if (update?.message) await onMessage(update.message)
  } catch (e) {
    console.error('telegram webhook', e)
  }
  // Telegram дахин илгээхгүйн тулд үргэлж 200; алдааг лог-д бичнэ.
  return res.status(200).json({ ok: true })
}

async function onCallback(cq) {
  const tg = telegram()
  let answer = ''
  try {
    if (!parseAdminIds(config.adminTelegramIds()).has(cq.from.id)) {
      answer = 'Эрхгүй'
      return
    }
    const parsed = decodePaymentCallback(cq.data)
    if (!parsed) {
      answer = 'Буруу хүсэлт'
      return
    }
    const db = serviceClient()
    const { data: result, error } = parsed.action === 'approve'
      ? await db.rpc('approve_payment', { p_request_id: parsed.requestId, p_admin_telegram_id: cq.from.id })
      : await db.rpc('reject_payment', { p_request_id: parsed.requestId, p_admin_telegram_id: cq.from.id })
    if (error) throw new Error(error.message)

    if (result.ok) {
      await syncTelegramDecision(parsed.requestId, adminName(cq.from))
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

async function onMessage(m) {
  if (!m.from || !parseAdminIds(config.adminTelegramIds()).has(m.from.id)) return
  const replyTo = m.reply_to_message?.message_id
  const text = m.text?.trim()
  if (!replyTo || !text) return

  const db = serviceClient()
  const { data: r } = await db
    .from('payment_requests')
    .select('id, ref_code, status')
    .eq('telegram_chat_id', m.chat.id)
    .eq('telegram_message_id', replyTo)
    .maybeSingle()
  if (!r) return

  const tg = telegram()
  if (r.status !== 'rejected') {
    await tg?.sendMessage(m.chat.id, `${r.ref_code}: шалтгааныг зөвхөн татгалзсан хүсэлтэд бичнэ.`)
    return
  }
  await db.rpc('set_payment_reject_reason', { p_request_id: r.id, p_reason: text })
  await tg?.sendMessage(m.chat.id, `${r.ref_code}: шалтгаан хадгалагдлаа.`)
}
