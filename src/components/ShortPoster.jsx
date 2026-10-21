import { useState } from 'react'
import { hue } from '../data.js'

// Shorts-ийн босоо зураг. Зураг байхгүй бол өнгөт fallback.
export default function ShortPoster({ short }) {
  const [failed, setFailed] = useState(!short.thumbnail)
  const h = hue(short.id)
  if (!failed) return <img className="short-poster" src={short.thumbnail} alt="" loading="lazy" onError={() => setFailed(true)} />
  return (
    <div
      className="short-poster short-poster-fallback"
      style={{ background: `linear-gradient(160deg, hsl(${h} 45% 20%), hsl(${(h + 50) % 360} 55% 36%))` }}
    >
      <span>{short.title}</span>
    </div>
  )
}
