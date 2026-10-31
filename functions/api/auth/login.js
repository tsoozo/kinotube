// POST /api/auth/login { phone, pin } → { access_token, refresh_token }
import { allow, json, serviceClient } from '../../../server/core.js'
import { createSession, limited, readBody, tooMany } from '../../../server/pin.js'

export async function onRequestPost({ request, env }) {
  const body = await readBody(request)
  if (body.error) return body.error
  // Нэг дугаарт 15 минутад 6, нэг IP-д 30 оролдлого: 4 оронтой кодыг таахаас хамгаална.
  if (await limited(env, request, 'pin-ip', 30, 900)) return tooMany()
  if (!(await allow(env, `pin-phone:${body.phone}`, 6, 900))) return tooMany()

  const { data: userId, error } = await serviceClient(env).rpc('pin_login_user', { p_phone: body.phone, p_pin: body.pin })
  if (error) {
    console.error('pin_login_user', error.message)
    return json({ error: 'Алдаа гарлаа. Дахин оролдоно уу.' }, 500)
  }
  if (!userId) return json({ error: 'Утасны дугаар эсвэл код буруу байна.' }, 401)

  try {
    return json(await createSession(env, userId))
  } catch (e) {
    console.error('createSession', e.message)
    return json({ error: 'Нэвтэрч чадсангүй. Дахин оролдоно уу.' }, 500)
  }
}
