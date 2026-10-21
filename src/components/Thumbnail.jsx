import { useState } from 'react'

function hue(str) {
  let h = 0
  for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) % 360
  return h
}

// Зураг байхгүй үед киноны нэр бүхий өнгөт зураг харуулна.
export default function Thumbnail({ movie, small }) {
  const [failed, setFailed] = useState(!movie.thumbnail)
  const h = hue(movie.id)

  return (
    <div className={`thumb ${small ? 'thumb-small' : ''}`}>
      {failed ? (
        <div
          className="thumb-fallback"
          style={{ background: `linear-gradient(135deg, hsl(${h} 45% 22%), hsl(${(h + 40) % 360} 55% 38%))` }}
        >
          <span className="thumb-title">{movie.title}</span>
          <span className="thumb-year">{movie.year}</span>
        </div>
      ) : (
        <img src={movie.thumbnail} alt="" loading="lazy" onError={() => setFailed(true)} />
      )}
      {movie.duration && <span className="duration">{movie.duration.replace(/^0:/, '')}</span>}
    </div>
  )
}
