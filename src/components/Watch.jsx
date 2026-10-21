import { useEffect, useState } from 'react'
import MovieCard from './MovieCard.jsx'
import { recommended, timeAgo } from '../data.js'
import { formatDate, isActive, pushHistory } from '../auth.js'

export default function Watch({ movie, movies, user, onUser }) {
  const [videoError, setVideoError] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const canWatch = isActive(user)

  useEffect(() => {
    setVideoError(false)
    setExpanded(false)
  }, [movie.id])

  // Эрхтэй үед л үзсэн түүхэнд нэмнэ.
  useEffect(() => {
    if (canWatch) {
      const u = pushHistory(user, movie.id)
      if (u) onUser(u)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.id, user?.phone, canWatch])

  const list = recommended(movies, movie)

  let player
  if (!user) {
    player = (
      <div className="player-error">
        <p>Кино үзэхийн тулд нэвтэрнэ үү</p>
        <a className="btn-primary" href="#login">Нэвтрэх</a>
      </div>
    )
  } else if (!canWatch) {
    player = (
      <div className="player-error">
        <p>Таны үзэх эрх {user.subscription ? `${formatDate(user.subscription.endsAt)}-нд дууссан` : 'алга'} байна</p>
        <a className="btn-primary" href="#profile">Эрх авах</a>
      </div>
    )
  } else if (videoError) {
    player = (
      <div className="player-error">
        <p>Видео файл олдсонгүй</p>
        <code>public/{movie.video}</code>
      </div>
    )
  } else {
    player = (
      <video key={movie.id} src={movie.video} poster={movie.thumbnail} controls playsInline onError={() => setVideoError(true)} />
    )
  }

  return (
    <div className="watch">
      <div className="watch-primary">
        <div className="player">{player}</div>
        <h1 className="watch-title">{movie.title}</h1>
        <div className="watch-chips">
          {(movie.genres || []).map((g) => (
            <span key={g} className="tag">{g}</span>
          ))}
        </div>
        <div className={`description ${expanded ? 'expanded' : ''}`} onClick={() => setExpanded(true)}>
          <p className="description-meta">
            {movie.year} он · {movie.duration}
            {movie.added ? ` · ${timeAgo(movie.added)}` : ''}
          </p>
          <p>{movie.description}</p>
          {!expanded && movie.description?.length > 140 && <button className="more">...дэлгэрэнгүй</button>}
        </div>
      </div>
      <aside className="watch-secondary">
        <h2 className="section-title">Санал болгох</h2>
        {list.map((m) => (
          <MovieCard key={m.id} movie={m} compact />
        ))}
      </aside>
    </div>
  )
}
