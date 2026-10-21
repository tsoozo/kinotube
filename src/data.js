// Киноны жагсаалтыг public/movies.json файлаас уншина.
export async function loadMovies() {
  if (window.__MOVIES__) return window.__MOVIES__
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

export function timeAgo(dateStr) {
  if (!dateStr) return ''
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days < 1) return 'Өнөөдөр нэмсэн'
  if (days < 30) return `${days} өдрийн өмнө`
  if (days < 365) return `${Math.floor(days / 30)} сарын өмнө`
  return `${Math.floor(days / 365)} жилийн өмнө`
}
