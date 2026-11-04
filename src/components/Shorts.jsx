import { useEffect, useRef, useState } from 'react'
import ShortPoster from './ShortPoster.jsx'
import Scrubber from './Scrubber.jsx'
import { Paywall } from './Watch.jsx'
import {
  BackTenIcon, CloseIcon, DownIcon, ForwardTenIcon, PauseIcon, PlayArrowIcon, FullscreenExitIcon, FullscreenIcon, LockIcon, MuteIcon, NextIcon, PrevIcon, ShareIcon, SoundIcon, UpIcon,
} from './Icons.jsx'
import { FREE_EPISODES, FREE_SECONDS, episodesOf, formatTime, isFreeEpisode, isSeries, shareItem } from '../data.js'
import { canWatchMovie, pushHistory, recordView, videoUrl } from '../auth.js'

// Shorts = босоо кино. Доош гүйлгэвэл өөр кино, хөндлөн гүйлгэвэл дараагийн анги.
// Цуврал: эхний 2 анги үнэгүй. Нэг ангитай кино: эхний 5 минут үнэгүй. Цааш нь эрх (сервер ч шалгана).

// Нэг ангитай киног нэг "анги" гэж үзнэ.
const slidesOf = (item) =>
  isSeries(item) ? episodesOf(item) : [{ number: 1, title: '', duration: item.duration, videoReady: item.videoReady, movie: true }]

