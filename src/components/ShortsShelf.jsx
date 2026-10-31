import ShortPoster from './ShortPoster.jsx'
import ShelfRow from './ShelfRow.jsx'
import { ShortsIcon } from './Icons.jsx'
import { lengthLabel } from '../data.js'

// Нүүр хуудсан дээрх Shorts (босоо цуврал) мөр.
export default function ShortsShelf({ shorts }) {
  if (!shorts.length) return null
  return (
    <section className="shorts-shelf">
      <h2 className="section-title shelf-title"><ShortsIcon /> Shorts</h2>
      <ShelfRow>
        {shorts.map((s) => (
          <a key={s.id} className="short-card" href={`#shorts-${encodeURIComponent(s.id)}`}>
            <div className="short-card-thumb">
              <ShortPoster short={s} />
              <span className="duration">{lengthLabel(s)}</span>
            </div>
            <h3 className="card-title">{s.title}</h3>
          </a>
        ))}
      </ShelfRow>
    </section>
  )
}
