import { useEffect, useRef } from 'react'
import MovieCard from './MovieCard.jsx'
import ShortsShelf from './ShortsShelf.jsx'
import ContinueShelf from './ContinueShelf.jsx'
import SkeletonGrid from './SkeletonGrid.jsx'
import CategoryShelf from './CategoryShelf.jsx'
import { CATEGORIES, categoryLabel, inCategory } from '../data.js'

export default function Home({ movies, genres, genre, onGenre, category, onCategory, query, onClearSearch, loading, progressOf, shorts = [], continueItems = [], categoryRows = false }) {
  // Сонгосон ангиллын чипийг харагдах хэсэгт гүйлгэнэ (утсан дээр).
  const chipsRef = useRef(null)
  useEffect(() => {
    const row = chipsRef.current
    const active = row?.querySelector('.chip.active')
    if (active) row.scrollLeft = active.offsetLeft - row.offsetLeft - (row.clientWidth - active.offsetWidth) / 2
  }, [category])

  return (
    <div className="home">
      <div className="chips" role="tablist" ref={chipsRef}>
        <button className={`chip ${!category && genre === 'Бүгд' ? 'active' : ''}`} onClick={() => { onGenre('Бүгд'); onCategory('') }}>
          Бүгд
        </button>
        {CATEGORIES.map((c) => (
          <button key={c.id} className={`chip ${c.id === category ? 'active' : ''}`} onClick={() => onCategory(c.id)}>
            {c.label}
          </button>
        ))}
        {genres.length > 0 && <span className="chips-divider" />}
        {genres.map((g) => (
          <button key={g} className={`chip ${g === genre ? 'active' : ''}`} onClick={() => onGenre(g === genre ? 'Бүгд' : g)}>
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
          {query ? `"${query}" хайлтаар кино, Shorts олдсонгүй.` : category ? `${categoryLabel(category)} одоогоор алга. Удахгүй нэмэгдэнэ.` : 'Кино алга.'}
          {query && <> <button className="link-btn" onClick={onClearSearch}>Хайлтыг арилгах</button></>}
        </p>
      ) : (
        <>
          {/* Shorts хамгийн эхэнд харагдана. */}
          <ContinueShelf items={continueItems} />
          <ShortsShelf shorts={shorts} />
          {/* Ангилал бүрийн мөр (AI кино эхэнд), доор нь бүх кино. */}
          {categoryRows && CATEGORIES.map((c) => (
            <CategoryShelf key={c.id} category={c} movies={movies.filter((m) => inCategory(m, c.id))} progressOf={progressOf} />
          ))}
          {categoryRows && movies.length > 0 && <h2 className="section-title">Бүх кино</h2>}
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
