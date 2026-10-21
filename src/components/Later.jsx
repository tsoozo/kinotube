import MovieCard from './MovieCard.jsx'
import { CloseIcon, HistoryIcon } from './Icons.jsx'
import { getLater, getProgress, toggleLater, watchedRatio } from '../auth.js'

// Дараа үзэхээр хадгалсан кинонууд.
export default function Later({ movies, user, onUser }) {
  if (!user) {
    return (
      <div className="history-page">
        <div className="history-empty">
          <h1>Дараа үзэх</h1>
          <p className="muted">Кино хадгалж, дараа нь эндээс үзэхийн тулд нэвтэрнэ үү.</p>
          <a className="btn-primary" href="#login">Нэвтрэх</a>
        </div>
      </div>
    )
  }

  const items = getLater(user).map((x) => movies.find((m) => m.id === x.id)).filter(Boolean)

  return (
    <div className="later-page">
      <h1 className="history-heading">Дараа үзэх</h1>
      <a className="side-action later-back" href="#history">
        <HistoryIcon />
        <span>Үзсэн түүх</span>
      </a>
      {items.length === 0 ? (
        <p className="notice">Жагсаалт хоосон байна. Кино үзэх хуудсан дээрх "Дараа үзэх" товчоор нэмнэ.</p>
      ) : (
        <>
          <p className="muted later-count">{items.length} кино</p>
          <div className="grid">
            {items.map((m) => (
              <div key={m.id} className="later-item">
                <MovieCard movie={m} progress={watchedRatio(getProgress(user, m.id))} />
                <button className="icon-btn later-remove" aria-label={`${m.title}-г хасах`} title="Жагсаалтаас хасах" onClick={() => onUser(toggleLater(user, m.id))}>
                  <CloseIcon width="20" height="20" />
                </button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
