// Хуваалцах карт (Open Graph, 1200×630): бүдгэрүүлсэн нүүр дэвсгэр, нүүр зураг, том гарчиг, "ҮНЭГҮЙ" тэмдэг.
// Facebook/Messenger-т линк хуваалцахад харагдана (functions/m). Админ кино хадгалахад хөтөч дээр зурж R2 руу хуулна.
import logoUrl from './assets/logo-k.png'
import { FREE_EPISODES, FREE_SECONDS } from './data.js'

const W = 1200
const H = 630

const loadImage = (src) =>
  new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Зураг уншиж чадсангүй'))
    img.src = src
  })

// Нүүр зургийг blob болгож уншина (кэшээс CORS-гүй хувилбар авахгүйн тулд no-store).
async function coverImage(cover) {
  const blob = cover instanceof Blob ? cover : await (await fetch(cover, { cache: 'no-store' })).blob()
  const url = URL.createObjectURL(blob)
  try {
    return await loadImage(url)
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

// Зургийг хайрцагт дүүргэж (object-fit: cover) зурна.
function drawCover(ctx, img, x, y, w, h) {
  const s = Math.max(w / img.width, h / img.height)
  const sw = w / s
  const sh = h / s
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h)
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

// Үгээр мөр таслана (max мөр, илүү бол "…").
function wrap(ctx, text, width, max) {
  const words = text.split(/\s+/).filter(Boolean)
  const lines = []
  let line = ''
  for (const w of words) {
    const next = line ? `${line} ${w}` : w
    if (ctx.measureText(next).width <= width || !line) line = next
    else {
      lines.push(line)
      line = w
    }
  }
  if (line) lines.push(line)
  if (lines.length <= max) return lines
  const out = lines.slice(0, max)
  let last = out[max - 1]
  while (last && ctx.measureText(`${last}…`).width > width) last = last.slice(0, -1)
  out[max - 1] = `${last.trimEnd()}…`
  return out
}

function playButton(ctx, cx, cy, r, color) {
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.45)'
  ctx.shadowBlur = 24
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.arc(cx, cy, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
  ctx.fillStyle = 'white'
  ctx.beginPath()
  ctx.moveTo(cx - r * 0.3, cy - r * 0.42)
  ctx.lineTo(cx + r * 0.48, cy)
  ctx.lineTo(cx - r * 0.3, cy + r * 0.42)
  ctx.closePath()
  ctx.fill()
}

// item: { title, kind, orientation, year, genres, duration }, cover: зургийн URL эсвэл File/Blob. → JPEG Blob.
export async function makeOgCard(item, cover) {
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || 'red'
  const title = (item.title || '').trim()
  await Promise.all([
    document.fonts.load('700 80px "Roboto Condensed"', title),
    document.fonts.load('500 30px Roboto', 'ҮНЭГҮЙ анги'),
    document.fonts.load('600 40px Poppins', 'KinoTube'),
  ]).catch(() => {})
  const [img, logo] = await Promise.all([coverImage(cover), loadImage(logoUrl).catch(() => null)])

  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const vertical = item.orientation === 'vertical' || img.height > img.width

  // Дэвсгэр: бүдгэрүүлсэн, харанхуйлсан нүүр.
  ctx.fillStyle = 'black'
  ctx.fillRect(0, 0, W, H)
  if (vertical) {
    ctx.filter = 'blur(36px) brightness(.5)'
    drawCover(ctx, img, -60, -60, W + 120, H + 120)
    ctx.filter = 'none'
  } else {
    drawCover(ctx, img, 0, 0, W, H)
  }
  const shade = ctx.createLinearGradient(0, 0, W, 0)
  shade.addColorStop(0, 'rgba(0,0,0,.92)')
  shade.addColorStop(0.45, 'rgba(0,0,0,.7)')
  shade.addColorStop(0.75, vertical ? 'rgba(0,0,0,.25)' : 'rgba(0,0,0,.1)')
  shade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = shade
  ctx.fillRect(0, 0, W, H)
  const bottom = ctx.createLinearGradient(0, H * 0.55, 0, H)
  bottom.addColorStop(0, 'rgba(0,0,0,0)')
  bottom.addColorStop(1, 'rgba(0,0,0,.6)')
  ctx.fillStyle = bottom
  ctx.fillRect(0, 0, W, H)

  // Босоо бол нүүрийг баруун талд постер шиг, хэвтээ бол зургийн голд тоглуулах товч.
  if (vertical) {
    const ph = 560
    const pw = Math.round(ph * 9 / 16)
    const px = W - pw - 70
    const py = (H - ph) / 2
    ctx.save()
    ctx.shadowColor = 'rgba(0,0,0,.6)'
    ctx.shadowBlur = 40
    roundRect(ctx, px, py, pw, ph, 22)
    ctx.fillStyle = 'black'
    ctx.fill()
    ctx.restore()
    ctx.save()
    roundRect(ctx, px, py, pw, ph, 22)
    ctx.clip()
    drawCover(ctx, img, px, py, pw, ph)
    ctx.restore()
    playButton(ctx, px + pw / 2, py + ph / 2, 46, accent)
  } else {
    playButton(ctx, W * 0.78, H * 0.5, 54, accent)
  }

  const left = 64
  const textW = vertical ? 700 : 640

  // Лого
  if (logo) ctx.drawImage(logo, left, 52, 52 * (logo.width / logo.height), 52)
  ctx.fillStyle = 'white'
  ctx.font = '600 38px Poppins, sans-serif'
  ctx.textBaseline = 'middle'
  ctx.fillText('KinoTube', left + (logo ? 52 * (logo.width / logo.height) + 12 : 0), 80)

  // Гарчиг: урт бол жижигрүүлнэ.
  let size = 92
  let lines
  for (; size >= 54; size -= 6) {
    ctx.font = `700 ${size}px "Roboto Condensed", "Arial Narrow", sans-serif`
    lines = wrap(ctx, title.toUpperCase(), textW, 3)
    if (lines.length <= 2 || size <= 60) break
  }
  const lh = size * 1.04
  const meta = [item.year, (item.genres || []).slice(0, 2).join(', '), item.kind === 'series' ? 'Цуврал' : (item.duration || '').replace(/^0:/, '')]
    .filter(Boolean).join('  ·  ')
  const blockH = lines.length * lh + (meta ? 56 : 0) + 100
  let y = Math.max(160, (H - blockH) / 2 + 30)

  ctx.textBaseline = 'top'
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.6)'
  ctx.shadowBlur = 16
  ctx.fillStyle = 'white'
  for (const l of lines) {
    ctx.fillText(l, left, y)
    y += lh
  }
  ctx.restore()

  if (meta) {
    y += 10
    ctx.font = '400 30px Roboto, sans-serif'
    ctx.fillStyle = 'rgba(255,255,255,.82)'
    ctx.fillText(meta, left, y)
    y += 46
  }

  // "ҮНЭГҮЙ" тэмдэг
  y += 18
  const badge = item.kind === 'series' ? `Эхний ${FREE_EPISODES} анги ҮНЭГҮЙ` : `Эхний ${FREE_SECONDS / 60} минут ҮНЭГҮЙ`
  ctx.font = '700 32px Roboto, sans-serif'
  const bw = ctx.measureText(badge).width + 96
  roundRect(ctx, left, y, bw, 64, 32)
  ctx.fillStyle = accent
  ctx.fill()
  ctx.fillStyle = 'white'
  ctx.beginPath()
  ctx.moveTo(left + 30, y + 18)
  ctx.lineTo(left + 54, y + 32)
  ctx.lineTo(left + 30, y + 46)
  ctx.closePath()
  ctx.fill()
  ctx.textBaseline = 'middle'
  ctx.fillText(badge, left + 68, y + 33)

  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Карт үүсгэж чадсангүй'))), 'image/jpeg', 0.88))
}
