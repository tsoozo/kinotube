import { useRef, useState } from 'react'
import { formatTime } from '../data.js'

// Гүйлгэх зурвас: хуруугаар/хулганаар чирж гүйлгэнэ, чирж байхад цаг харагдана.
// Товших талбай өндөр (утсанд амархан), зурвас нь чирэх үед томорно. limit: үнэгүй хэсгийн төгсгөл (секунд).
export default function Scrubber({ time, duration, onSeek, onScrub, limit = 0, buffered = 0 }) {
  const ref = useRef(null)
  const [drag, setDrag] = useState(null)
  const max = limit > 0 && duration ? Math.min(limit, duration) : duration
  const shown = drag ?? time
  const pct = (t) => (duration ? Math.min(100, Math.max(0, (t / duration) * 100)) : 0)

  const at = (e) => {
    const r = ref.current.getBoundingClientRect()
    const x = Math.min(Math.max(e.clientX - r.left, 0), r.width)
    return Math.min(max || 0, (x / r.width) * (duration || 0))
  }

  const down = (e) => {
    if (!duration || (e.pointerType === 'mouse' && e.button !== 0)) return
    e.stopPropagation()
    ref.current.setPointerCapture?.(e.pointerId)
    const t = at(e)
    setDrag(t)
    onScrub?.(true)
    onSeek(t, false)
  }
  const move = (e) => {
    if (drag === null) return
    e.stopPropagation()
    const t = at(e)
    setDrag(t)
    onSeek(t, false)
  }
  const up = (e) => {
    if (drag === null) return
    e.stopPropagation()
    const t = at(e)
    setDrag(null)
    onSeek(t, true)
    onScrub?.(false)
  }

  // Гараар: ←/→ 5 секунд.
  const key = (e) => {
    if (!duration || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return
    e.preventDefault()
    e.stopPropagation()
    const t = e.key === 'Home' ? 0 : e.key === 'End' ? max : time + (e.key === 'ArrowRight' ? 5 : -5)
    onSeek(Math.min(Math.max(t, 0), max), true)
  }

  return (
    <div
      ref={ref}
      className={`scrub ${drag !== null ? 'is-drag' : ''}`}
      role="slider"
      tabIndex={0}
      aria-label="Бичлэг гүйлгэх"
      aria-valuemin={0}
      aria-valuemax={Math.floor(duration || 0)}
      aria-valuenow={Math.floor(shown || 0)}
      aria-valuetext={`${formatTime(shown)} / ${formatTime(duration)}`}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClick={(e) => e.stopPropagation()}
      onKeyDown={key}
    >
      <div className="scrub-track">
        {buffered > 0 && <span className="scrub-buffer" style={{ width: `${pct(buffered)}%` }} />}
        {limit > 0 && duration > limit && <span className="scrub-locked" style={{ left: `${pct(limit)}%` }} />}
        <span className="scrub-fill" style={{ width: `${pct(shown)}%` }} />
      </div>
      <span className="scrub-thumb" style={{ left: `${pct(shown)}%` }} />
      {drag !== null && (
        <span className="scrub-bubble" style={{ left: `clamp(32px, ${pct(drag)}%, calc(100% - 32px))` }}>{formatTime(drag)}</span>
      )}
    </div>
  )
}
