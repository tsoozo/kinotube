import { useEffect, useRef, useState } from 'react'
import ShortPoster from './ShortPoster.jsx'
import { DownIcon, FilmIcon, MuteIcon, PlayIcon, SoundIcon, UpIcon } from './Icons.jsx'

function ShortItem({ short, index, movie, active, muted, onMute }) {
  const ref = useRef(null)
  const [failed, setFailed] = useState(!short.video)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)

  // Идэвхтэй болоход эхнээс нь тоглуулна, бусад үед зогсооно.
  useEffect(() => {
    const v = ref.current
    if (!v) return
    if (active) {
      v.currentTime = 0
      setPaused(false)
      v.play().catch(() => setPaused(true))
    } else v.pause()
  }, [active])

  const toggle = () => {
    const v = ref.current
    if (!v) return
    if (v.paused) v.play().then(() => setPaused(false)).catch(() => {})
    else {
      v.pause()
      setPaused(true)
    }
  }

  return (
    <article className="short" data-index={index}>
      <div className="short-frame">
        {failed ? (
          <div className="short-missing">
            <ShortPoster short={short} />
            <p>Видео удахгүй нэмэгдэнэ</p>
          </div>
        ) : (
          <>
            <video
              ref={ref}
              src={short.video}
              poster={short.thumbnail}
              muted={muted}
              loop
              playsInline
              preload={active ? 'auto' : 'none'}
              onClick={toggle}
              onError={() => setFailed(true)}
              onTimeUpdate={(e) => setProgress(e.target.currentTime / (e.target.duration || 1))}
            />
            {paused && <span className="short-paused" aria-hidden="true"><PlayIcon /></span>}
            <div className="short-progress"><span style={{ width: `${progress * 100}%` }} /></div>
          </>
        )}
        <span className="short-duration">{short.duration}</span>
        <div className="short-info">
          <h2>{short.title}</h2>
          {short.description && <p>{short.description}</p>}
          {movie && (
            <a className="short-movie" href={`#watch-${encodeURIComponent(movie.id)}`}>
              <FilmIcon /> <span>Бүтэн кино: {movie.title}</span>
            </a>
          )}
        </div>
        {!failed && (
          <button className="short-action" onClick={onMute} aria-label={muted ? 'Дуу нээх' : 'Дуу хаах'}>
            {muted ? <MuteIcon /> : <SoundIcon />}
          </button>
        )}
      </div>
    </article>
  )
}

export default function Shorts({ shorts, movies, startId, loading }) {
  const feedRef = useRef(null)
  const [active, setActive] = useState(0)
  // Хөтөч дуутай autoplay-г хориглодог тул дуугүй эхэлнэ.
  const [muted, setMuted] = useState(true)

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
      if (e.key === 'ArrowDown') { e.preventDefault(); goTo(Math.min(active + 1, shorts.length - 1)) }
      if (e.key === 'ArrowUp') { e.preventDefault(); goTo(Math.max(active - 1, 0)) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [active, shorts.length])

  if (loading) return <p className="notice">Ачаалж байна…</p>
  if (!shorts.length) return <p className="notice">Shorts алга.</p>

  return (
    <div className="shorts">
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
