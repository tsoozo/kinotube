import MovieCard from './MovieCard.jsx'
import ShelfRow from './ShelfRow.jsx'
import { NextIcon } from './Icons.jsx'

// Нүүр дээрх ангиллын мөр: эхний хэдэн кино, "Бүгдийг үзэх" нь #cat-<ангилал> руу.
export default function CategoryShelf({ category, movies, progressOf }) {
  if (!movies.length) return null
  return (
    <section className="movie-shelf">
      <div className="shelf-head">
        <h2 className="section-title">{category.label}</h2>
        <a className="see-all" href={`#cat-${category.id}`}>
          Бүгдийг үзэх <NextIcon width="18" height="18" />
        </a>
      </div>
      <ShelfRow>
        {movies.slice(0, 12).map((m) => (
          <div key={m.id} className="shelf-card">
            <MovieCard movie={m} progress={progressOf?.(m.id)} />
          </div>
        ))}
      </ShelfRow>
    </section>
  )
}
