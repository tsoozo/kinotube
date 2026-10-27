// GET /img/thumbnails/... — R2 дээрх зураг руу хугацаатай линкээр шилжүүлнэ.
// Линкийг өдөрт нэг удаа шинэчилнэ: тэр өдөртөө ижил линк тул хөтөч зургийг кэшлэнэ.
import { r2Configured, r2Url } from '../../server/r2.js'

const DAY = 24 * 3600

export async function onRequestGet({ env, params }) {
  const key = [].concat(params.path ?? []).join('/')
  if (!/^thumbnails\/[a-z0-9._/-]+$/.test(key) || key.includes('..') || !r2Configured(env)) {
    return new Response('Not found', { status: 404 })
  }
  const day = new Date(Math.floor(Date.now() / (DAY * 1000)) * DAY * 1000)
  const url = await r2Url(env, key, 2 * DAY, { now: day })
  return new Response(null, { status: 302, headers: { location: url, 'cache-control': 'public, max-age=3600' } })
}
