import { useEffect, useRef, useState } from 'react'
import { formatTime } from '../data.js'
import {
  BackTenIcon, ForwardTenIcon, FullscreenExitIcon, FullscreenIcon, MuteIcon, PauseIcon, PlayArrowIcon, SoundIcon,
} from './Icons.jsx'

const SKIP = 10

// Кино тоглуулагч: зогсоох, гүйлгэх, ±10 секунд, бүтэн дэлгэц. Хоёр товшилтоор зүүн/баруун тал руу 10 секунд.
export default function Player({ videoRef, src, poster, onShape, onLoadedMetadata, onTimeUpdate, onPause, onEnded, onError, children }) {
  const boxRef = useRef(null)
  const tapTimer = useRef(0)
  const lastTap = useRef(0)
  const [playing, setPlaying] = useState(false)
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [muted, setMuted] = useState(false)
  const [shown, setShown] = useState(true)
  const [full, setFull] = useState(false)
  const [vertical, setVertical] = useState(false)
  const [flash, setFlash] = useState(null)
  const [pokeAt, setPokeAt] = useState(0)

  const video = () => videoRef.current

  // Удирдлагыг харуулна. Тоглож байвал 3 секундын дараа доорх effect нууна.
  const poke = () => {
    setShown(true)
    setPokeAt(Date.now())
  }

  useEffect(() => {
    if (!playing || !shown) return
    const t = setTimeout(() => setShown(false), 3000)
    return () => clearTimeout(t)
  }, [playing, shown, pokeAt])

  const toggle = () => {
    const v = video()
    if (!v) return
    if (v.paused) v.play().catch(() => {})
    else v.pause()
    poke()
  }

  const skip = (sec) => {
    const v = video()
    if (!v || !v.duration) return
    v.currentTime = Math.min(Math.max(v.currentTime + sec, 0), v.duration)
    setTime(v.currentTime)
    setFlash({ dir: sec < 0 ? 'back' : 'fwd', at: Date.now() })
    poke()
  }

  const toggleMute = () => {
    const v = video()
    if (!v) return
    v.muted = !v.muted
    setMuted(v.muted)
    poke()
  }

  const toggleFull = async () => {
    const box = boxRef.current
    const v = video()
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      ;(document.exitFullscreen || document.webkitExitFullscreen).call(document)
      return
    }
    const req = box.requestFullscreen || box.webkitRequestFullscreen
    if (req) {
      try {
        await req.call(box)
        // Утсан дээр бичлэгийн чиглэлээр нь эргүүлнэ (Android). Болохгүй бол алгасна.
        await screen.orientation?.lock?.(vertical ? 'portrait' : 'landscape').catch(() => {})
      } catch {
        // алгасна
      }
    } else if (v?.webkitEnterFullscreen) {
      // iPhone: зөвхөн видеог өөрийг нь бүтэн дэлгэцэнд гаргаж болно.
      v.webkitEnterFullscreen()
    }
  }

  useEffect(() => {
    const onChange = () => {
      const on = !!(document.fullscreenElement || document.webkitFullscreenElement)
      setFull(on)
      if (!on) screen.orientation?.unlock?.()
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
      clearTimeout(tapTimer.current)
    }
  }, [])

  // Гарын товч: зай/k зогсоох, ←/→ 10 секунд, f бүтэн дэлгэц, m дуу.
  useEffect(() => {
    const onKey = (e) => {
      if (e.target.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return
      const k = e.key.toLowerCase()
      if (k === ' ' || k === 'k') toggle()
      else if (k === 'arrowleft' || k === 'j') skip(-SKIP)
      else if (k === 'arrowright' || k === 'l') skip(SKIP)
      else if (k === 'f') toggleFull()
      else if (k === 'm') toggleMute()
      else return
      e.preventDefault()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // Нэг товшилт: хулганаар бол зогсоох/тоглуулах, хуруугаар бол удирдлага харуулах/нуух (зогссон үед тоглуулна).
  // Хоёр товшилт: зүүн хагас -10 сек, баруун хагас +10 сек.
  const onSurface = (e) => {
    const now = Date.now()
    const rect = e.currentTarget.getBoundingClientRect()
    const left = e.clientX - rect.left < rect.width / 2
    if (now - lastTap.current < 300) {
      clearTimeout(tapTimer.current)
      lastTap.current = 0
      skip(left ? -SKIP : SKIP)
      return
    }
    lastTap.current = now
    const touch = e.pointerType !== 'mouse'
    tapTimer.current = setTimeout(() => {
      const v = video()
      if (!touch || !v || v.paused) toggle()
      else if (shown) setShown(false)
      else poke()
    }, touch ? 300 : 200)
  }

  const pct = duration ? (time / duration) * 100 : 0

  return (
    <div
      ref={boxRef}
      className={`vp ${shown || !playing ? 'show' : ''} ${full ? 'is-full' : ''} ${vertical ? 'is-vertical' : ''}`}
      onPointerMove={(e) => e.pointerType === 'mouse' && poke()}
    >
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        playsInline
        onLoadedMetadata={(e) => {
          setDuration(e.target.duration)
          setVertical(e.target.videoHeight > e.target.videoWidth)
          onShape?.(e.target.videoHeight > e.target.videoWidth ? 'tall' : 'wide')
          onLoadedMetadata?.(e)
        }}
        onDurationChange={(e) => setDuration(e.target.duration)}
        onTimeUpdate={(e) => {
          setTime(e.target.currentTime)
          onTimeUpdate?.(e)
        }}
        onPlay={() => {
          setPlaying(true)
          poke()
        }}
        onPause={(e) => {
          setPlaying(false)
          setShown(true)
          onPause?.(e)
        }}
        onEnded={onEnded}
        onError={onError}
        onVolumeChange={(e) => setMuted(e.target.muted)}
      >
        {/* Хадмалын <track>-ууд */}
        {children}
      </video>
      <div className="vp-surface" onPointerUp={onSurface} />
      {flash && (
        <span key={flash.at} className={`vp-flash ${flash.dir}`} aria-hidden="true">
          {flash.dir === 'back' ? '−' : '+'}{SKIP} сек
        </span>
      )}
      <div className="vp-center">
        <button className="vp-btn" onClick={() => skip(-SKIP)} aria-label="10 секунд ухраах"><BackTenIcon /><small>10</small></button>
        <button className="vp-btn vp-play" onClick={toggle} aria-label={playing ? 'Зогсоох' : 'Тоглуулах'}>
          {playing ? <PauseIcon /> : <PlayArrowIcon />}
        </button>
        <button className="vp-btn" onClick={() => skip(SKIP)} aria-label="10 секунд урагшлуулах"><ForwardTenIcon /><small>10</small></button>
      </div>
      <div className="vp-bar">
        <input
          className="vp-seek"
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={time}
          style={{ '--pct': `${pct}%` }}
          aria-label="Бичлэг гүйлгэх"
          onChange={(e) => {
            const v = video()
            if (v) v.currentTime = Number(e.target.value)
            setTime(Number(e.target.value))
            poke()
          }}
        />
        <div className="vp-row">
          <span className="vp-time">{formatTime(time)} / {formatTime(duration)}</span>
          <button className="vp-btn sm" onClick={toggleMute} aria-label={muted ? 'Дуу нээх' : 'Дуу хаах'}>
            {muted ? <MuteIcon /> : <SoundIcon />}
          </button>
          <button className="vp-btn sm" onClick={toggleFull} aria-label={full ? 'Бүтэн дэлгэцээс гарах' : 'Бүтэн дэлгэц'}>
            {full ? <FullscreenExitIcon /> : <FullscreenIcon />}
          </button>
        </div>
      </div>
    </div>
  )
}
