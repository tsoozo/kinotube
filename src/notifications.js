import { daysLeft, isActive } from './auth.js'

const NEW_MOVIE_DAYS = 30

// Мэдэгдлийн жагсаалт: шинэ кино болон үзэх эрхийн сануулга, шинэ нь эхэндээ.
export function buildNotifications(movies, user) {
  const list = []
  const sub = user?.subscription
  if (sub) {
    const left = daysLeft(user)
    if (!isActive(user)) {
      list.push({ id: `plan-ended-${sub.endsAt}`, type: 'plan', at: sub.endsAt, text: `${sub.label} дууссан. Кино үзэхийн тулд эрхээ сунгаарай.`, href: '#profile' })
    } else if (left <= 7) {
      list.push({ id: `plan-soon-${sub.endsAt}`, type: 'plan', at: new Date().toISOString(), text: `${sub.label} ${left} хоногийн дараа дуусна.`, href: '#profile' })
    }
  }
  const since = Date.now() - NEW_MOVIE_DAYS * 86400000
  movies
    .filter((m) => m.added && new Date(m.added).getTime() >= since)
    .forEach((m) => list.push({ id: `movie-${m.id}`, type: 'movie', at: m.added, movie: m, text: `Шинэ кино нэмэгдлээ: ${m.title} (${m.year})`, href: `#watch-${encodeURIComponent(m.id)}` }))
  return list.sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 20)
}
