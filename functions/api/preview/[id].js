// GET /api/preview/<id>?t=<token> — киноны үнэгүй хэсэг (эхний 10 минут). Токеныг /api/video өгнө.
// Зөвхөн зөвшөөрөгдсөн байтыг R2-аас дамжуулна (server/preview.js).
import { r2Configured, r2Url } from '../../../server/r2.js'
import { planRange, verifyPreview } from '../../../server/preview.js'

export async function onRequestGet({ request, env, params }) {
  if (!r2Configured(env)) return new Response('Not configured', { status: 503 })
  const token = await verifyPreview(env, new URL(request.url).searchParams.get('t'))
  if (!token || token.id !== String(params.id ?? '')) return new Response('Forbidden', { status: 403 })

  const plan = { size: token.size, regions: token.regions }
  const r = planRange(request.headers.get('range'), plan)
  const base = { 'accept-ranges': 'bytes', 'content-type': 'video/mp4', 'cache-control': 'private, max-age=3600' }
  if (!r) return new Response(null, { status: 416, headers: { ...base, 'content-range': `bytes */${plan.size}` } })

  const headers = { ...base, 'content-range': `bytes ${r.start}-${r.end}/${plan.size}`, 'content-length': String(r.end - r.start + 1) }
  if (!r.real) return new Response(new Uint8Array(r.end - r.start + 1), { status: 206, headers })

  const res = await fetch(await r2Url(env, token.key, 600), { headers: { range: `bytes=${r.start}-${r.end}` } })
  if (res.status !== 206 && res.status !== 200) return new Response('Upstream error', { status: 502 })
  return new Response(res.body, { status: 206, headers })
}
