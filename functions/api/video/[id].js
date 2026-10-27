// GET /api/video/<id>[?kind=short] — R2 дээрх видеоны хугацаатай линк.
// Кино: нэвтэрсэн, эрхтэй (сарын эрх эсвэл тухайн киноны түрээс) хэрэглэгчид л. Shorts: хүн бүрт.
import { SLUG_RE, json, serviceClient, userFromRequest } from '../../../server/core.js'
import { r2Configured, r2Url } from '../../../server/r2.js'

const MOVIE_TTL = 6 * 3600
const SHORT_TTL = 2 * 3600

export async function onRequestGet({ request, env, params }) {
  const id = String(params.id ?? '')
  if (!SLUG_RE.test(id) || id.length > 100) return json({ error: 'Олдсонгүй.' }, 404)
  if (!r2Configured(env)) return json({ error: 'Видео сервер тохируулаагүй байна.' }, 503)

  const short = new URL(request.url).searchParams.get('kind') === 'short'
  if (short) return json({ url: await r2Url(env, `shorts/${id}.mp4`, SHORT_TTL), expires: SHORT_TTL })

  const user = await userFromRequest(request, env)
  if (!user) return json({ error: 'Нэвтэрнэ үү.' }, 401)
  const { data: ok, error } = await serviceClient(env).rpc('can_watch', { p_user: user.id, p_movie: id })
  if (error) return json({ error: 'Алдаа гарлаа. Дахин оролдоно уу.' }, 500)
  if (!ok) return json({ error: 'Энэ киног үзэх эрх алга.' }, 403)
  return json({ url: await r2Url(env, `movies/${id}.mp4`, MOVIE_TTL), expires: MOVIE_TTL })
}
