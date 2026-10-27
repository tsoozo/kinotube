// POST /api/admin/upload — админ: видео, зургийг хөтчөөс шууд R2 руу хуулах.
//  start    → R2 multipart эхлүүлж, эхний хэсгүүдийн PUT линкийг буцаана (хөтөч зэрэг хуулна)
//  parts    → дараагийн хэсгүүдийн линк
//  complete → хэсгүүдийг нийлүүлж, кино "видео бэлэн" болно, Telegram группт мэдэгдэнэ
//  abort    → тасалсан/алдаа гарсан хуулалтыг цуцалж, шалтгааныг группт мэдэгдэнэ
//  thumb    → зургийн нэг PUT линк (кино хадгалахаас өмнө)
//  delete   → кино/Shorts-ийг видео, зурагтай нь устгана
import { SLUG_RE, json, notifyAdmins, requireAdmin, serviceClient } from '../../../server/core.js'
import {
  abortMultipart, completeMultipart, createMultipart, deleteObject, partUrls, r2Configured, r2Url,
} from '../../../server/r2.js'

const MB = 1024 * 1024
const MAX_SIZE = 50 * 1024 * MB
const LINK_TTL = 24 * 3600
const BATCH = 100
const VIDEO_TYPES = ['video/mp4', 'video/webm']
const IMAGE_TYPES = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

const videoKey = (kind, id) => `${kind === 'short' ? 'shorts' : 'movies'}/${id}.mp4`
const kindText = (kind) => (kind === 'short' ? 'Shorts' : 'Кино')

function formatSize(bytes) {
  if (bytes >= 1024 * MB) return `${(bytes / 1024 / MB).toFixed(2)} GB`
  return `${Math.max(1, Math.round(bytes / MB))} MB`
}

// Хэсэг бүр дор хаяж 64 MB: линк цөөн (серверийн CPU), 10,000 хэсгийн хязгаарт багтана.
const partSizeFor = (size) => Math.max(64 * MB, Math.ceil(size / 9000 / MB) * MB)

export async function onRequestPost({ request, env }) {
  const { me, error } = await requireAdmin(request, env)
  if (error) return error
  if (!r2Configured(env)) return json({ error: 'R2 тохируулаагүй байна (R2_* утгууд).' }, 503)

  const body = await request.json().catch(() => ({}))
  const id = String(body.id ?? '')
  const kind = body.kind === 'short' ? 'short' : 'movie'
  if (!SLUG_RE.test(id) || id.length > 100) return json({ error: 'ID буруу байна.' }, 400)

  // Зураг: шинэ кино хадгалагдахаас өмнө хуулагдана, мөр шаардахгүй.
  if (body.action === 'thumb') {
    const ext = IMAGE_TYPES[body.type]
    if (!ext) return json({ error: 'JPG, PNG эсвэл WEBP зураг сонгоно уу.' }, 400)
    if (!(Number(body.size) > 0 && Number(body.size) <= 10 * MB)) return json({ error: 'Зураг 10 MB-аас бага байна.' }, 400)
    // Нэр бүр шинэ: хөтчийн кэш хуучин зургийг харуулахгүй.
    const thumbKey = `thumbnails/${kind === 'short' ? 'shorts/' : ''}${id}-${Date.now().toString(36)}.${ext}`
    return json({ key: thumbKey, url: await r2Url(env, thumbKey, 3600, { method: 'PUT' }) })
  }

  const db = serviceClient(env)
  const { data: item, error: dbError } = await db.from('catalog').select('id, kind, title, thumbnail, published').eq('id', id).maybeSingle()
  if (dbError) return json({ error: dbError.message }, 500)
  if (!item) return json({ error: 'Эхлээд кино/Shorts-ийн мэдээллийг хадгална уу.' }, 404)
  if (item.kind !== kind) return json({ error: 'Төрөл таарахгүй байна.' }, 400)
  const key = videoKey(kind, id)

  try {
    switch (body.action) {
      case 'start': {
        const size = Number(body.size)
        if (!Number.isFinite(size) || size <= 0 || size > MAX_SIZE) return json({ error: 'Файлын хэмжээ буруу (50 GB хүртэл).' }, 400)
        if (!VIDEO_TYPES.includes(body.type)) return json({ error: 'MP4 видео сонгоно уу.' }, 400)
        const partSize = partSizeFor(size)
        const count = Math.ceil(size / partSize)
        const uploadId = await createMultipart(env, key, body.type)
        // Шинэ видео хуулж байх хооронд хуучинд нь хандахгүй.
        await db.from('catalog').update({ video_ready: false, updated_at: new Date().toISOString() }).eq('id', id)
        return json({ key, uploadId, partSize, count, urls: await partUrls(env, key, uploadId, 1, Math.min(count, BATCH), LINK_TTL) })
      }

      // Дараагийн хэсгүүдийн линк (нэг дор BATCH-аас ихгүй: серверийн CPU хязгаар).
      case 'parts': {
        const from = Number(body.from)
        const to = Math.min(Number(body.to), from + BATCH - 1, 10000)
        if (!body.uploadId || !Number.isInteger(from) || from < 1 || !(to >= from)) return json({ error: 'Хэсгийн дугаар буруу.' }, 400)
        return json({ urls: await partUrls(env, key, body.uploadId, from, to, LINK_TTL) })
      }

      case 'complete': {
        const parts = Array.isArray(body.parts) ? body.parts : []
        if (!body.uploadId || !parts.length || parts.some((p) => !Number.isInteger(p.partNumber) || typeof p.etag !== 'string')) {
          return json({ error: 'Хэсгүүдийн мэдээлэл дутуу.' }, 400)
        }
        await completeMultipart(env, key, body.uploadId, parts.sort((a, b) => a.partNumber - b.partNumber))
        const published = item.published || body.publish === true
        const size = Number(body.size) || null
        const { error: upError } = await db.from('catalog')
          .update({ video_ready: true, video_size: size, published, updated_at: new Date().toISOString() })
          .eq('id', id)
        if (upError) throw new Error(upError.message)
        await notifyAdmins(env, [
          `📤 Видео байршлаа — «${item.title}»`,
          `${kindText(kind)} · ${size ? formatSize(size) : '—'}`,
          `Админ: ${me.email}`,
          published ? 'Сайтад нийтлэгдсэн' : 'Ноорог (сайтад хараахан харагдахгүй)',
        ].join('\n'))
        return json({ ok: true, published })
      }

      case 'abort': {
        if (body.uploadId) await abortMultipart(env, key, body.uploadId).catch(() => {})
        if (body.reason) {
          await notifyAdmins(env, [
            `⚠️ Видео байршуулалт тасарлаа — «${item.title}»`,
            `Шалтгаан: ${String(body.reason).slice(0, 300)}`,
            `Админ: ${me.email}`,
          ].join('\n'))
        }
        return json({ ok: true })
      }

      case 'delete': {
        await deleteObject(env, key).catch(() => {})
        if (item.thumbnail) await deleteObject(env, item.thumbnail).catch(() => {})
        const { error: delError } = await db.from('catalog').delete().eq('id', id)
        if (delError) throw new Error(delError.message)
        return json({ ok: true })
      }

      default:
        return json({ error: 'Буруу үйлдэл.' }, 400)
    }
  } catch (e) {
    console.error('admin upload', body.action, id, e.message)
    return json({ error: `Алдаа: ${e.message}` }, 500)
  }
}
