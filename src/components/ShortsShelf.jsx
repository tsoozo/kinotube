import ShortPoster from './ShortPoster.jsx'
import ShelfRow from './ShelfRow.jsx'
import { ShortsIcon } from './Icons.jsx'

// Нүүр хуудсан дээрх Shorts мөр.
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
              <span className="duration">{s.duration}</span>
            </div>
            <h3 className="card-title">{s.title}</h3>
          </a>
        ))}
      </ShelfRow>
    </section>
  )
}
