import { useEffect, useRef, useState } from 'react'
import MovieCard from './MovieCard.jsx'
import Player from './Player.jsx'
import { CaptionsIcon, CaptionsOffIcon, CrownIcon, LockIcon, SaveIcon, SavedIcon, SpeedIcon } from './Icons.jsx'
import { categoryLabel, formatTime, hue, recommended, subtitlesOf, timeAgo } from '../data.js'
import {
  PLANS, RENTAL, canWatchMovie, formatDate, formatDateTime, formatMoney, getProgress, isLater, loadUser, pushHistory,
  recordView, rentPrice, rentalEndsAt, saveProgress, setReturnTo, toggleLater, videoUrl, watchedRatio,
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
  const [bgFailed, setBgFailed] = useState(false)
  const [src, setSrc] = useState(null)
  const videoRef = useRef(null)
  const retried = useRef(false)
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
    setBgFailed(false)
  }, [movie.id])

  // Видеоны хугацаатай линкийг серверээс авна (эрхийг сервер дахин шалгана).
  const fetchSrc = () =>
    videoUrl(movie)
      .then(setSrc)
      .catch((e) => {
        // Эрх дууссан бол хэрэглэгчийн мэдээллийг шинэчилж, түгжээтэй дэлгэц гаргана.
        if (e.status === 401 || e.status === 403) loadUser().then((u) => u && onUser(u))
        setVideoError(true)
      })

  useEffect(() => {
    setSrc(null)
    retried.current = false
    // Видео R2-д хараахан хуулагдаагүй бол шууд "удахгүй нэмэгдэнэ".
    if (user && canWatch) movie.videoReady === false ? setVideoError(true) : fetchSrc()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.id, user?.id, canWatch])

  // Линкийн хугацаа дууссан байж болзошгүй: нэг удаа шинээр авна.
  const onVideoError = () => {
    if (src && src !== movie.video && !retried.current) {
      retried.current = true
      save()
      fetchSrc()
    } else setVideoError(true)
  }

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
  }, [movie.id, user?.id, canWatch])

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
      recordView(user, movie.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movie.id, user?.id, canWatch])

  const list = recommended(movies, movie)

  const month = PLANS[0]

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
        <p className="player-sub">Энэ кино {formatMoney(rentPrice(movie))} · бүх кино сард {formatMoney(month.price)}</p>
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
          <a className="pay-option" href={`#pay-rent-${encodeURIComponent(movie.id)}`}>
            <span>Зөвхөн энэ кино</span>
            <b>{formatMoney(rentPrice(movie))}</b>
            <small>{RENTAL.days} хоног үзнэ</small>
          </a>
          <a className="pay-option premium" href={`#pay-month-${encodeURIComponent(movie.id)}`}>
            <CrownIcon className="pay-crown" />
            <span>Бүх кино</span>
            <b>{formatMoney(month.price)}</b>
            <small>1 сар хязгааргүй</small>
          </a>
        </div>
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
  } else if (!src) {
    player = (
      <div className="player-error" role="status">
        <p className="player-sub">Ачаалж байна…</p>
      </div>
    )
  } else {
    player = (
      <Player
        key={movie.id}
        videoRef={videoRef}
        onShape={setShape}
        src={src}
        poster={movie.thumbnail}
        onLoadedMetadata={onLoaded}
        onTimeUpdate={onTime}
        onPause={save}
        onEnded={() => {
          save()
          recordView(user, movie.id, true)
        }}
        onError={onVideoError}
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
          {(movie.categories || []).map((c) => (
            <a key={c} className="tag" href={`#cat-${c}`}>{categoryLabel(c)}</a>
          ))}
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
