// GET /api/video/<id>[?ep=<анги>] — R2 дээрх видеоны хугацаатай линк.
//  Эрхтэй (сарын эрх эсвэл тухайн киноны түрээс) бол бүтэн. Эрхгүй бол server/free.js-ийн дүрмээр:
//  хэвтээ кино эхний 10 минут, хэвтээ цуврал эхний 2 анги, Shorts (босоо) нийт эхний 10 минут (/api/preview).
import { SLUG_RE, json, serviceClient, userFromRequest } from '../../../server/core.js'
import { r2Configured, r2Url } from '../../../server/r2.js'
import { freeLimit, mp4Layout, previewPlan, signPreview, toSeconds } from '../../../server/preview.js'

const TTL = 6 * 3600

export async function onRequestGet({ request, env, params }) {
  const id = String(params.id ?? '')
  if (!SLUG_RE.test(id) || id.length > 100) return json({ error: 'Олдсонгүй.' }, 404)
  if (!r2Configured(env)) return json({ error: 'Видео сервер тохируулаагүй байна.' }, 503)

  const db = serviceClient(env)
  const { data: item, error } = await db.from('catalog').select('id, kind, orientation, published, duration, video_ready').eq('id', id).maybeSingle()
  if (error) return json({ error: 'Алдаа гарлаа. Дахин оролдоно уу.' }, 500)
  const user = await userFromRequest(request, env)
  // Ноорог: зөвхөн админ.
  if (item && !item.published) {
    const { data: me } = user ? await user.client.rpc('me') : { data: null }
    if (!me?.is_admin) return json({ error: 'Олдсонгүй.' }, 404)
  }
  if (!item) return json({ error: 'Олдсонгүй.' }, 404)

  const canWatch = async () => {
    if (!user) return false
    const { data: ok, error: e } = await db.rpc('can_watch', { p_user: user.id, p_movie: id })
    if (e) throw new Error(e.message)
    return Boolean(ok)
  }

  // Эрхгүй: эхний freeSec секундын байтыг л дамжуулах линк.
  const preview = async (key, duration, freeSec) => {
    const plan = previewPlan(await mp4Layout(env, key), toSeconds(duration), freeSec)
    const exp = Math.floor(Date.now() / 1000) + TTL
    const t = await signPreview(env, { id, key, exp, size: plan.size, regions: plan.regions })
    return json({ url: `/api/preview/${id}?t=${t}`, preview: freeSec, expires: TTL })
  }

  // limit: freeLimit-ийн хариу (Infinity бүтэн үнэгүй, 0 эрх хэрэгтэй, бусад нь үнэгүй секунд).
  const serve = async (key, duration, limit) => {
    if (limit === Infinity || (await canWatch())) return json({ url: await r2Url(env, key, TTL), expires: TTL })
    if (!limit) return json({ error: user ? 'Энэ ангийг үзэх эрх алга.' : 'Нэвтэрнэ үү.' }, user ? 403 : 401)
    return preview(key, duration, limit)
  }

  try {
    if (item.kind === 'series') {
      const n = Number(new URL(request.url).searchParams.get('ep') || 1)
      if (!Number.isInteger(n) || n < 1) return json({ error: 'Анги олдсонгүй.' }, 404)
      const { data: eps, error: ee } = await db.from('episodes').select('number, duration, video_key, video_ready').eq('series_id', id)
      if (ee) throw new Error(ee.message)
      const ep = eps.find((e) => e.number === n)
      if (!ep?.video_ready || !ep.video_key) return json({ error: 'Видео удахгүй нэмэгдэнэ.' }, 404)
      return await serve(ep.video_key, ep.duration, freeLimit(item, eps, n))
    }

    if (!item.video_ready) return json({ error: 'Видео удахгүй нэмэгдэнэ.' }, 404)
    return await serve(`movies/${id}.mp4`, item.duration, freeLimit(item))
  } catch (e) {
    console.error('video', id, e.message)
    return json({ error: 'Алдаа гарлаа. Дахин оролдоно уу.' }, 500)
  }
}
