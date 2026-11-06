// Үнэгүй үзэх хэсэг (кино, Shorts: эхний 10 минут). Эрхгүй хэрэглэгчид бүтэн видеоны линк өгөхгүй:
// /api/preview/<id>?t=<token> нь R2-аас зөвхөн эхний хэсгийн байтыг (мөн moov мэдээллийг) дамжуулна,
// бусад байтын оронд тэг өгнө. Ингэснээр линкийг хуулж авсан ч бүтэн кино үзэх боломжгүй.
import { r2Url } from './r2.js'

export { FREE_EPISODES, FREE_SECONDS, SHORTS_FREE_SECONDS, freeLabel, freeLimit } from './free.js'

const MB = 1024 * 1024
const enc = new TextEncoder()
const b64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const fromB64url = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/'))

const secretOf = (env) => env.PREVIEW_SECRET || env.R2_SECRET_ACCESS_KEY

async function hmac(env, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(`preview|${secretOf(env)}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode(text)))
}

export async function signPreview(env, data) {
  const body = b64url(enc.encode(JSON.stringify(data)))
  return `${body}.${await hmac(env, body)}`
}

// Буруу, хугацаа дууссан бол null.
export async function verifyPreview(env, token) {
  const [body, sig] = String(token || '').split('.')
  if (!body || !sig || sig !== (await hmac(env, body))) return null
  try {
    const data = JSON.parse(fromB64url(body))
    return data.exp > Date.now() / 1000 ? data : null
  } catch {
    return null
  }
}

// "Ц:ММ:СС" → секунд.
export const toSeconds = (d) => String(d || '').split(':').reduce((s, p) => s * 60 + (Number(p) || 0), 0)

// MP4-ийн дээд түвшний хайрцгуудыг уншиж, moov (тоглуулах мэдээлэл) хаана байгааг олно.
export async function mp4Layout(env, key) {
  let off = 0
  let size = Infinity
  for (let i = 0; i < 16 && off < size; i++) {
    const res = await fetch(await r2Url(env, key, 300), { headers: { range: `bytes=${off}-${off + 15}` } })
    if (res.status !== 206) throw new Error(`R2 ${res.status}`)
    size = Number(res.headers.get('content-range')?.split('/')[1]) || size
    const v = new DataView(await res.arrayBuffer())
    if (v.byteLength < 8) break
    let len = v.getUint32(0)
    const type = String.fromCharCode(v.getUint8(4), v.getUint8(5), v.getUint8(6), v.getUint8(7))
    if (len === 1 && v.byteLength >= 16) len = Number(v.getBigUint64(8))
    else if (len === 0) len = size - off
    if (type === 'moov') return { size, moov: [off, off + len] }
    if (len < 8) break
    off += len
  }
  return { size, moov: null }
}

// Үнэгүй хэсгийн (freeSec секунд) байтын хязгаар: хугацааны харьцаагаар (+1 минут), бичлэгийн эхэнд bitrate өндөр байж болох тул
// 2 дахин нөөцтэй +4 MB (үгүй бол хязгаарт хүрэхээс өмнө тэг байт ирж видео алдаа өгнө). Урт тодорхойгүй бол 10%.
export function previewPlan({ size, moov }, durationSec, freeSec) {
  const head = durationSec > freeSec
    ? Math.min(size, Math.ceil((size * 2 * (freeSec + 60)) / durationSec) + 4 * MB)
    : durationSec > 0 ? size : Math.min(size, Math.ceil(size * 0.1))
  const regions = [[0, head]]
  if (moov && moov[0] >= head) regions.push([moov[0], Math.min(moov[1], size)])
  return { size, regions }
}

// Хүссэн Range-ийг нэг хэсэгт багтааж: { start, end, real } (real=false бол тэг өгнө). Буруу бол null.
export function planRange(header, { size, regions }) {
  let start = 0
  let end = size - 1
  const m = /^bytes=(\d*)-(\d*)$/.exec(String(header || '').trim())
  if (m) {
    if (m[1] === '' && m[2] === '') return null
    if (m[1] === '') start = Math.max(0, size - Number(m[2]))
    else {
      start = Number(m[1])
      if (m[2] !== '') end = Math.min(end, Number(m[2]))
    }
  }
  if (start >= size || end < start) return null
  const inside = regions.find(([a, b]) => start >= a && start < b)
  if (inside) return { start, end: Math.min(end, inside[1] - 1), real: true }
  // Хориотой хэсэг: дараагийн зөвшөөрөгдсөн хэсэг хүртэл, нэг удаад 1 MB-аас ихгүй тэг.
  const next = regions.map(([a]) => a).filter((a) => a > start).sort((a, b) => a - b)[0] ?? size
  return { start, end: Math.min(end, next - 1, start + MB - 1), real: false }
}
