// Ачаалж байх үеийн саарал карт.
export default function SkeletonGrid({ count = 8 }) {
  return (
    <div className="grid" aria-busy="true" aria-label="Ачаалж байна">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="card skeleton">
          <div className="thumb sk-block" />
          <div className="card-info">
            <span className="avatar sk-block" />
            <div className="card-text">
              <span className="sk-line" />
              <span className="sk-line sk-line-short" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
