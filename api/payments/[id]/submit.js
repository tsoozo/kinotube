// POST /api/payments/<id>/submit — "Гүйлгээ хийсэн": created → submitted, админд Telegram мессеж.
import { allow, errorText, notifyPaymentSubmitted, userFromRequest } from '../../_lib/server.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })
  const id = String(req.query.id ?? '')
  if (!UUID_RE.test(id)) return res.status(404).json({ error: 'Олдсонгүй.' })

  const user = await userFromRequest(req)
  if (!user) return res.status(401).json({ error: 'Нэвтэрнэ үү.' })
  if (!(await allow(`submit:${user.id}`, 10, 600))) {
    return res.status(429).json({ error: 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.' })
  }

  const { data, error } = await user.client.rpc('submit_payment_request', { p_request_id: id })
  if (error) return res.status(400).json({ error: errorText(error) })
  if (data.needs_notify) {
    await notifyPaymentSubmitted(id).catch((e) => console.error('telegram notify', e))
  }
  return res.status(200).json({ status: data.status })
}
