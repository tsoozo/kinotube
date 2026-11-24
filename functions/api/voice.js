// POST /api/voice — дубляжийн хоолойн сан (#hooloi): нэвтэрсэн хэрэглэгч карт бүрийн дууг R2-д хадгална.
//  list → бичигдсэн картууд { key, size, at }
//  put  → нэг картын PUT линк: voice-bank/<хоолой>/<карт>.<өргөтгөл> (дахин хураавал солигдоно)
//  get  → тоглуулах/татах линк
import { allow, json, userFromRequest } from '../../server/core.js'
import { deleteObject, r2Configured, r2Fetch, r2Url } from '../../server/r2.js'

const VOICES = ['er', 'em', 'ovgon', 'emgen', 'huu', 'ohin']
const TYPES = { 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/m4a': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3', 'audio/wav': 'wav', 'audio/x-wav': 'wav', 'audio/wave': 'wav', 'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/x-caf': 'caf', 'audio/3gpp': '3gp', 'audio/amr': 'amr' }
const EXTS = [...new Set(Object.values(TYPES))]
const MAX = 30 * 1024 * 1024
const PREFIX = 'voice-bank/'
const KEY_RE = /^voice-bank\/(er|em|ovgon|emgen|huu|ohin)\/([0-9]{1,2})\.([a-z0-9]{2,4})$/

async function listAll(env) {
  const out = []
  let token = ''
  for (let i = 0; i < 10; i++) {
    const query = { 'list-type': '2', prefix: PREFIX, ...(token ? { 'continuation-token': token } : {}) }
    const xml = await r2Fetch(env, 'GET', '', { query })
    for (const m of xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)) {
      const key = /<Key>([^<]+)<\/Key>/.exec(m[1])?.[1]
      if (!KEY_RE.test(key || '')) continue
      out.push({ key, size: Number(/<Size>(\d+)<\/Size>/.exec(m[1])?.[1] || 0), at: /<LastModified>([^<]+)</.exec(m[1])?.[1] || '' })
    }
    token = /<NextContinuationToken>([^<]+)</.exec(xml)?.[1] || ''
    if (!token) break
  }
  return out
}

export async function onRequestPost({ request, env }) {
  const user = await userFromRequest(request, env)
  if (!user) return json({ error: 'Нэвтэрнэ үү.' }, 401)
  if (!r2Configured(env)) return json({ error: 'R2 тохируулаагүй байна.' }, 503)
  const body = await request.json().catch(() => ({}))
  try {
    if (body.action === 'list') return json({ items: await listAll(env) })

    if (body.action === 'get') {
      if (!KEY_RE.test(String(body.key || ''))) return json({ error: 'Файл буруу.' }, 400)
      return json({ url: await r2Url(env, body.key, 3600) })
    }

    if (body.action === 'put') {
      const voice = String(body.voice || '')
      const card = Number(body.card)
      const ext = TYPES[String(body.type || '').split(';')[0]] || (EXTS.includes(body.ext) ? body.ext : '')
      if (!VOICES.includes(voice) || !(Number.isInteger(card) && card >= 1 && card <= 40)) return json({ error: 'Карт буруу.' }, 400)
      if (!ext) return json({ error: 'Дууны файл сонгоно уу (m4a, mp3, wav).' }, 400)
      if (!(Number(body.size) > 0 && Number(body.size) <= MAX)) return json({ error: 'Файл 30 MB-аас бага байх ёстой.' }, 400)
      if (!(await allow(env, `voice:${user.id}`, 200, 3600))) return json({ error: 'Хэт олон удаа. Түр хүлээгээд дахин оролдоно уу.' }, 429)
      const key = `${PREFIX}${voice}/${card}.${ext}`
      // Өөр өргөтгөлтэй хуучин бичлэгийг устгана (нэг картад нэг файл).
      for (const old of EXTS.filter((e) => e !== ext)) await deleteObject(env, `${PREFIX}${voice}/${card}.${old}`).catch(() => {})
      return json({ key, url: await r2Url(env, key, 3600, { method: 'PUT' }) })
    }
    return json({ error: 'Буруу үйлдэл.' }, 400)
  } catch (e) {
    console.error('voice', body.action, e.message)
    return json({ error: 'Алдаа гарлаа. Дахин оролдоно уу.' }, 500)
  }
}
