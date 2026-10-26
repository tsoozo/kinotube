// POST /api/payments/<id>/submit — "Гүйлгээ хийсэн": created → submitted, админд Telegram мессеж.
import { UUID_RE, allow, errorText, json, notifyPaymentSubmitted, userFromRequest } from '../../../../server/core.js'

export async function onRequestPost({ request, env, params, waitUntil }) {
  const id = String(params.id ?? '')
  if (!UUID_RE.test(id)) return json({ error: 'Олдсонгүй.' }, 404)

  const user = await userFromRequest(request, env)
  if (!user) return json({ error: 'Нэвтэрнэ үү.' }, 401)
  if (!(await allow(env, `submit:${user.id}`, 10, 600))) {
    return json({ error: 'Хэт олон оролдлого. Түр хүлээгээд дахин оролдоно уу.' }, 429)
  }

  const { data, error } = await user.client.rpc('submit_payment_request', { p_request_id: id })
  if (error) return json({ error: errorText(error) }, 400)
  if (data.needs_notify) {
    // Хариуг хүлээлгэхгүйн тулд мессежийг арын хэсэгт илгээнэ.
    waitUntil(notifyPaymentSubmitted(env, id).catch((e) => console.error('telegram notify', e)))
  }
  return json({ status: data.status })
}
