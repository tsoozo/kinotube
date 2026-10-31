import AdminCatalog from './AdminCatalog.jsx'
import AdminPayments from './AdminPayments.jsx'
import AdminUploads from './AdminUploads.jsx'
import AdminStats from './AdminStats.jsx'
import AdminUsers from './AdminUsers.jsx'
import AdminViews from './AdminViews.jsx'
import { isAdmin } from '../auth.js'
import { isSeries } from '../data.js'

const TABS = [
  { id: 'stats', label: 'Тойм' },
  { id: 'views', label: 'Үзэлт' },
  { id: 'movies', label: 'Кино' },
  { id: 'series', label: 'Цуврал / Shorts' },
  { id: 'users', label: 'Хэрэглэгч' },
  { id: 'payments', label: 'Төлбөр' },
]

// #admin, #admin-<таб>. Зөвхөн админ орно (сервер дахин шалгана).
// items: бүх кино, цуврал (ноорог ч орно).
export default function Admin({ tab, user, items, onCatalog, onUser }) {
  if (!isAdmin(user)) return <p className="notice">Энэ хуудсанд зөвхөн админ нэвтэрнэ.</p>
  // Хуучин #admin-shorts → цуврал.
  const wanted = tab === 'shorts' ? 'series' : tab
  const current = TABS.some((t) => t.id === wanted) ? wanted : 'stats'
  const movies = items.filter((m) => !isSeries(m))
  const series = items.filter(isSeries)

  let content
  if (current === 'movies' || current === 'series')
    content = <AdminCatalog key={current} kind={current === 'series' ? 'series' : 'movie'} list={current === 'series' ? series : movies} onCatalog={onCatalog} />
  else if (current === 'users') content = <AdminUsers me={user} onUser={onUser} />
  else if (current === 'views') content = <AdminViews movies={items} />
  else if (current === 'payments') content = <AdminPayments />
  else content = <AdminStats movies={movies} series={series} />

  return (
    <div className="admin">
      <h1 className="admin-title">Админ</h1>
      <nav className="tabs admin-tabs" aria-label="Админ цэс">
        {TABS.map((t) => (
          <a key={t.id} href={`#admin-${t.id}`} className={current === t.id ? 'active' : ''} aria-current={current === t.id ? 'page' : undefined}>
            {t.label}
          </a>
        ))}
      </nav>
      <AdminUploads />
      {content}
    </div>
  )
}
