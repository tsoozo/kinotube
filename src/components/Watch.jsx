import { useEffect, useRef, useState } from 'react'
import MovieCard from './MovieCard.jsx'
import Player from './Player.jsx'
import { CaptionsIcon, CaptionsOffIcon, LockIcon, SaveIcon, SavedIcon, SpeedIcon } from './Icons.jsx'
import { formatTime, hue, recommended, subtitlesOf, timeAgo } from '../data.js'
import {
  PLANS, RENTAL, buyPlan, canWatchMovie, formatDate, formatDateTime, formatMoney, getProgress, isLater, pushHistory, rentMovie,
  rentalEndsAt, saveProgress, setReturnTo, takeReturnTo, toggleLater, watchedRatio,
} from '../auth.js'

const SPEEDS = [0.75, 1, 1.25, 1.5, 2]

export default function Watch({ movie, movies, user, onUser }) {
  const [videoError, setVideoError] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [resumed, setResumed] = useState(0)
  const [shape, setShape] = useState('tall')
  const [speed, setSpeed] = useState(1)
  const [captions, setCaptions] = useState(true)
  const [flash, setFlash] = useState('')
  const [payError, setPayError] = useState('')
  const [bgFailed, setBgFailed] = useState(false)
  const videoRef = useRef(null)
  const lastSave = useRef(0)
  const flashTimer = useRef(0)
  const canWatch = canWatchMovie(user, movie.id)
  const rentEnds = rentalEndsAt(user, movie.id)
  const subs = subtitlesOf(movie)
  const saved = isLater(user, movie.id)

  useEffect(() => {
    setVideoError(false)
    setExpanded(false)
    setResumed(0)
    setShape('tall')
    setPayError('')
    setBgFailed(false)
  }, [movie.id])

  // Хурд, хадмалыг тоглуулагчид тохируулна.
  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed
  }, [speed])

  useEffect(() => {
    const tracks = videoRef.current?.textTracks
    if (!tracks) return
    for (let i = 0; i < tracks.length; i++) tracks[i].mode = captions && i === 0 ? 'showing' : 'hidden'
  }, [captions, movie.id, canWatch, videoError])

  const show = (text) => {
    setFlash(text)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(''), 900)
  }

  const changeSpeed = (s) => {
    setSpeed(s)
    show(`${s}×`)
  }

  // Тоглуулагчийн товчлолоос гадна: C хадмал, < > хурд.
  useEffect(() => {
    const onKey = (e) => {
      if (!videoRef.current || e.ctrlKey || e.metaKey || e.altKey) return
      if (e.target.closest?.('input, textarea, select, [contenteditable]')) return
      if (e.key.toLowerCase() === 'c' && subs.length) {
        setCaptions((c) => !c)
        show(captions ? 'Хадмал унтраав' : 'Хадмал асаав')
      } else if (e.key === '>' || e.key === '<') {
        const i = SPEEDS.indexOf(speed) + (e.key === '>' ? 1 : -1)
        changeSpeed(SPEEDS[Math.min(SPEEDS.length - 1, Math.max(0, i))])
      } else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

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
    if (v) v.playbackRate = speed
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

  const month = PLANS[0]

  // Дансаас төлнө. Үлдэгдэл хүрэхгүй бол цэнэглээд энэ кино руу буцна.
  const pay = (fn) => {
    try {
      onUser(fn())
      setPayError('')
      takeReturnTo()
    } catch (e) {
      setReturnTo(movie.id)
      setPayError(e.message)
    }
  }

  // Түгжээтэй үед ард нь киноны зургийг бүдгэрүүлж тавина. Зураггүй бол өнгөт fallback.
  const h = hue(movie.id)
  const backdrop = (
    <div className="locked-bg" aria-hidden="true" style={{ background: `linear-gradient(135deg, hsl(${h} 45% 22%), hsl(${(h + 40) % 360} 55% 38%))` }}>
      {movie.thumbnail && !bgFailed && <img src={movie.thumbnail} alt="" onError={() => setBgFailed(true)} />}
    </div>
  )

  let player
  if (!user) {
    player = (
      <div className="player-error player-locked">
        {backdrop}
        <LockIcon />
        <p className="player-lead">Кино үзэхийн тулд нэвтэрнэ үү</p>
        <p className="player-sub">Энэ кино {formatMoney(RENTAL.price)} · бүх кино сард {formatMoney(month.price)}</p>
        <a className="btn-primary" href="#login" onClick={() => setReturnTo(movie.id)}>Нэвтрэх</a>
      </div>
    )
  } else if (!canWatch) {
    player = (
      <div className="player-error player-locked">
        {backdrop}
        <LockIcon />
        <p className="player-lead">
          {user.subscription ? `Таны эрх ${formatDate(user.subscription.endsAt)}-нд дууссан` : 'Үзэх эрхээ сонгоно уу'}
        </p>
        <div className="pay-options">
          <button className="pay-option" onClick={() => pay(() => rentMovie(user, movie))}>
            <span>Зөвхөн энэ кино</span>
            <b>{formatMoney(RENTAL.price)}</b>
            <small>{RENTAL.days} хоног үзнэ</small>
          </button>
          <button className="pay-option featured" onClick={() => pay(() => buyPlan(user, month.id))}>
            <span>Бүх кино <em className="pay-badge">Ашигтай</em></span>
            <b>{formatMoney(month.price)}</b>
            <small>1 сар хязгааргүй</small>
          </button>
        </div>
        {payError ? (
          <p className="player-sub">
            {payError} <a className="pay-link" href="#profile">Данс цэнэглэх</a>
          </p>
        ) : (
          <p className="player-sub">Дансны үлдэгдэл {formatMoney(user.balance)}</p>
        )}
      </div>
    )
  } else if (videoError) {
    player = (
      <div className="player-error">
        <p className="player-lead">Энэ кино удахгүй нэмэгдэнэ</p>
        <p className="player-sub">Видеог бэлтгэж байна. Дараа дахин орж үзээрэй.</p>
        {import.meta.env.DEV && <code>public/{movie.video}</code>}
      </div>
    )
  } else {
    player = (
      <Player
        key={movie.id}
        videoRef={videoRef}
        onShape={setShape}
        src={movie.video}
        poster={movie.thumbnail}
        onLoadedMetadata={onLoaded}
        onTimeUpdate={onTime}
        onPause={save}
        onEnded={save}
        onError={() => setVideoError(true)}
      >
        {subs.map((t, i) => (
          <track key={t.src} kind="subtitles" src={t.src} srcLang={t.lang} label={t.label} default={i === 0} />
        ))}
      </Player>
    )
  }
  const playing = user && canWatch && !videoError

  return (
    <div className="watch">
      <div className="watch-primary">
        <div className={`player ${shape === 'wide' ? 'is-wide' : ''}`}>
          {player}
          {flash && <span className="player-flash" aria-live="polite">{flash}</span>}
        </div>
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
        {rentEnds && <p className="muted rent-note">Энэ киног {formatDateTime(rentEnds)} хүртэл үзэх эрхтэй</p>}
        <div className="watch-actions">
          <button
            className={`action-btn ${saved ? 'active' : ''}`}
            aria-pressed={saved}
            onClick={() => {
              if (!user) {
                setReturnTo(movie.id)
                location.hash = 'login'
              } else onUser(toggleLater(user, movie.id))
            }}
          >
            {saved ? <SavedIcon /> : <SaveIcon />}
            <span>{saved ? 'Хадгалсан' : 'Дараа үзэх'}</span>
          </button>
          {playing && subs.length > 0 && (
            <button className={`action-btn ${captions ? 'active' : ''}`} aria-pressed={captions} title="Хадмал (C)" onClick={() => setCaptions((c) => !c)}>
              {captions ? <CaptionsIcon /> : <CaptionsOffIcon />}
              <span>Хадмал</span>
            </button>
          )}
          {playing && (
            <button className="action-btn" title="Тоглуулах хурд (< >)" onClick={() => changeSpeed(SPEEDS[(SPEEDS.indexOf(speed) + 1) % SPEEDS.length])}>
              <SpeedIcon />
              <span>{speed}×</span>
            </button>
          )}
        </div>
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
          <MovieCard key={m.id} movie={m} compact progress={user ? watchedRatio(getProgress(user, m.id)) : 0} />
        ))}
      </aside>
    </div>
  )
}
