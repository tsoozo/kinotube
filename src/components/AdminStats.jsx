import { useEffect, useState } from 'react'
import { stats } from '../admin.js'
import { formatDate, formatMoney, isActive } from '../auth.js'

export default function AdminStats({ movies, shorts }) {
  const [s, setS] = useState(null)
  const [error, setError] = useState('')

  useEffect(() => {
    stats(movies, shorts).then(setS).catch((e) => setError(e.message))
  }, [movies, shorts])

  if (error) return <p className="notice">{error}</p>
  if (!s) return <p className="notice">Ачаалж байна…</p>

  const tile = (label, value, sub, href) => {
    const body = (
      <>
        <span>{label}</span>
        <b>{value}</b>
        {sub && <small>{sub}</small>}
      </>
    )
    return href ? <a className="stat" href={href}>{body}</a> : <div className="stat">{body}</div>
  }

  return (
    <div className="admin-body">
      <div className="stats">
        {tile('Хэрэглэгч', s.users, `Сүүлийн 30 хоногт +${s.newUsers}`)}
        {tile('Идэвхтэй эрх', s.active, `${s.renting} хүн кино түрээсэлж байна`)}
        {tile('Шалгах төлбөр', s.pending, s.pending ? 'Telegram эсвэл энд батална' : 'Хүлээгдэж буй төлбөр алга', '#admin-payments')}
        {tile('Энэ сарын орлого', formatMoney(s.planMonth + s.rentMonth), `Сарын эрх ${formatMoney(s.planMonth)} · Нэг кино ${formatMoney(s.rentMonth)}`)}
        {tile('Нийт орлого', formatMoney(s.planAll + s.rentAll), `Сарын эрх ${formatMoney(s.planAll)} · Нэг кино ${formatMoney(s.rentAll)}`)}
        {tile('Кино / Shorts', `${s.movies} / ${s.shorts}`, '')}
      </div>

      <div className="profile-cards">
        {[['Их үзэлттэй кино', s.top], ['Бага үзэлттэй кино', s.least]].map(([title, list]) => (
          <section className="panel" key={title}>
            <h2>{title}</h2>
            {list.length === 0 ? (
              <p className="muted">Үзсэн түүх алга.</p>
            ) : (
              <ol className="rank">
                {list.map((x) => (
                  <li key={x.movie.id}>
                    <a href={`#watch-${encodeURIComponent(x.movie.id)}`}>{x.movie.title}</a>
                    <span className="muted">{x.count} хүн</span>
                  </li>
                ))}
              </ol>
            )}
            <a className="muted panel-more" href="#admin-views">Бүгдийг харах</a>
          </section>
        ))}
        <section className="panel">
          <h2>Шинэ хэрэглэгч</h2>
          <ol className="rank">
            {s.recent.map((u) => (
              <li key={u.id}>
                <a href="#admin-users">{u.email}</a>
                <span className="muted">{isActive(u) ? 'Эрхтэй' : formatDate(u.createdAt)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  )
}
