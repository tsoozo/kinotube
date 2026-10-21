import { useState } from 'react'
import { hue } from '../data.js'

// Зураг байхгүй үед киноны нэр бүхий өнгөт зураг харуулна.
export default function Thumbnail({ movie, small, progress = 0 }) {
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
      {movie.duration && <span className="duration">{progress >= 1 ? 'Үзсэн' : movie.duration.replace(/^0:/, '')}</span>}
      {progress > 0 && (
        <span className="thumb-progress">
          <span style={{ width: `${Math.max(progress * 100, 3)}%` }} />
        </span>
      )}
    </div>
  )
}
