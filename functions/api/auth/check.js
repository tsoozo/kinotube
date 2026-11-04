// POST /api/auth/check { phone } → { registered } — нэвтрэхийн өмнө дугаар бүртгэлтэй эсэхийг хэлнэ.
import { json, serviceClient } from '../../../server/core.js'
import { limited, PHONE_RE, tooMany } from '../../../server/pin.js'

export async function onRequestPost({ request, env }) {
  const body = await request.json().catch(() => null)
  const phone = String(body?.phone ?? '').replace(/\D/g, '')
  if (!PHONE_RE.test(phone)) return json({ error: 'Утасны дугаараа 8 оронтойгоор оруулна уу.' }, 400)
  // Дугаар тааж жагсаахаас хамгаална.
  if (await limited(env, request, 'check-ip', 40, 900)) return tooMany()

  const { data, error } = await serviceClient(env).rpc('pin_user_by_phone', { p_phone: phone })
  if (error) {
    console.error('pin_user_by_phone', error.message)
    return json({ error: 'Алдаа гарлаа. Дахин оролдоно уу.' }, 500)
  }
  return json({ registered: !!data })
}
