// Видеоноос нүүр зураг гаргах: хэд хэдэн кадр авч, хамгийн тод, дэлгэрэнгүйг нь сонгоно.
// Кино 16:9, Shorts 9:16. Харьцаа таарахгүй бол бүдгэрүүлсэн дэвсгэр дээр бүтнээр нь байрлуулна.

const SIZE = { movie: [1280, 720], short: [720, 1280] }

function waitFor(v, event, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error('Видео уншиж чадсангүй (хугацаа хэтэрлээ).')), ms)
    const ok = () => finish()
    const bad = () => finish(new Error('Видео уншиж чадсангүй.'))
    function finish(err) {
      clearTimeout(timer)
      v.removeEventListener(event, ok)
      v.removeEventListener('error', bad)
      err ? reject(err) : resolve()
    }
    v.addEventListener(event, ok)
    v.addEventListener('error', bad)
  })
}

// Кадрын "сонирхолтой" байдал: гэрэлтэлтийн тархалт их, хэт харанхуй/цайвар биш.
function score(ctx, canvas) {
  const s = document.createElement('canvas')
  s.width = 32
  s.height = 32
  const sc = s.getContext('2d', { willReadFrequently: true })
  sc.drawImage(canvas, 0, 0, 32, 32)
  const d = sc.getImageData(0, 0, 32, 32).data
  let sum = 0
  let sq = 0
  const n = d.length / 4
  for (let i = 0; i < d.length; i += 4) {
    const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    sum += l
    sq += l * l
  }
  const mean = sum / n
  const std = Math.sqrt(Math.max(0, sq / n - mean * mean))
  return std * Math.min(1, mean / 70) * Math.min(1, (255 - mean) / 50)
}

function draw(ctx, v, w, h) {
  const vw = v.videoWidth
  const vh = v.videoHeight
  const cover = Math.max(w / vw, h / vh)
  const fit = Math.min(w / vw, h / vh)
  const put = (k) => ctx.drawImage(v, (w - vw * k) / 2, (h - vh * k) / 2, vw * k, vh * k)
  // Харьцаа ойролцоо бол дүүргэж тайрна.
  if (cover / fit < 1.15) return put(cover)
  ctx.filter = 'blur(28px) brightness(0.55)'
  put(cover * 1.1)
  ctx.filter = 'none'
  put(fit)
}

// src: File эсвэл URL. shuffle: өөр цэгүүдээс авна. Буцаах: { frames: [{ time, file, url, score }], best }
export async function videoFrames(src, kind = 'movie', count = 6, shuffle = false) {
  const objectUrl = src instanceof Blob ? URL.createObjectURL(src) : null
  const v = document.createElement('video')
  v.crossOrigin = 'anonymous'
  v.muted = true
  v.playsInline = true
  v.preload = 'auto'
  v.src = objectUrl || src
  try {
    await waitFor(v, 'loadeddata', 60000)
    const duration = v.duration
    if (!duration || !isFinite(duration)) throw new Error('Видеоны уртыг уншиж чадсангүй.')
    const [w, h] = SIZE[kind] || SIZE.movie
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    const frames = []
    for (let i = 0; i < count; i++) {
      // Эхлэл, төгсгөлийн титрийг алгасна.
      const step = 0.84 / Math.max(1, count - 1)
      const shift = shuffle ? (Math.random() - 0.5) * step : 0
      const time = duration * Math.min(0.95, Math.max(0.04, 0.08 + step * i + shift))
      v.currentTime = time
      await waitFor(v, 'seeked', 30000)
      ctx.clearRect(0, 0, w, h)
      draw(ctx, v, w, h)
      let blob
      try {
        blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.86))
      } catch {
        throw new Error('Видеоноос зураг авч чадсангүй. R2-ийн CORS тохиргоог шалгана уу (README).')
      }
      if (!blob) continue
      const file = new File([blob], `cover-${Math.round(time)}.jpg`, { type: 'image/jpeg' })
      frames.push({ time, file, url: URL.createObjectURL(file), score: score(ctx, canvas) })
    }
    if (!frames.length) throw new Error('Видеоноос зураг авч чадсангүй.')
    const best = frames.reduce((b, f, i) => (f.score > frames[b].score ? i : b), 0)
    return { frames, best }
  } finally {
    v.removeAttribute('src')
    v.load()
    if (objectUrl) URL.revokeObjectURL(objectUrl)
  }
}

export const releaseFrames = (frames) => frames.forEach((f) => URL.revokeObjectURL(f.url))
