import ShortPoster from './ShortPoster.jsx'
import ShelfRow from './ShelfRow.jsx'
import { NextIcon, ShortsIcon } from './Icons.jsx'
import { lengthLabel } from '../data.js'

// Нүүрний хамгийн дээрх Shorts (босоо кино) мөр: хөндлөн гүйлгэнэ, "Бүгдийг үзэх" нь #shorts руу.
export default function ShortsShelf({ shorts }) {
  if (!shorts.length) return null
  return (
    <section className="shorts-shelf">
      <div className="shelf-head">
        <h2 className="section-title shelf-title"><ShortsIcon /> Shorts</h2>
        <a className="see-all" href="#shorts">
          Бүгдийг үзэх <NextIcon width="18" height="18" />
        </a>
      </div>
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
