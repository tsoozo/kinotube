import { configured, supabase } from './auth.js'

// Supabase-ийн catalog мөр → апп доторх хэлбэр. Зураг R2-д: img/<key> (functions/img).
function fromRow(r) {
  return {
    id: r.id,
    title: r.title,
    year: r.year,
    genres: r.genres || [],
    categories: r.categories || [],
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
      .then(async ({ data, error }) => {
        if (!error) return data.map((r) => ({ ...fromRow(r), kind: r.kind }))
        // catalog хүснэгт хараахан үүсээгүй (migration хэрэгжээгүй) бол json файлаас.
        console.warn('catalog:', error.message)
        catalog = null
        const [movies, shorts] = await Promise.all([loadJson('movies.json'), loadJson('shorts.json')])
        return [...movies.map((m) => ({ ...m, kind: 'movie' })), ...shorts.map((s) => ({ ...s, kind: 'short' }))]
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

// Киноны ангилал (нүүрний чип, админ). Түлхүүр нь серверийн catalog.categories-тэй ижил.
export const CATEGORIES = [
  { id: 'ai', label: 'AI кино' },
  { id: 'old', label: 'Хуучны кино' },
  { id: 'mongolian', label: 'Монгол кино' },
  { id: 'chinese', label: 'Хятад кино' },
  { id: 'korean', label: 'Солонгос кино' },
]
export const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label || id
export const inCategory = (movie, category) => !category || (movie?.categories || []).includes(category)

export function allGenres(movies) {
  const set = new Set()
  movies.forEach((m) => (m.genres || []).forEach((g) => set.add(g)))
  return [...set].sort((a, b) => a.localeCompare(b, 'mn'))
}

export function matches(movie, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [movie.title, movie.description, movie.year, ...(movie.genres || []), ...(movie.categories || []).map(categoryLabel)]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q)
}

// Shorts-ийг өөрийн нэр, тайлбар болон холбоотой киноны нэр, он, жанраар хайна.
export function matchesShort(short, movies, query, genre = 'Бүгд', category = '') {
  const movie = movies.find((m) => m.id === short.movie)
  if (genre !== 'Бүгд' && !(movie?.genres || []).includes(genre)) return false
  if (category && !inCategory(movie, category)) return false
  const text = [short.description, movie?.title].filter(Boolean).join(' ')
  return matches({ title: short.title, description: text, year: movie?.year, genres: movie?.genres, categories: movie?.categories }, query)
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
