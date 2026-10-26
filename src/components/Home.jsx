import MovieCard from './MovieCard.jsx'
import ShortsShelf from './ShortsShelf.jsx'
import ContinueShelf from './ContinueShelf.jsx'
import SkeletonGrid from './SkeletonGrid.jsx'

export default function Home({ movies, genres, genre, onGenre, query, onClearSearch, loading, progressOf, shorts = [], continueItems = [] }) {
  return (
    <div className="home">
      <div className="chips" role="tablist">
        {['Бүгд', ...genres].map((g) => (
          <button key={g} className={`chip ${g === genre ? 'active' : ''}`} onClick={() => onGenre(g)}>
            {g}
          </button>
        ))}
      </div>
      {query.trim() && !loading && (movies.length > 0 || shorts.length > 0) && (
        <div className="search-summary">
          <span>
            <b>"{query.trim()}"</b> хайлтаар {[movies.length && `${movies.length} кино`, shorts.length && `${shorts.length} Shorts`].filter(Boolean).join(', ')} олдлоо
          </span>
          <button className="link-btn" onClick={onClearSearch}>Хайлтыг арилгах</button>
        </div>
      )}
      {loading ? (
        <SkeletonGrid />
      ) : movies.length === 0 && shorts.length === 0 ? (
        <p className="notice">
          {query ? `"${query}" хайлтаар кино, Shorts олдсонгүй.` : 'Кино алга.'}
          {query && <> <button className="link-btn" onClick={onClearSearch}>Хайлтыг арилгах</button></>}
        </p>
      ) : (
        <>
          {/* Shorts хамгийн эхэнд харагдана. */}
          <ContinueShelf items={continueItems} />
          <ShortsShelf shorts={shorts} />
          {movies.length > 0 && (
            <div className="grid">
              {movies.map((m) => (
                <MovieCard key={m.id} movie={m} progress={progressOf?.(m.id)} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
