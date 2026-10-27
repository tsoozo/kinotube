import { useEffect, useRef, useState } from 'react'
import ShortPoster from './ShortPoster.jsx'
import { CloseIcon, DownIcon, FilmIcon, FullscreenExitIcon, FullscreenIcon, MuteIcon, PlayIcon, SoundIcon, UpIcon } from './Icons.jsx'
import { videoUrl } from '../auth.js'

function ShortItem({ short, index, movie, active, muted, onMute, full, onFull }) {
  const ref = useRef(null)
  const [failed, setFailed] = useState(short.videoReady === false || (short.videoReady === undefined && !short.video))
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [ended, setEnded] = useState(false)
  const [vertical, setVertical] = useState(false)
  const [src, setSrc] = useState(null)

  // Видеоны линкийг тухайн бичлэг дээр ирэхэд л авна.
  useEffect(() => {
    if (!active || src || failed) return
    let live = true
    videoUrl(short, 'short').then((url) => live && setSrc(url)).catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [active, src, failed, short])

  // Идэвхтэй болоход эхнээс нь тоглуулна, бусад үед зогсооно.
  useEffect(() => {
    const v = ref.current
    if (!v || !src) return
    if (active) {
      v.currentTime = 0
      setPaused(false)
      setEnded(false)
      v.play().catch(() => setPaused(true))
    } else v.pause()
  }, [active, src])

  const toggle = () => {
    const v = ref.current
    if (!v) return
    setEnded(false)
    if (v.paused) v.play().then(() => setPaused(false)).catch(() => {})
    else {
      v.pause()
      setPaused(true)
    }
  }

  return (
    <article className="short" data-index={index}>
      <div className={`short-frame ${vertical ? 'is-vertical' : ''}`}>
        {failed ? (
          <div className="short-missing">
            <ShortPoster short={short} />
            <p>Видео удахгүй нэмэгдэнэ</p>
          </div>
        ) : (
          <>
            <video
              ref={ref}
              src={src || undefined}
              poster={short.thumbnail}
              muted={muted}
              loop={!movie}
              playsInline
              preload={active ? 'auto' : 'none'}
              onClick={toggle}
              onError={() => setFailed(true)}
              // Reel маягийн босоо (≈9:16) бичлэг дэлгэцийг дүүргэнэ, бусад нь бүтнээрээ харагдана.
              onLoadedMetadata={(e) => setVertical(e.target.videoHeight / e.target.videoWidth >= 1.5)}
              onEnded={() => setEnded(true)}
              onTimeUpdate={(e) => setProgress(e.target.currentTime / (e.target.duration || 1))}
            />
            {paused && !ended && <span className="short-paused" aria-hidden="true"><PlayIcon /></span>}
            <div className="short-progress"><span style={{ width: `${progress * 100}%` }} /></div>
          </>
        )}
        <span className="short-duration">{short.duration}</span>
        <div className="short-info">
          <h2>{short.title}</h2>
          {short.description && <p>{short.description}</p>}
          {movie && (
            <span className="short-movie"><FilmIcon /> <span>{movie.title}</span></span>
          )}
          {/* Бичлэг дуусахад (видеогүй үед шууд) бүтэн кино руу орох товч. */}
          {movie && (ended || failed) && (
            <a className="short-continue" href={`#watch-${encodeURIComponent(movie.id)}`}>
              <PlayIcon /> Цааш үзэх
            </a>
          )}
        </div>
        <div className="short-actions">
          <button className="short-action" onClick={onFull} aria-label={full ? 'Жижигрүүлэх' : 'Дэлгэц дүүрэн'}>
            {full ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </button>
          {!failed && (
            <button className="short-action" onClick={onMute} aria-label={muted ? 'Дуу нээх' : 'Дуу хаах'}>
              {muted ? <MuteIcon /> : <SoundIcon />}
            </button>
          )}
        </div>
        {full && (
          <button className="short-close" onClick={onFull} aria-label="Хаах"><CloseIcon /></button>
        )}
      </div>
    </article>
  )
}

export default function Shorts({ shorts, movies, startId, loading }) {
  const rootRef = useRef(null)
  const feedRef = useRef(null)
  const [active, setActive] = useState(0)
  // Хөтөч дуутай autoplay-г хориглодог тул дуугүй эхэлнэ.
  const [muted, setMuted] = useState(true)
  // Дэлгэц дүүрэн горим: CSS-ээр бүх дэлгэцийг эзэлнэ, боломжтой хөтөчид Fullscreen API-г ч ашиглана (iPhone-д CSS л).
  const [full, setFull] = useState(false)

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

  // Хаягт заасан бичлэг рүү шууд очно.
  useEffect(() => {
    if (!shorts.length) return
    const i = Math.max(0, shorts.findIndex((s) => s.id === startId))
    setActive(i)
    goTo(i, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shorts])

  // Дэлгэцэд ихэнх нь харагдаж буй бичлэгийг идэвхтэй болгоно.
  useEffect(() => {
    const feed = feedRef.current
    if (!feed) return
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(Number(e.target.dataset.index))),
      { root: feed, threshold: 0.6 },
    )
    ;[...feed.children].forEach((el) => io.observe(el))
    return () => io.disconnect()
  }, [shorts])

  // Хаягийг одоогийн бичлэгээр шинэчилнэ (хуудас дахин ачаалахгүй).
  useEffect(() => {
    const s = shorts[active]
    if (s) history.replaceState(null, '', `#shorts-${encodeURIComponent(s.id)}`)
  }, [active, shorts])

  // Дээш/доош сумаар шилжинэ.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea')) return
      if (e.key === 'Escape' && full) { setFull(false); return }
      if (e.key === 'f' || e.key === 'F') { toggleFull(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); goTo(Math.min(active + 1, shorts.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); goTo(Math.max(active - 1, 0)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, shorts.length, full])

  if (loading) return <p className="notice">Ачаалж байна…</p>
  if (!shorts.length) return <p className="notice">Shorts алга.</p>

  return (
    <div className={`shorts ${full ? 'is-full' : ''}`} ref={rootRef}>
      <div className="shorts-feed" ref={feedRef}>
        {shorts.map((s, i) => (
          <ShortItem
            key={s.id}
            short={s}
            index={i}
            movie={s.movie && movies.find((m) => m.id === s.movie)}
            active={i === active}
            muted={muted}
            onMute={() => setMuted((v) => !v)}
            full={full}
            onFull={toggleFull}
          />
        ))}
      </div>
      <div className="shorts-nav">
        <button className="icon-btn" onClick={() => goTo(active - 1)} disabled={active === 0} aria-label="Өмнөх">
          <UpIcon />
        </button>
        <button className="icon-btn" onClick={() => goTo(active + 1)} disabled={active === shorts.length - 1} aria-label="Дараах">
          <DownIcon />
        </button>
      </div>
    </div>
  )
}
