import Thumbnail from './Thumbnail.jsx'
import { timeAgo } from '../data.js'

export default function MovieCard({ movie, compact, progress }) {
  const avatarHue = [...movie.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 360
  return (
    <a className={`card ${compact ? 'card-compact' : ''}`} href={`#watch-${encodeURIComponent(movie.id)}`}>
      <Thumbnail movie={movie} small={compact} progress={progress} />
      <div className="card-info">
        {!compact && (
          <span className="avatar" style={{ background: `hsl(${avatarHue} 50% 45%)` }}>
            {movie.title.slice(0, 1)}
          </span>
        )}
        <div className="card-text">
          <h3 className="card-title">{movie.title}</h3>
          <p className="card-meta">{(movie.genres || []).join(' · ')}</p>
          <p className="card-meta">
            {movie.year} он{movie.added ? ` · ${timeAgo(movie.added)}` : ''}
          </p>
        </div>
      </div>
    </a>
  )
}
