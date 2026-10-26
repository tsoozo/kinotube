// Telegram Bot API (энгийн fetch) ба төлбөр батлах мессежийн формат.

export class TelegramClient {
  constructor(token, apiBase = 'https://api.telegram.org') {
    this.token = token
    this.apiBase = apiBase
  }

  async call(method, body) {
    const res = await fetch(`${this.apiBase}/bot${this.token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    const json = await res.json().catch(() => null)
    if (!json?.ok) throw new Error(`Telegram ${method} failed: ${json?.description ?? res.status}`)
    return json.result
  }

  sendMessage(chatId, text, replyMarkup) {
    return this.call('sendMessage', { chat_id: chatId, text, reply_markup: replyMarkup, link_preview_options: { is_disabled: true } })
  }

  editMessageText(chatId, messageId, text, replyMarkup) {
    return this.call('editMessageText', { chat_id: chatId, message_id: messageId, text, reply_markup: replyMarkup ?? { inline_keyboard: [] } })
  }

  answerCallbackQuery(callbackQueryId, text) {
    return this.call('answerCallbackQuery', { callback_query_id: callbackQueryId, text })
  }

  setWebhook(url, secretToken) {
    return this.call('setWebhook', { url, secret_token: secretToken, allowed_updates: ['callback_query', 'message'], drop_pending_updates: false })
  }
}

/* Товчны өгөгдөл: "pay:a:<uuid>" / "pay:r:<uuid>" (64 байтын хязгаараас бага). */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const encodePaymentCallback = (action, requestId) => `pay:${action === 'approve' ? 'a' : 'r'}:${requestId}`

export function decodePaymentCallback(data) {
  const m = /^pay:([ar]):(.+)$/.exec(data || '')
  if (!m || !UUID_RE.test(m[2])) return null
  return { action: m[1] === 'a' ? 'approve' : 'reject', requestId: m[2] }
}

/* Мессеж */

const groupFmt = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
export const formatMnt = (n) => `${groupFmt.format(Math.round(n))}₮`

export function formatDateTime(input) {
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ulaanbaatar', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(input))
  const get = (t) => p.find((x) => x.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`
}

export function paymentRequestMessage(p) {
  return [
    `Шинэ төлбөр — ${p.refCode}`,
    `Хэрэглэгч: ${p.email ?? '—'}`,
    `Эрх: ${p.productTitle}${p.movieTitle ? ` — «${p.movieTitle}»` : ''}`,
    `Дүн: ${formatMnt(p.amountMnt)}`,
    `Цаг: ${formatDateTime(p.submittedAt)}`,
  ].join('\n')
}

export function paymentKeyboard(requestId) {
  return {
    inline_keyboard: [[
      { text: '✅ Батлах', callback_data: encodePaymentCallback('approve', requestId) },
      { text: '❌ Татгалзах', callback_data: encodePaymentCallback('reject', requestId) },
    ]],
  }
}

export function adminName(user) {
  if (user.username) return `@${user.username}`
  return [user.first_name, user.last_name].filter(Boolean).join(' ') || String(user.id)
}

export function decidedMessage(original, decision, by, at = new Date()) {
  const line = decision === 'approved'
    ? `✅ Батлагдсан — ${by} ${formatDateTime(at)}`
    : `❌ Татгалзсан — ${by} ${formatDateTime(at)}\nШалтгаан бичих бол энэ мессежид хариу бичнэ үү.`
  return `${paymentRequestMessage(original)}\n\n${line}`
}

export function parseAdminIds(raw) {
  return new Set((raw ?? '').split(',').map((s) => Number(s.trim())).filter((n) => Number.isSafeInteger(n) && n > 0))
}

// Webhook-ийн нууц үгийг тогтмол хугацаанд харьцуулна.
export function timingSafeEqual(a, b) {
  const enc = new TextEncoder()
  const ab = enc.encode(a)
  const bb = enc.encode(b)
  let diff = ab.length ^ bb.length
  for (let i = 0; i < Math.max(ab.length, bb.length); i++) diff |= (ab[i] ?? 0) ^ (bb[i] ?? 0)
  return diff === 0
}
