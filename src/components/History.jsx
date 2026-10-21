import { useState } from 'react'
import Thumbnail from './Thumbnail.jsx'
import { CloseIcon, SearchIcon, TrashIcon } from './Icons.jsx'
import { formatTime, matches } from '../data.js'
import { clearHistory, formatDate, getHistory, removeHistory, watchedRatio } from '../auth.js'

// Үзсэн огноогоор нь бүлэглэнэ: Өнөөдөр, Өчигдөр, Энэ долоо хоног, эсвэл огноо.
function dayLabel(iso) {
  if (!iso) return 'Өмнө нь'
  const d = new Date(iso)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const day = new Date(d)
  day.setHours(0, 0, 0, 0)
  const diff = Math.round((today - day) / 86400000)
  if (diff <= 0) return 'Өнөөдөр'
  if (diff === 1) return 'Өчигдөр'
  if (diff < 7) return 'Энэ долоо хоног'
  return formatDate(iso)
}

export default function History({ movies, user, onUser }) {
  const [query, setQuery] = useState('')
  const [confirming, setConfirming] = useState(false)

  if (!user) {
    return (
      <div className="history-page">
        <div className="history-empty">
          <h1>Үзсэн түүх</h1>
          <p className="muted">Үзсэн киногоо эндээс эргэж олохын тулд нэвтэрнэ үү.</p>
          <a className="btn-primary" href="#login">Нэвтрэх</a>
        </div>
      </div>
    )
  }

  const items = getHistory(user)
    .map((h) => ({ ...h, movie: movies.find((m) => m.id === h.id) }))
    .filter((h) => h.movie && matches(h.movie, query))

  const groups = []
  items.forEach((h) => {
    const label = dayLabel(h.at)
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.items.push(h)
    else groups.push({ label, items: [h] })
  })

  const remove = (id) => onUser(removeHistory(user, id))
  const clearAll = () => {
    onUser(clearHistory(user))
    setConfirming(false)
  }

  const total = getHistory(user).length

  return (
    <div className="history-page">
      <div className="history-main">
        <h1 className="history-heading">Үзсэн түүх</h1>
        {movies.length === 0 ? (
          <p className="notice">Ачаалж байна…</p>
        ) : items.length === 0 ? (
          <p className="notice">{query ? `"${query}" түүхээс олдсонгүй.` : 'Та одоогоор кино үзээгүй байна.'}</p>
        ) : (
          groups.map((g) => (
            <section key={g.label} className="history-group">
              <h2>{g.label}</h2>
              <ul className="list">
                {g.items.map((h) => {
                  const ratio = watchedRatio(h)
                  const href = `#watch-${encodeURIComponent(h.id)}`
                  return (
                    <li key={h.id} className="history-item">
                      <a className="history-thumb" href={href}>
                        <Thumbnail movie={h.movie} small progress={ratio} />
                      </a>
                      <a className="history-text" href={href}>
                        <h3>{h.movie.title}</h3>
                        <p className="muted">{h.movie.year} он · {(h.movie.genres || []).join(' · ')}</p>
                        <p className="history-status">
                          {h.done
                            ? 'Бүтэн үзсэн'
                            : h.pos > 0
                              ? `${formatTime(h.pos)} / ${h.dur ? formatTime(h.dur) : h.movie.duration} хүртэл үзсэн`
                              : 'Үзэж эхэлсэн'}
                        </p>
                        <p className="history-desc">{h.movie.description}</p>
                      </a>
                      <button className="icon-btn history-remove" onClick={() => remove(h.id)} aria-label="Түүхээс хасах" title="Түүхээс хасах">
                        <CloseIcon />
                      </button>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))
        )}
      </div>

      <aside className="history-side">
        <label className="history-search">
          <SearchIcon />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Түүхээс хайх" />
          {query && (
            <button className="icon-btn" onClick={() => setQuery('')} aria-label="Арилгах"><CloseIcon /></button>
          )}
        </label>
        {total > 0 && (
          confirming ? (
            <div className="history-confirm">
              <p>Бүх үзсэн түүхээ устгах уу?</p>
              <div>
                <button className="btn-small" onClick={clearAll}>Устгах</button>
                <button className="btn-secondary btn-sm" onClick={() => setConfirming(false)}>Болих</button>
              </div>
            </div>
          ) : (
            <button className="side-action" onClick={() => setConfirming(true)}>
              <TrashIcon />
              <span>Бүх түүхийг устгах</span>
            </button>
          )
        )}
      </aside>
    </div>
  )
}
