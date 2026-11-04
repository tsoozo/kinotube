import { useEffect, useRef, useState } from 'react'
import MovieCard from './MovieCard.jsx'
import Player from './Player.jsx'
import { CaptionsIcon, CaptionsOffIcon, CrownIcon, LockIcon, SaveIcon, SavedIcon, ShareIcon, SpeedIcon } from './Icons.jsx'
import {
  FREE_EPISODES, FREE_SECONDS, categoryLabel, episodesOf, formatTime, hue, isFreeEpisode, isSeries, recommended, shareItem, subtitlesOf, timeAgo, watchHref,
} from '../data.js'
import {
  PLANS, RENTAL, canWatchMovie, formatDate, formatDateTime, formatMoney, getProgress, isLater, loadUser, pushHistory,
  recordView, rentPrice, rentalEndsAt, saveProgress, setReturnTo, toggleLater, videoUrl, watchedRatio,
} from '../auth.js'

const SPEEDS = [0.75, 1, 1.25, 1.5, 2]

// Төлбөрийн сонголт: нэвтрээгүй бол нэвтрэх товч, үгүй бол нэг кино / сарын эрх.
export function Paywall({ movie, user, lead, sub, returnTo }) {
  const month = PLANS[0]
  const series = isSeries(movie)
  if (!user) {
    return (
      <>
        <p className="player-lead">{lead || 'Үргэлжлүүлэн үзэхийн тулд нэвтэрнэ үү'}</p>
        <p className="player-sub">{series ? 'Энэ цуврал' : 'Энэ кино'} {formatMoney(rentPrice(movie))} · бүх кино сард {formatMoney(month.price)}</p>
        <a className="btn-primary" href="#login" onClick={() => setReturnTo(returnTo || movie.id)}>Нэвтрэх</a>
      </>
    )
  }
  return (
    <>
      <p className="player-lead">{lead || 'Үзэх эрхээ сонгоно уу'}</p>
      {sub && <p className="player-sub">{sub}</p>}
      <div className="pay-options">
        <a className="pay-option" href={`#pay-rent-${encodeURIComponent(movie.id)}`} onClick={() => setReturnTo(returnTo || movie.id)}>
          <span>{series ? 'Зөвхөн энэ цуврал' : 'Зөвхөн энэ кино'}</span>
          <b>{formatMoney(rentPrice(movie))}</b>
          <small>{RENTAL.days} хоног үзнэ</small>
        </a>
        <a className="pay-option premium" href={`#pay-month-${encodeURIComponent(movie.id)}`} onClick={() => setReturnTo(returnTo || movie.id)}>
          <CrownIcon className="pay-crown" />
          <span>Бүх кино</span>
          <b>{formatMoney(month.price)}</b>
          <small>1 сар хязгааргүй</small>
        </a>
      </div>
    </>
  )
}

