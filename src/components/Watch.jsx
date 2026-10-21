import { useEffect, useRef, useState } from 'react'
import MovieCard from './MovieCard.jsx'
import { formatTime, recommended, timeAgo } from '../data.js'
import { formatDate, getProgress, isActive, pushHistory, saveProgress } from '../auth.js'

export default function Watch({ movie, movies, user, onUser }) {
  const [videoError, setVideoError] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [resumed, setResumed] = useState(0)
  const videoRef = useRef(null)
  const lastSave = useRef(0)
  const canWatch = isActive(user)

  useEffect(() => {
    setVideoError(false)
    setExpanded(false)
    setResumed(0)
  }, [movie.id])

  const save = () => {
    const v = videoRef.current
    if (v && user && v.currentTime > 0) saveProgress(user, movie.id, v.currentTime, v.duration)
  }

  // Хуудаснаас гарах үед байрлалыг хадгална.
  useEffect(() => {
    const v = videoRef.current
    window.addEventListener('pagehide', save)
    return () => {
      window.removeEventListener('pagehide', save)
      if (v && user && v.currentTime > 0) saveProgress(user, movie.id, v.currentTime, v.duration)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.id, user?.phone, canWatch])

  // Өмнө зогссон газраас нь үргэлжлүүлнэ.
  const onLoaded = () => {
    const h = getProgress(user, movie.id)
    const v = videoRef.current
    if (v && h && !h.done && h.pos > 5 && h.pos < v.duration - 10) {
      v.currentTime = h.pos
      setResumed(h.pos)
    }
  }

  // 5 секунд тутам хадгална.
  const onTime = () => {
    const now = Date.now()
    if (now - lastSave.current > 5000) {
      lastSave.current = now
      save()
    }
  }

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
      <video
        key={movie.id}
        ref={videoRef}
        src={movie.video}
        poster={movie.thumbnail}
        controls
        playsInline
        onLoadedMetadata={onLoaded}
        onTimeUpdate={onTime}
        onPause={save}
        onEnded={save}
        onError={() => setVideoError(true)}
      />
    )
  }

  return (
    <div className="watch">
      <div className="watch-primary">
        <div className="player">{player}</div>
        {resumed > 0 && (
          <p className="resume-note">
            {formatTime(resumed)}-аас үргэлжлүүлж байна ·{' '}
            <button
              className="link-btn"
              onClick={() => {
                if (videoRef.current) videoRef.current.currentTime = 0
                setResumed(0)
              }}
            >
              Эхнээс нь үзэх
            </button>
          </p>
        )}
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
