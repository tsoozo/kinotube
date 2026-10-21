import MovieCard from './MovieCard.jsx'

export default function Home({ movies, genres, genre, onGenre, query, onClearSearch, title, loading }) {
  return (
    <div className="home">
      <div className="chips" role="tablist">
        {['Бүгд', ...genres].map((g) => (
          <button key={g} className={`chip ${g === genre ? 'active' : ''}`} onClick={() => onGenre(g)}>
            {g}
          </button>
        ))}
      </div>
      {title && <h2 className="section-title">{title}</h2>}
      {query.trim() && !loading && (
        <div className="search-summary">
          <span>
            <b>"{query.trim()}"</b> хайлтаар {movies.length} кино олдлоо
          </span>
          <button className="link-btn" onClick={onClearSearch}>Хайлтыг арилгах</button>
        </div>
      )}
      {loading ? (
        <p className="notice">Ачаалж байна…</p>
      ) : movies.length === 0 ? (
        <p className="notice">
          {query ? `"${query}" хайлтаар кино олдсонгүй.` : title ? 'Та одоогоор кино үзээгүй байна.' : 'Кино алга.'}
        </p>
      ) : (
        <div className="grid">
          {movies.map((m) => (
            <MovieCard key={m.id} movie={m} />
          ))}
        </div>
      )}
    </div>
  )
}
