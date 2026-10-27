import { configured, supabase } from './auth.js'

// Supabase-ийн catalog мөр → апп доторх хэлбэр. Зураг R2-д: img/<key> (functions/img).
function fromRow(r) {
  return {
    id: r.id,
    title: r.title,
    year: r.year,
    genres: r.genres || [],
    duration: r.duration || '',
    description: r.description || '',
    thumbnail: r.thumbnail ? `img/${r.thumbnail}` : '',
    thumbKey: r.thumbnail || '',
    subtitles: r.subtitles || undefined,
    movie: r.movie_id || undefined,
    added: r.added,
    published: r.published,
    videoReady: r.video_ready,
    videoSize: r.video_size,
  }
}

let catalog = null

// Кино, Shorts-ийг нэг дор уншина (админд ноорог ч орно, RLS). refresh: дахин уншина.
function loadCatalog(refresh = false) {
  if (!catalog || refresh) {
    catalog = supabase
      .from('catalog')
      .select('*')
      .order('added', { ascending: false })
      .order('title')
      .then(({ data, error }) => {
        if (error) {
          catalog = null
          throw new Error('Киноны жагсаалтыг уншиж чадсангүй. Дахин оролдоно уу.')
        }
        return data.map((r) => ({ ...fromRow(r), kind: r.kind }))
      })
  }
  return catalog
}

// Сервер тохируулаагүй (локал хөгжүүлэлт) бол public/*.json-оос.
async function loadJson(file) {
  const res = await fetch(file)
  if (!res.ok) throw new Error(`${file} файлыг уншиж чадсангүй`)
  return res.json()
}

export async function loadMovies(refresh = false) {
  if (window.__MOVIES__) return window.__MOVIES__
  if (!configured) return loadJson('movies.json')
  return (await loadCatalog(refresh)).filter((m) => m.kind === 'movie')
}

// Хэрэглэгчдэд харагдах нь: нийтэлсэн (json-д published байхгүй).
export const isPublic = (item) => item.published !== false

export function allGenres(movies) {
  const set = new Set()
  movies.forEach((m) => (m.genres || []).forEach((g) => set.add(g)))
  return [...set].sort((a, b) => a.localeCompare(b, 'mn'))
}

export function matches(movie, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [movie.title, movie.description, String(movie.year), ...(movie.genres || [])]
    .join(' ')
    .toLowerCase()
    .includes(q)
}

// Нэг жанртай киног эхэнд, дараа нь бусдыг нь.
export function recommended(movies, current) {
  const genres = new Set(current.genres || [])
  return movies
    .filter((m) => m.id !== current.id)
    .map((m) => ({ m, score: (m.genres || []).filter((g) => genres.has(g)).length }))
    .sort((a, b) => b.score - a.score)
    .map((x) => x.m)
}

// Хадмал: "subtitles": "subtitles/x.vtt" (монгол) эсвэл [{ "src", "lang", "label" }].
export function subtitlesOf(movie) {
  const s = movie.subtitles
  if (!s) return []
  if (typeof s === 'string') return [{ src: s, lang: 'mn', label: 'Монгол' }]
  return s.filter((t) => t?.src).map((t) => ({ src: t.src, lang: t.lang || 'mn', label: t.label || 'Монгол' }))
}

export function timeAgo(dateStr) {
  if (!dateStr) return ''
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days < 1) return 'Өнөөдөр нэмсэн'
  if (days < 30) return `${days} өдрийн өмнө`
  if (days < 365) return `${Math.floor(days / 30)} сарын өмнө`
  return `${Math.floor(days / 365)} жилийн өмнө`
}

// id-аас тогтмол өнгө (зураггүй үеийн fallback-д).
export function hue(str) {
  let h = 0
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

// Shorts-ийн дээд урт: 20 минут.
export const SHORTS_MAX_SECONDS = 20 * 60

// "Ц:ММ:СС" эсвэл "М:СС" -> секунд.
export function toSeconds(duration) {
  return String(duration || '')
    .split(':')
    .reduce((sum, part) => sum * 60 + (Number(part) || 0), 0)
}

// public/shorts.json-ийг уншаад 20 минутаас урт бичлэгийг хасна.
export async function loadShorts(refresh = false) {
  const list = configured ? (await loadCatalog(refresh)).filter((m) => m.kind === 'short') : await loadJson('shorts.json')
  return list.filter((s) => {
    const sec = toSeconds(s.duration)
    if (sec > 0 && sec <= SHORTS_MAX_SECONDS) return true
    console.warn(`Shorts "${s.id}" хасагдлаа: урт нь ${s.duration || 'тодорхойгүй'} (дээд тал нь 20:00)`)
    return false
  })
}

// Секундийг "Ц:ММ:СС" эсвэл "М:СС" болгоно.
export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0))
  const pad = (n) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}
