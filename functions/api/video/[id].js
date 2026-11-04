// GET /api/video/<id>[?ep=<анги>] — R2 дээрх видеоны хугацаатай линк.
//  Кино: эрхтэй (сарын эрх эсвэл тухайн киноны түрээс) бол бүтэн, үгүй бол эхний 5 минут (/api/preview).
//  Цуврал: эхний 2 анги хүн бүрт, цааш нь эрхтэй хэрэглэгчид. Ганц ангитай цуврал = кино: эхний 5 минут.
import { SLUG_RE, json, serviceClient, userFromRequest } from '../../../server/core.js'
import { r2Configured, r2Url } from '../../../server/r2.js'
import { FREE_EPISODES, FREE_SECONDS, mp4Layout, previewPlan, signPreview, toSeconds } from '../../../server/preview.js'

const TTL = 6 * 3600

export async function onRequestGet({ request, env, params }) {
  const id = String(params.id ?? '')
  if (!SLUG_RE.test(id) || id.length > 100) return json({ error: 'Олдсонгүй.' }, 404)
  if (!r2Configured(env)) return json({ error: 'Видео сервер тохируулаагүй байна.' }, 503)

  const db = serviceClient(env)
  const { data: item, error } = await db.from('catalog').select('id, kind, published, duration, video_ready').eq('id', id).maybeSingle()
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

  // Эрхгүй: эхний 5 минутын байтыг л дамжуулах линк.
  const preview = async (key, duration) => {
    const plan = previewPlan(await mp4Layout(env, key), toSeconds(duration))
    const exp = Math.floor(Date.now() / 1000) + TTL
    const t = await signPreview(env, { id, key, exp, size: plan.size, regions: plan.regions })
    return json({ url: `/api/preview/${id}?t=${t}`, preview: FREE_SECONDS, expires: TTL })
  }

  try {
    if (item.kind === 'series') {
      const n = Number(new URL(request.url).searchParams.get('ep') || 1)
      if (!Number.isInteger(n) || n < 1) return json({ error: 'Анги олдсонгүй.' }, 404)
      const { data: ep } = await db.from('episodes').select('number, duration, video_key, video_ready').eq('series_id', id).eq('number', n).maybeSingle()
      if (!ep?.video_ready || !ep.video_key) return json({ error: 'Видео удахгүй нэмэгдэнэ.' }, 404)
      const { count, error: ce } = await db.from('episodes').select('number', { count: 'exact', head: true }).eq('series_id', id)
      if (ce) throw new Error(ce.message)
      // Ганц ангитай бол бүтэн кино тул үнэгүй анги биш, эхний 5 минут.
      if (count === 1) {
        if (await canWatch()) return json({ url: await r2Url(env, ep.video_key, TTL), expires: TTL })
        return preview(ep.video_key, ep.duration)
      }
      if (n > FREE_EPISODES && !(await canWatch())) return json({ error: user ? 'Энэ ангийг үзэх эрх алга.' : 'Нэвтэрнэ үү.' }, user ? 403 : 401)
      return json({ url: await r2Url(env, ep.video_key, TTL), expires: TTL })
    }

    if (!item.video_ready) return json({ error: 'Видео удахгүй нэмэгдэнэ.' }, 404)
    const key = `movies/${id}.mp4`
    if (await canWatch()) return json({ url: await r2Url(env, key, TTL), expires: TTL })
    return preview(key, item.duration)
  } catch (e) {
    console.error('video', id, e.message)
    return json({ error: 'Алдаа гарлаа. Дахин оролдоно уу.' }, 500)
  }
}