export default function Watch({ movie, ep, movies, user, onUser }) {
  const [videoError, setVideoError] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [resumed, setResumed] = useState(0)
  const [shape, setShape] = useState('tall')
  const [speed, setSpeed] = useState(1)
  const [captions, setCaptions] = useState(true)
  const [flash, setFlash] = useState('')
  const [bgFailed, setBgFailed] = useState(false)
  const [src, setSrc] = useState(null)
  // Эрхгүй үед үнэгүй үзэх секунд (кино: 5 минут), limitHit: түүнийг үзэж дууссан.
  const [preview, setPreview] = useState(0)
  const [limitHit, setLimitHit] = useState(false)
  const videoRef = useRef(null)
  const retried = useRef(false)
  const lastSave = useRef(0)
  const flashTimer = useRef(0)
  const canWatch = canWatchMovie(user, movie.id)
  const series = isSeries(movie)
  const episodes = episodesOf(movie)
  const n = series ? (episodes.some((e) => e.number === ep) ? ep : episodes[0]?.number || 1) : 0
  const episode = episodes.find((e) => e.number === n)
  const nextEpisode = episodes.find((e) => e.number > n)
  // Цувралын эхний 2 анги, киноны эхний 5 минут хүн бүрт үнэгүй.
  const locked = series && !canWatch && !isFreeEpisode(n)
  const videoReady = series ? episode?.videoReady !== false && Boolean(episode) : movie.videoReady !== false
  const viewKey = `${movie.id}:${n}`
  const rentEnds = rentalEndsAt(user, movie.id)
  const subs = subtitlesOf(movie)
  const saved = isLater(user, movie.id)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 2500)
    return () => clearTimeout(t)
  }, [copied])

  useEffect(() => {
    setVideoError(false)
    setExpanded(false)
    setResumed(0)
    setShape('tall')
    setBgFailed(false)
    setLimitHit(false)
  }, [movie.id, n])

  // Видеоны хугацаатай линкийг серверээс авна (эрхийг сервер дахин шалгана).
  const fetchSrc = () =>
    videoUrl(movie, n || undefined)
      .then(({ url, preview: p }) => {
        if (!url) return setVideoError(true)
        setPreview(p)
        setSrc(url)
      })
      .catch((e) => {
        // Эрх дууссан бол хэрэглэгчийн мэдээллийг шинэчилж, түгжээтэй дэлгэц гаргана.
        if (e.status === 401 || e.status === 403) loadUser().then((u) => u && onUser(u))
        setVideoError(true)
      })

  useEffect(() => {
    setSrc(null)
    setPreview(0)
    retried.current = false
    // Видео R2-д хараахан хуулагдаагүй бол шууд "удахгүй нэмэгдэнэ".
    if (!locked) videoReady ? fetchSrc() : setVideoError(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, user?.id, canWatch])

  // Үнэгүй 5 минутаас цааш тоглуулахгүй, гүйлгэхгүй (сервер ч цааших байтыг өгөхгүй).
  useEffect(() => {
    const v = videoRef.current
    if (!v || !preview) return
    const clamp = () => {
      if (v.currentTime >= preview) {
        v.pause()
        v.currentTime = preview
        setLimitHit(true)
      }
    }
    v.addEventListener('timeupdate', clamp)
    v.addEventListener('seeking', clamp)
    return () => {
      v.removeEventListener('timeupdate', clamp)
      v.removeEventListener('seeking', clamp)
    }
  }, [src, preview])

  // Линкийн хугацаа дууссан байж болзошгүй: нэг удаа шинээр авна.
  const onVideoError = () => {
    if (src && !retried.current) {
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

  // Байрлалыг зөвхөн бүтэн эрхтэй кинонд хадгална.
  const tracksProgress = !series && canWatch
  const save = () => {
    const v = videoRef.current
    if (v && user && tracksProgress && v.currentTime > 0) saveProgress(user, movie.id, v.currentTime, v.duration)
  }

  // Хуудаснаас гарах үед байрлалыг хадгална.
  useEffect(() => {
    const v = videoRef.current
    window.addEventListener('pagehide', save)
    return () => {
      window.removeEventListener('pagehide', save)
      if (v && user && tracksProgress && v.currentTime > 0) saveProgress(user, movie.id, v.currentTime, v.duration)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, user?.id, canWatch])

  // Өмнө зогссон газраас нь үргэлжлүүлнэ.
  const onLoaded = () => {
    const h = tracksProgress && getProgress(user, movie.id)
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

  // Үзэж эхэлсэн (үнэгүй хэсэг ч) киног түүхэнд нэмнэ.
  useEffect(() => {
    if (!locked) {
      const u = pushHistory(user, movie.id, n || undefined)
      if (u) onUser(u)
      recordView(user, movie.id)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, user?.id, locked])

  const goEpisode = (num) => (location.hash = watchHref(movie, num))

  const list = recommended(movies, movie)

  // Түгжээтэй үед ард нь киноны зургийг бүдгэрүүлж тавина. Зураггүй бол өнгөт fallback.
  const h = hue(movie.id)
  const backdrop = (
    <div className="locked-bg" aria-hidden="true" style={{ background: `linear-gradient(135deg, hsl(${h} 45% 22%), hsl(${(h + 40) % 360} 55% 38%))` }}>
      {movie.thumbnail && !bgFailed && <img src={movie.thumbnail} alt="" onError={() => setBgFailed(true)} />}
    </div>
  )

  let player
  if (locked || limitHit) {
    player = (
      <div className="player-error player-locked">
        {backdrop}
        <LockIcon />
        <Paywall
          movie={movie}
          user={user}
          returnTo={series ? `${movie.id}/${n}` : movie.id}
          lead={
            locked
              ? `Эхний ${FREE_EPISODES} анги үнэгүй. ${n}-р ангиас цааш үзэх эрх авна уу`
              : `Эхний ${FREE_SECONDS / 60} минутыг үнэгүй үзлээ`
          }
          sub={user?.subscription && !canWatch ? `Таны эрх ${formatDate(user.subscription.endsAt)}-нд дууссан` : ''}
        />
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
        key={viewKey}
        videoRef={videoRef}
        limit={preview}
        onShape={setShape}
        src={src}
        poster={movie.thumbnail}
        onLoadedMetadata={onLoaded}
        onTimeUpdate={onTime}
        onPause={save}
        onEnded={() => {
          save()
          recordView(user, movie.id, !nextEpisode)
          if (nextEpisode) goEpisode(nextEpisode.number)
        }}
        onError={onVideoError}
      >
        {subs.map((t, i) => (
          <track key={t.src} kind="subtitles" src={t.src} srcLang={t.lang} label={t.label} default={i === 0} />
        ))}
      </Player>
    )
  }
  const playing = !locked && !limitHit && !videoError

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
        {preview > 0 && !limitHit && !videoError && (
          <p className="resume-note">Эхний {FREE_SECONDS / 60} минут үнэгүй · <a className="link-btn" href={`#pay-rent-${encodeURIComponent(movie.id)}`} onClick={() => setReturnTo(movie.id)}>Бүтнээр үзэх</a></p>
        )}
        <h1 className="watch-title">{movie.title}{series && <span className="watch-ep"> · {n}-р анги{episode?.title ? `: ${episode.title}` : ''}</span>}</h1>
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
          <button className="action-btn" onClick={() => shareItem(movie, series ? n : 0).then((r) => r === 'copied' && setCopied(true))}>
            <ShareIcon />
            <span>{copied ? 'Линк хуулагдлаа' : 'Хуваалцах'}</span>
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
        {series && (
          <section className="episodes" aria-label="Ангиуд">
            <h2 className="section-title">Ангиуд · {episodes.length}</h2>
            <div className="episode-grid">
              {episodes.map((e) => {
                const free = isFreeEpisode(e.number)
                return (
                  <a key={e.number} className={`episode-btn ${e.number === n ? 'on' : ''}`} href={watchHref(movie, e.number)} aria-current={e.number === n ? 'true' : undefined}>
                    <b>{e.number}</b>
                    {!canWatch && !free && <LockIcon width="14" height="14" />}
                    {!canWatch && free && <small>Үнэгүй</small>}
                  </a>
                )
              })}
            </div>
          </section>
        )}
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
            {movie.year} он · {series ? `${episodes.length} анги` : movie.duration}
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
