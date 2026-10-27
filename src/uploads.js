// Видео хуулах дараалал. Админ хуудаснаас гарсан ч (сайт дотор шилжсэн ч) үргэлжилнэ, хөтчийг хаавал зогсоно.
// Файл бүрийг 32 MB+ хэсгүүдэд хувааж R2 руу шууд хуулна (functions/api/admin/upload.js линк өгнө).
// Дуусахад (эсвэл тасрахад) сервер Telegram группт мэдэгдэнэ.
import { uploadAction } from './admin.js'

const MAX_FILES = 2
const MAX_PARTS = 3
const RETRIES = 3

let jobs = []
let running = 0
const listeners = new Set()
let emitTimer = 0

function emit(now = false) {
  if (!now) {
    // Явцыг 4 удаа/сек-ээс олон дахин зурахгүй.
    if (emitTimer) return
    emitTimer = setTimeout(() => emit(true), 250)
    return
  }
  clearTimeout(emitTimer)
  emitTimer = 0
  const snapshot = jobs.map((j) => ({ ...j }))
  listeners.forEach((fn) => fn(snapshot))
}

export function subscribe(fn) {
  listeners.add(fn)
  fn(jobs.map((j) => ({ ...j })))
  return () => listeners.delete(fn)
}

export const isActive = (j) => ['queued', 'uploading', 'finishing'].includes(j.status)

// Хуулж байх үед хөтчийг хаах/шинэчлэхэд анхааруулна.
window.addEventListener('beforeunload', (e) => {
  if (jobs.some(isActive)) {
    e.preventDefault()
    e.returnValue = ''
  }
})

export function enqueue({ id, kind, title, file, publish }) {
  if (jobs.some((j) => j.id === id && isActive(j))) throw new Error('Энэ бичлэгийн видео хуулагдаж байна.')
  jobs = jobs.filter((j) => j.id !== id)
  jobs.push({
    id, kind, title, file, publish, name: file.name, total: file.size, loaded: 0,
    status: 'queued', error: '', controller: new AbortController(),
  })
  emit(true)
  pump()
}

export function cancel(id) {
  jobs.find((j) => j.id === id && isActive(j))?.controller.abort()
}

// Алдаа гарсан/цуцалсан хуулалтыг дахин эхлүүлнэ (файл санах ойд байгаа бол).
export function retry(id) {
  const job = jobs.find((j) => j.id === id && (j.status === 'error' || j.status === 'canceled') && j.file)
  if (!job) return
  Object.assign(job, { status: 'queued', error: '', loaded: 0, controller: new AbortController() })
  emit(true)
  pump()
}

export function clearFinished() {
  jobs = jobs.filter(isActive)
  emit(true)
}

function pump() {
  while (running < MAX_FILES) {
    const job = jobs.find((j) => j.status === 'queued')
    if (!job) return
    run(job)
  }
}

// Нэг хэсгийг PUT хийгээд ETag-ийг буцаана (XHR: явцыг харуулахын тулд).
function putPart(url, blob, signal, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.upload.onprogress = (e) => onProgress(e.loaded)
    xhr.onload = () => {
      if (xhr.status < 200 || xhr.status >= 300) return reject(new Error(`R2 ${xhr.status}`))
      const etag = xhr.getResponseHeader('ETag')
      if (!etag) return reject(Object.assign(new Error('R2-ийн CORS-д ExposeHeaders: ETag нэмнэ үү (README).'), { fatal: true }))
      resolve(etag)
    }
    xhr.onerror = () => reject(new Error('Сүлжээ тасарлаа'))
    const abort = () => xhr.abort()
    signal.addEventListener('abort', abort, { once: true })
    xhr.onabort = () => reject(Object.assign(new Error('Цуцалсан'), { canceled: true }))
    xhr.onloadend = () => signal.removeEventListener('abort', abort)
    xhr.send(blob)
  })
}

async function putWithRetry(url, blob, signal, onProgress) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await putPart(url, blob, signal, onProgress)
    } catch (e) {
      if (e.canceled || e.fatal || attempt >= RETRIES) throw e
      onProgress(0)
      await new Promise((r) => setTimeout(r, attempt * 3000))
    }
  }
}

async function run(job) {
  running++
  job.status = 'uploading'
  emit(true)
  const { file, kind, id } = job
  let uploadId = null
  try {
    const start = await uploadAction({ action: 'start', kind, id, size: file.size, type: file.type || 'video/mp4' })
    uploadId = start.uploadId
    const { partSize, urls } = start
    const loaded = new Array(urls.length).fill(0)
    const etags = new Array(urls.length)
    let next = 0
    const worker = async () => {
      while (next < urls.length) {
        const i = next++
        const blob = file.slice(i * partSize, Math.min(file.size, (i + 1) * partSize))
        etags[i] = await putWithRetry(urls[i], blob, job.controller.signal, (n) => {
          loaded[i] = n
          job.loaded = loaded.reduce((a, b) => a + b, 0)
          emit()
        })
        loaded[i] = blob.size
      }
    }
    await Promise.all(Array.from({ length: Math.min(MAX_PARTS, urls.length) }, worker))
    job.status = 'finishing'
    emit(true)
    const done = await uploadAction({
      action: 'complete', kind, id, uploadId, size: file.size, publish: job.publish,
      parts: etags.map((etag, i) => ({ partNumber: i + 1, etag })),
    })
    Object.assign(job, { status: 'done', loaded: job.total, published: done.published, file: null })
  } catch (e) {
    const canceled = job.controller.signal.aborted
    Object.assign(job, { status: canceled ? 'canceled' : 'error', error: canceled ? '' : e.message })
    // Сервер хагас хуулсан хэсгүүдийг цэвэрлэж, алдааг группт мэдэгдэнэ.
    uploadAction({ action: 'abort', kind, id, uploadId, reason: canceled ? null : e.message }).catch(() => {})
  } finally {
    running--
    emit(true)
    pump()
  }
}
