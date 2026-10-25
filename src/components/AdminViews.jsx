import { useMemo, useState } from 'react'
import { viewRanking } from '../admin.js'
import { formatDate } from '../auth.js'

// Кино бүрийн үзэлт: ихээс бага эсвэл багаас их рүү.
export default function AdminViews({ movies }) {
  const [order, setOrder] = useState('most')
  const [query, setQuery] = useState('')
  const ranking = useMemo(() => viewRanking(movies), [movies])

  const q = query.trim().toLowerCase()
  const sorted = order === 'most' ? ranking : [...ranking].reverse()
  const list = sorted.filter((x) => !q || x.movie.title.toLowerCase().includes(q))
  const unseen = ranking.filter((x) => x.count === 0).length

  return (
    <div className="admin-body">
      <div className="admin-toolbar">
        <input className="admin-search" type="search" placeholder="Киноны нэрээр хайх" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="amounts">
          {[['most', 'Их үзэлттэй'], ['least', 'Бага үзэлттэй']].map(([id, label]) => (
            <button key={id} className={`chip ${order === id ? 'active' : ''}`} onClick={() => setOrder(id)}>{label}</button>
          ))}
        </div>
      </div>
      <p className="muted">{ranking.length} кино · {unseen} нь огт үзэгдээгүй</p>
      {list.length === 0 ? (
        <p className="notice">Кино олдсонгүй.</p>
      ) : (
        <div className="table-wrap">
          <table className="tx">
            <thead><tr><th>#</th><th>Кино</th><th className="num">Үзсэн</th><th className="num">Дуусгасан</th><th>Сүүлд</th></tr></thead>
            <tbody>
              {list.map((x) => (
                <tr key={x.movie.id}>
                  <td className="muted">{ranking.indexOf(x) + 1}</td>
                  <td><a href={`#watch-${encodeURIComponent(x.movie.id)}`}>{x.movie.title}</a></td>
                  <td className="num">{x.count} хүн</td>
                  <td className="num">{x.done}</td>
                  <td>{x.last ? formatDate(x.last) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="demo-note">Үзэлт = киног үзэж эхэлсэн хэрэглэгчийн тоо. Shorts-ийн үзэлт одоогоор бүртгэгддэггүй. Туршилтын горим: зөвхөн энэ хөтөч дээрх бүртгэлээс тоолно.</p>
    </div>
  )
}
