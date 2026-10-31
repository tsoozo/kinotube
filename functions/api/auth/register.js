// POST /api/auth/register { phone, pin, name? } → { access_token, refresh_token }
import { json, serviceClient } from '../../../server/core.js'
import { createSession, hiddenEmail, limited, readBody, tooMany } from '../../../server/pin.js'

const randomPassword = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function onRequestPost({ request, env }) {
  const body = await readBody(request)
  if (body.error) return body.error
  if (await limited(env, request, 'register-ip', 10, 3600)) return tooMany()

  const db = serviceClient(env)
  const taken = await db.rpc('pin_user_by_phone', { p_phone: body.phone })
  if (taken.error) {
    console.error('pin_user_by_phone', taken.error.message)
    return json({ error: 'Алдаа гарлаа. Дахин оролдоно уу.' }, 500)
  }
  if (taken.data) return json({ error: 'Энэ дугаар бүртгэлтэй байна. Нэвтэрнэ үү.' }, 409)

  // Нууц үг санамсаргүй, хэнд ч мэдэгдэхгүй (нэвтрэлт кодоор).
  const { data: created, error: createError } = await db.auth.admin.createUser({
    email: hiddenEmail(),
    password: randomPassword(),
    email_confirm: true,
  })
  if (createError || !created?.user) {
    console.error('createUser', createError?.message)
    return json({ error: 'Бүртгэж чадсангүй. Дахин оролдоно уу.' }, 500)
  }
  const userId = created.user.id

  const { error: pinError } = await db.rpc('pin_register', { p_user: userId, p_phone: body.phone, p_pin: body.pin })
  if (pinError) {
    await db.auth.admin.deleteUser(userId).catch(() => {})
    const taken = pinError.message?.trim() === 'phone_taken'
    return json({ error: taken ? 'Энэ дугаар бүртгэлтэй байна. Нэвтэрнэ үү.' : 'Бүртгэж чадсангүй. Дахин оролдоно уу.' }, taken ? 409 : 500)
  }
  if (body.name) await db.from('profiles').update({ display_name: body.name }).eq('id', userId)

  try {
    return json(await createSession(env, userId))
  } catch (e) {
    console.error('createSession', e.message)
    return json({ error: 'Бүртгэгдлээ. Одоо нэвтэрнэ үү.' }, 500)
  }
}
