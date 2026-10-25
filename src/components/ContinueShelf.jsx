import MovieCard from './MovieCard.jsx'
import ShelfRow from './ShelfRow.jsx'
import { HistoryIcon } from './Icons.jsx'

// Нүүр хуудсан дээрх "Үргэлжлүүлэн үзэх" мөр: дуусгаагүй кинонууд.
export default function ContinueShelf({ items }) {
  if (!items.length) return null
  return (
    <section className="movie-shelf">
      <h2 className="section-title shelf-title"><HistoryIcon /> Үргэлжлүүлэн үзэх</h2>
      <ShelfRow>
        {items.map(({ movie, progress }) => (
          <div key={movie.id} className="shelf-card">
            <MovieCard movie={movie} progress={progress} />
          </div>
        ))}
      </ShelfRow>
    </section>
  )
}
