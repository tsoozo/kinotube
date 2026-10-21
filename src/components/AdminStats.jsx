import { useMemo } from 'react'
import { stats } from '../admin.js'
import { formatDate, formatMoney, formatPhone, isActive } from '../auth.js'

export default function AdminStats({ movies, shorts }) {
  const s = useMemo(() => stats(movies, shorts), [movies, shorts])
  const tile = (label, value, sub) => (
    <div className="stat">
      <span>{label}</span>
      <b>{value}</b>
      {sub && <small>{sub}</small>}
    </div>
  )

  return (
    <div className="admin-body">
      <div className="stats">
        {tile('Хэрэглэгч', s.users, `Сүүлийн 30 хоногт +${s.newUsers}`)}
        {tile('Идэвхтэй эрх', s.active, s.users ? `${Math.round((s.active / s.users) * 100)}% нь` : '')}
        {tile('Энэ сарын цэнэглэлт', formatMoney(s.topupMonth), `Нийт ${formatMoney(s.topupAll)}`)}
        {tile('Энэ сарын эрхийн орлого', formatMoney(s.planMonth), `Нийт ${formatMoney(s.planAll)}`)}
        {tile('Дансны үлдэгдэл', formatMoney(s.balances), 'Бүх хэрэглэгчийн')}
        {tile('Кино / Shorts', `${s.movies} / ${s.shorts}`, '')}
      </div>

      <div className="profile-cards">
        <section className="panel">
          <h2>Их үзсэн кино</h2>
          {s.top.length === 0 ? (
            <p className="muted">Үзсэн түүх алга.</p>
          ) : (
            <ol className="rank">
              {s.top.map((x) => (
                <li key={x.movie.id}>
                  <a href={`#watch-${encodeURIComponent(x.movie.id)}`}>{x.movie.title}</a>
                  <span className="muted">{x.count} хүн</span>
                </li>
              ))}
            </ol>
          )}
        </section>
        <section className="panel">
          <h2>Шинэ хэрэглэгч</h2>
          <ol className="rank">
            {s.recent.map((u) => (
              <li key={u.phone}>
                <a href="#admin-users">{u.name} · {formatPhone(u.phone)}</a>
                <span className="muted">{isActive(u) ? 'Эрхтэй' : formatDate(u.createdAt)}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <p className="demo-note">Туршилтын горим: тоо зөвхөн энэ хөтөч дээрх бүртгэлээс гарна. Сервер холбогдсоны дараа бүх хэрэглэгчийн мэдээлэл харагдана.</p>
    </div>
  )
}
