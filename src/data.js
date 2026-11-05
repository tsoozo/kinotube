import { configured, supabase } from './auth.js'

// Supabase-ийн catalog мөр → апп доторх хэлбэр. Зураг R2-д: img/<key> (functions/img).
function fromRow(r) {
  return {
    id: r.id,
    kind: r.kind,
    orientation: r.orientation || 'horizontal',
    title: r.title,
    year: r.year,
    genres: r.genres || [],
    categories: r.categories || [],
    price: r.price_mnt || undefined,
    duration: r.duration || '',
    description: r.description || '',
    thumbnail: r.thumbnail ? `img/${r.thumbnail}` : '',
    thumbKey: r.thumbnail || '',
    subtitles: r.subtitles || undefined,
    added: r.added,
    published: r.published,
    videoReady: r.video_ready,
    videoSize: r.video_size,
    episodes: [],
  }
}

const fromEpisode = (e) => ({
  number: e.number,
  title: e.title || '',
  duration: e.duration || '',
  videoReady: e.video_ready,
  videoSize: e.video_size,
})

let catalog = null

// Кино, цувралыг ангитай нь нэг дор уншина (админд ноорог ч орно, RLS). refresh: дахин уншина.
function loadCatalog(refresh = false) {
  if (!catalog || refresh) {
    catalog = Promise.all([
      supabase.from('catalog').select('*').order('added', { ascending: false }).order('title'),
      supabase.from('episodes').select('series_id, number, title, duration, video_ready, video_size').order('number'),
    ]).then(async ([{ data, error }, eps]) => {
      if (!error) {
        const items = data.map(fromRow)
        const byId = new Map(items.map((m) => [m.id, m]))
        ;(eps.data || []).forEach((e) => byId.get(e.series_id)?.episodes.push(fromEpisode(e)))
        return items
      }
      // catalog хүснэгт хараахан үүсээгүй (migration хэрэгжээгүй) бол json файлаас.
      console.warn('catalog:', error.message)
      catalog = null
      return loadLocal()
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

// movies.json: нэг ангитай кино, shorts.json: босоо цуврал (ангиудтай).
async function loadLocal() {
  const [movies, series] = await Promise.all([loadJson('movies.json'), loadJson('shorts.json').catch(() => [])])
  return [
    ...movies.map((m) => ({ orientation: 'horizontal', ...m, kind: 'movie', episodes: [] })),
    ...series.map((s) => ({ orientation: 'vertical', ...s, kind: 'series', episodes: s.episodes || [] })),
  ]
}

// Бүх кино, цуврал (kind: movie | series).
export async function loadMovies(refresh = false) {
  if (window.__MOVIES__) return window.__MOVIES__
  if (!configured) return loadLocal()
  return loadCatalog(refresh)
}

// Үнэгүй үзэх дүрэм (сервер functions/api/video ижил server/free.js-ээр шалгана).
import { FREE_EPISODES } from '../server/free.js'
export { FREE_EPISODES, FREE_SECONDS, SHORTS_FREE_SECONDS, freeLabel, freeLimit } from '../server/free.js'

export const isSeries = (item) => item?.kind === 'series'
// Shorts = босоо кино (олон ангитай цуврал эсвэл нэг ангитай кино).
export const isShortsItem = (item) => item?.orientation === 'vertical'
export const episodesOf = (item) => (item?.episodes || []).slice().sort((a, b) => a.number - b.number)
export const isFreeEpisode = (n) => n <= FREE_EPISODES

// Үзэх хаяг: босоо кино Shorts-д, бусад нь үзэх хуудсанд. ep: ангийн дугаар.
export function watchHref(item, ep) {
  const id = encodeURIComponent(item.id)
  const suffix = ep ? `/${ep}` : ''
  return isShortsItem(item) ? `#shorts-${id}${suffix}` : `#watch-${id}${suffix}`
}

// Хуваалцах хаяг: /m/<id> нь Facebook, Messenger-т кино бүрийн зураг, гарчигтай харагдана (functions/m).
export const shareUrl = (item, ep) => `${location.origin}/m/${encodeURIComponent(item.id)}${ep ? `/${ep}` : ''}`

// Утсанд хуваалцах цонх, бусад үед линкийг хуулна. → 'shared' | 'copied' | null
export async function shareItem(item, ep) {
  const url = shareUrl(item, ep)
  if (navigator.share) {
    try {
      await navigator.share({ title: item.title, url })
      return 'shared'
    } catch (err) {
      if (err.name === 'AbortError') return null
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    window.prompt('Линкийг хуулж хуваалцаарай', url)
    return null
  }
}

// Картын доор/зурган дээр: кино бол урт, цуврал бол ангийн тоо.
export const lengthLabel = (item) => (isSeries(item) ? `${item.episodes?.length || 0} анги` : (item.duration || '').replace(/^0:/, ''))

// Хэрэглэгчдэд харагдах нь: нийтэлсэн (json-д published байхгүй).
export const isPublic = (item) => item.published !== false

// Киноны ангилал (нүүрний чип, админ). Түлхүүр нь серверийн catalog.categories-тэй ижил.
export const CATEGORIES = [
  { id: 'ai', label: 'AI кино' },
  { id: 'old', label: 'Хуучны кино' },
  { id: 'mongolian', label: 'Монгол кино' },
  { id: 'chinese', label: 'Хятад кино' },
  { id: 'korean', label: 'Солонгос кино' },
  { id: 'russian', label: 'Орос кино' },
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

// "Ц:ММ:СС" эсвэл "М:СС" -> секунд.
export function toSeconds(duration) {
  return String(duration || '')
    .split(':')
    .reduce((sum, part) => sum * 60 + (Number(part) || 0), 0)
}

// Секундийг "Ц:ММ:СС" эсвэл "М:СС" болгоно.
export function formatTime(sec) {
  const s = Math.max(0, Math.floor(sec || 0))
  const pad = (n) => String(n).padStart(2, '0')
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`
}
