import { read } from './auth.js'

// Админ энэ хөтөч дээр засварласан жагсаалт (байвал json файлын оронд).
export const CATALOG_KEYS = { movies: 'kino-catalog-movies', shorts: 'kino-catalog-shorts' }

// Киноны жагсаалтыг public/movies.json файлаас уншина.
export async function loadMovies() {
  if (window.__MOVIES__) return window.__MOVIES__
  const local = read(CATALOG_KEYS.movies, null)
  if (local) return local
  const res = await fetch('movies.json')
  if (!res.ok) throw new Error('movies.json файлыг уншиж чадсангүй')
  return res.json()
}

export function allGenres(movies) {
  const set = new Set()
  movies.forEach((m) => (m.genres || []).forEach((g) => set.add(g)))
  return [...set].sort((a, b) => a.localeCompare(b, 'mn'))
}

export function matches(movie, query) {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return [movie.title, movie.description, movie.year, ...(movie.genres || [])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
    .includes(q)
}

// Shorts-ийг өөрийн нэр, тайлбар болон холбоотой киноны нэр, он, жанраар хайна.
export function matchesShort(short, movies, query, genre = 'Бүгд') {
  const movie = movies.find((m) => m.id === short.movie)
  if (genre !== 'Бүгд' && !(movie?.genres || []).includes(genre)) return false
  const text = [short.description, movie?.title].filter(Boolean).join(' ')
  return matches({ title: short.title, description: text, year: movie?.year, genres: movie?.genres }, query)
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
export async function loadShorts() {
  let list = read(CATALOG_KEYS.shorts, null)
  if (!list) {
    const res = await fetch('shorts.json')
    if (!res.ok) throw new Error('shorts.json файлыг уншиж чадсангүй')
    list = await res.json()
  }
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