// Нэг анги: идэвхтэй болоход л видеоны линкийг авч тоглуулна.
function EpisodeSlide({ series, episode, active, muted, locked, user, onEnded }) {
  const ref = useRef(null)
  const [failed, setFailed] = useState(episode.videoReady === false)
  const [paused, setPaused] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  // Удирдлага (тоглуулах товч, гүйлгэх зурвас): дэлгэц нэг товшиход гарч, дахин товшиход арилна.
  const [ui, setUi] = useState(false)
  const [uiAt, setUiAt] = useState(0)
  const [scrubbing, setScrubbing] = useState(false)
  const [vertical, setVertical] = useState(true)
  const [src, setSrc] = useState(null)
  // Нэг ангитай кинонд эрхгүй үед үнэгүй үзэх секунд, limitHit: дууссан.
  const [preview, setPreview] = useState(0)
  const [limitHit, setLimitHit] = useState(false)

  useEffect(() => {
    if (!active || src || failed || locked) return
    let live = true
    videoUrl(series, episode.movie ? undefined : episode.number)
      .then(({ url, preview: p }) => {
        if (!live) return
        if (!url) return setFailed(true)
        setPreview(p || 0)
        setSrc(url)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [active, src, failed, locked, series, episode.number])

  // Идэвхтэй болоход эхнээс нь тоглуулна, бусад үед зогсооно.
  useEffect(() => {
    const v = ref.current
    if (!v || !src) return
    if (active) {
      v.currentTime = 0
      setPaused(false)
      setUi(false)
      v.play().catch(() => {
        setPaused(true)
        setUi(true)
      })
    } else v.pause()
  }, [active, src])

  // Тоглож байхад удирдлага 3 секундын дараа өөрөө арилна.
  useEffect(() => {
    if (!ui || paused || scrubbing) return
    const t = setTimeout(() => setUi(false), 3000)
    return () => clearTimeout(t)
  }, [ui, paused, scrubbing, uiAt])

  const showUi = () => {
    setUi(true)
    setUiAt(Date.now())
  }

  const toggle = () => {
    const v = ref.current
    if (!v) return
    if (v.paused) v.play().then(() => setPaused(false)).catch(() => {})
    else {
      v.pause()
      setPaused(true)
    }
    showUi()
  }

  const seek = (t) => {
    const v = ref.current
    if (v) v.currentTime = t
    setTime(t)
    showUi()
  }

  // ±10 секунд (үнэгүй хэсгийн төгсгөлөөс цааш биш).
  const [flash, setFlash] = useState(null)
  const skip = (sec) => {
    const v = ref.current
    if (!v || !v.duration) return
    const end = preview ? Math.min(preview, v.duration) : v.duration
    seek(Math.min(Math.max(v.currentTime + sec, 0), end))
    setFlash({ dir: sec < 0 ? 'back' : 'fwd', at: Date.now() })
  }

  // Нэг товшилт: удирдлага гаргах/нуух. Хоёр товшилт: зүүн тал −10, баруун тал +10 секунд.
  const tapTimer = useRef(0)
  const lastTap = useRef(0)
  useEffect(() => () => clearTimeout(tapTimer.current), [])
  const onTap = (e) => {
    const now = Date.now()
    const r = e.currentTarget.getBoundingClientRect()
    const left = e.clientX - r.left < r.width / 2
    if (now - lastTap.current < 300) {
      clearTimeout(tapTimer.current)
      lastTap.current = 0
      skip(left ? -10 : 10)
      return
    }
    lastTap.current = now
    tapTimer.current = setTimeout(() => (ui ? setUi(false) : showUi()), 250)
  }

  // Үнэгүй 5 минутаас цааш тоглуулахгүй, гүйлгэхгүй.
  const clamp = (e) => {
    const v = e.target
    if (preview && v.currentTime >= preview) {
      v.pause()
      v.currentTime = preview
      setLimitHit(true)
    }
  }

  if (limitHit) {
    return (
      <div className="short-ep short-locked player-locked">
        <div className="locked-bg" aria-hidden="true"><ShortPoster short={series} /></div>
        <LockIcon />
        <Paywall movie={series} user={user} returnTo={series.id} lead={`Эхний ${FREE_SECONDS / 60} минутыг үнэгүй үзлээ`} />
      </div>
    )
  }

  if (locked) {
    return (
      <div className="short-ep short-locked player-locked">
        <div className="locked-bg" aria-hidden="true"><ShortPoster short={series} /></div>
        <LockIcon />
        <Paywall
          movie={series}
          user={user}
          returnTo={`${series.id}/${episode.number}`}
          lead={`Эхний ${FREE_EPISODES} анги үнэгүй. ${episode.number}-р ангиас цааш үзэх эрх авна уу`}
        />
      </div>
    )
  }

  if (failed) {
    return (
      <div className="short-ep short-missing">
        <ShortPoster short={series} />
        <p>Видео удахгүй нэмэгдэнэ</p>
      </div>
    )
  }

  return (
    <div className={`short-ep ${vertical ? 'is-vertical' : ''}`}>
      <video
        ref={ref}
        src={src || undefined}
        poster={series.thumbnail}
        muted={muted}
        playsInline
        preload={active ? 'auto' : 'none'}
        onClick={onTap}
        onError={() => setFailed(true)}
        // Босоо (≈9:16) бичлэг дэлгэцийг дүүргэнэ, бусад нь бүтнээрээ харагдана.
        onLoadedMetadata={(e) => {
          setVertical(e.target.videoHeight / e.target.videoWidth >= 1.5)
          setDuration(e.target.duration)
        }}
        onDurationChange={(e) => setDuration(e.target.duration)}
        onPlay={() => setPaused(false)}
        onPause={() => setPaused(true)}
        onEnded={onEnded}
        onSeeking={clamp}
        onTimeUpdate={(e) => {
          clamp(e)
          if (!scrubbing) setTime(e.target.currentTime)
        }}
      />
      <div className={`short-ui ${ui || scrubbing ? 'show' : ''}`}>
        <div className="short-center">
          <button className="short-skip" onClick={() => skip(-10)} aria-label="10 секунд ухраах"><BackTenIcon /><small>10</small></button>
          <button className="short-play" onClick={toggle} aria-label={paused ? 'Тоглуулах' : 'Зогсоох'}>
            {paused ? <PlayArrowIcon /> : <PauseIcon />}
          </button>
          <button className="short-skip" onClick={() => skip(10)} aria-label="10 секунд урагшлуулах"><ForwardTenIcon /><small>10</small></button>
        </div>
        <div className="short-scrub">
          <span className="short-time">{formatTime(time)} / {formatTime(duration)}</span>
          <Scrubber time={time} duration={duration} limit={preview} onSeek={seek} onScrub={setScrubbing} />
        </div>
      </div>
      {flash && (
        <span key={flash.at} className={`vp-flash ${flash.dir}`} aria-hidden="true">{flash.dir === 'back' ? '−' : '+'}10 сек</span>
      )}
      <div className="short-progress"><span style={{ width: `${duration ? (time / duration) * 100 : 0}%` }} /></div>
    </div>
  )
}

// Нэг цуврал: ангиуд хөндлөн байрлана (scroll-snap).
function SeriesItem({ series, index, active, ep, onEp, muted, onMute, full, onFull, user }) {
  const rowRef = useRef(null)
  const episodes = slidesOf(series)
  const single = !isSeries(series)
  const canWatch = canWatchMovie(user, series.id)
  const i = Math.max(0, episodes.findIndex((e) => e.number === ep))
  const current = episodes[i]

  const scrollTo = (k, smooth = true) => {
    const row = rowRef.current
    if (row) row.scrollTo({ left: k * row.clientWidth, behavior: smooth ? 'smooth' : 'auto' })
  }

  // Анги солигдоход (сум, хаяг, дараагийн анги) тэр рүү гүйлгэнэ.
  useEffect(() => {
    const row = rowRef.current
    if (row && Math.round(row.scrollLeft / (row.clientWidth || 1)) !== i) scrollTo(i, active)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, full])

  // Хөндлөн гүйлгэж зогссон ангийг идэвхтэй болгоно.
  useEffect(() => {
    const row = rowRef.current
    if (!row) return
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && onEp(Number(e.target.dataset.ep))),
      { root: row, threshold: 0.6 },
    )
    ;[...row.children].forEach((el) => io.observe(el))
    return () => io.disconnect()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [episodes.length])

  // Үзэж эхэлсэн цувралыг түүхэнд нэмнэ.
  useEffect(() => {
    if (!active || !current || (!single && !canWatch && !isFreeEpisode(current.number))) return
    pushHistory(user, series.id, single ? undefined : current.number)
    recordView(user, series.id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, current?.number])

  const next = episodes[i + 1]

  return (
    <article className="short" data-index={index}>
      <div className="short-frame">
        {episodes.length ? (
          <div className="short-eps" ref={rowRef}>
            {episodes.map((e) => (
              <div key={e.number} className="short-ep-slot" data-ep={e.number}>
                <EpisodeSlide
                  series={series}
                  episode={e}
                  active={active && e.number === current?.number}
                  muted={muted}
                  locked={!single && !canWatch && !isFreeEpisode(e.number)}
                  user={user}
                  onEnded={() => next && onEp(next.number)}
                />
              </div>
            ))}
          </div>
        ) : (
          <div className="short-missing">
            <ShortPoster short={series} />
            <p>Анги удахгүй нэмэгдэнэ</p>
          </div>
        )}
        {current && (
          <span className="short-duration">
            {single
              ? `${(series.duration || '').replace(/^0:/, '')}${canWatch ? '' : ` · Эхний ${FREE_SECONDS / 60} мин үнэгүй`}`
              : episodes.length === 1
                ? `${(current.duration || '').replace(/^0:/, '')}${canWatch ? '' : ` · Эхний ${FREE_SECONDS / 60} мин үнэгүй`}`
                : `${current.number}/${episodes.length}-р анги${!canWatch && isFreeEpisode(current.number) ? ' · Үнэгүй' : ''}`}
          </span>
        )}
        <div className="short-info">
          <h2>{series.title}</h2>
          {current?.title && <p className="short-ep-title">{current.title}</p>}
          {series.description && <p>{series.description}</p>}
          {next && <span className="short-hint">Дараагийн анги → хөндлөн гүйлгэнэ</span>}
        </div>
        <div className="short-actions">
          <button className="short-action" onClick={() => shareItem(series, single ? 0 : current?.number)} aria-label="Хуваалцах">
            <ShareIcon />
          </button>
          <button className="short-action" onClick={onFull} aria-label={full ? 'Жижигрүүлэх' : 'Дэлгэц дүүрэн'}>
            {full ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </button>
          <button className="short-action" onClick={onMute} aria-label={muted ? 'Дуу нээх' : 'Дуу хаах'}>
            {muted ? <MuteIcon /> : <SoundIcon />}
          </button>
        </div>
        {i > 0 && (
          <button className="short-side prev" onClick={() => onEp(episodes[i - 1].number)} aria-label="Өмнөх анги"><PrevIcon /></button>
        )}
        {next && (
          <button className="short-side next" onClick={() => onEp(next.number)} aria-label="Дараагийн анги"><NextIcon /></button>
        )}
        {full && (
          <button className="short-close" onClick={onFull} aria-label="Хаах"><CloseIcon /></button>
        )}
      </div>
    </article>
  )
}

export default function Shorts({ series, startId, startEp, loading, user }) {
  const rootRef = useRef(null)
  const feedRef = useRef(null)
  const [active, setActive] = useState(0)
  // Цуврал бүрийн одоогийн анги.
  const [eps, setEps] = useState({})
  // Хөтөч дуутай autoplay-г хориглодог тул дуугүй эхэлнэ.
  const [muted, setMuted] = useState(true)
  // Дэлгэц дүүрэн горим: CSS-ээр бүх дэлгэцийг эзэлнэ, боломжтой хөтөчид Fullscreen API-г ч ашиглана (iPhone-д CSS л).
  const [full, setFull] = useState(false)

  const epOf = (s) => eps[s.id] || slidesOf(s)[0]?.number || 1
  const setEp = (id, n) => setEps((m) => (m[id] === n ? m : { ...m, [id]: n }))

  const toggleFull = () => {
    const fsEl = document.fullscreenElement || document.webkitFullscreenElement
    if (full) {
      setFull(false)
      if (fsEl) (document.exitFullscreen || document.webkitExitFullscreen).call(document)?.catch?.(() => {})
      return
    }
    setFull(true)
    const el = rootRef.current
    const req = el && (el.requestFullscreen || el.webkitRequestFullscreen)
    if (req) req.call(el)?.catch?.(() => {})
  }

  // Esc эсвэл хөтчийн товчоор Fullscreen-ээс гарвал горимыг ч хаана.
  useEffect(() => {
    const onChange = () => {
      if (!(document.fullscreenElement || document.webkitFullscreenElement)) setFull(false)
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  // Хуудаснаас гарахад Fullscreen-ийг хаана.
  useEffect(() => () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      ;(document.exitFullscreen || document.webkitExitFullscreen).call(document)?.catch?.(() => {})
    }
  }, [])

  // Горим солиход хэмжээ өөрчлөгдөх тул одоогийн бичлэг дээрээ үлдэнэ.
  useEffect(() => {
    document.documentElement.classList.toggle('shorts-full', full)
    goTo(active, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full])
  useEffect(() => () => document.documentElement.classList.remove('shorts-full'), [])

  const goTo = (i, smooth = true) => {
    feedRef.current?.children[i]?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  }

  // Хаягт заасан цуврал, анги руу шууд очно.
  useEffect(() => {
    if (!series.length) return
    const i = Math.max(0, series.findIndex((s) => s.id === startId))
    if (startEp && series[i]?.id === startId) setEp(startId, startEp)
    setActive(i)
    goTo(i, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [series])

  // Дэлгэцэд ихэнх нь харагдаж буй цувралыг идэвхтэй болгоно.
  useEffect(() => {
    const feed = feedRef.current
    if (!feed) return
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(Number(e.target.dataset.index))),
      { root: feed, threshold: 0.6 },
    )
    ;[...feed.children].forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [series])

  // Хаягийг одоогийн цуврал, ангиар шинэчилнэ (хуудас дахин ачаалахгүй).
  const current = series[active]
  const currentEp = current ? epOf(current) : 0
  useEffect(() => {
    if (current) history.replaceState(null, '', `#shorts-${encodeURIComponent(current.id)}${currentEp > 1 ? `/${currentEp}` : ''}`)
  }, [current, currentEp])

  // Дээш/доош: өөр кино, зүүн/баруун: анги.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea')) return
      if (e.key === 'Escape' && full) { setFull(false); return }
      if (e.key === 'f' || e.key === 'F') { toggleFull(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); goTo(Math.min(active + 1, series.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); goTo(Math.max(active - 1, 0)) }
      if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && current) {
        e.preventDefault()
        const list = slidesOf(current)
        const k = list.findIndex((x) => x.number === currentEp) + (e.key === 'ArrowRight' ? 1 : -1)
        if (list[k]) setEp(current.id, list[k].number)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, series.length, full, currentEp])

  if (loading) return <p className="notice">Ачаалж байна…</p>
  if (!series.length) return <p className="notice">Shorts алга.</p>

  return (
    <div className={`shorts ${full ? 'is-full' : ''}`} ref={rootRef}>
      <div className="shorts-feed" ref={feedRef}>
        {series.map((s, i) => (
          <SeriesItem
            key={s.id}
            series={s}
            index={i}
            active={i === active}
            ep={epOf(s)}
            onEp={(n) => setEp(s.id, n)}
            muted={muted}
            onMute={() => setMuted((v) => !v)}
            full={full}
            onFull={toggleFull}
            user={user}
          />
        ))}
      </div>
      <div className="shorts-nav">
        <button className="icon-btn" onClick={() => goTo(active - 1)} disabled={active === 0} aria-label="Өмнөх кино">
          <UpIcon />
        </button>
        <button className="icon-btn" onClick={() => goTo(active + 1)} disabled={active === series.length - 1} aria-label="Дараагийн кино">
          <DownIcon />
        </button>
      </div>
    </div>
  )
}
