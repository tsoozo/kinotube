import AdminCatalog from './AdminCatalog.jsx'
import AdminPayments from './AdminPayments.jsx'
import AdminStats from './AdminStats.jsx'
import AdminUsers from './AdminUsers.jsx'
import AdminViews from './AdminViews.jsx'
import { isAdmin } from '../auth.js'

const TABS = [
  { id: 'stats', label: 'Тойм' },
  { id: 'views', label: 'Үзэлт' },
  { id: 'movies', label: 'Кино' },
  { id: 'shorts', label: 'Shorts' },
  { id: 'users', label: 'Хэрэглэгч' },
  { id: 'payments', label: 'Төлбөр' },
]

// #admin, #admin-<таб>. Зөвхөн админ орно (сервер дахин шалгана).
export default function Admin({ tab, user, movies, shorts, onCatalog, onUser }) {
  if (!isAdmin(user)) return <p className="notice">Энэ хуудсанд зөвхөн админ нэвтэрнэ.</p>
  const current = TABS.some((t) => t.id === tab) ? tab : 'stats'

  let content
  if (current === 'movies' || current === 'shorts')
    content = <AdminCatalog key={current} kind={current} list={current === 'movies' ? movies : shorts} movies={movies} onCatalog={onCatalog} />
  else if (current === 'users') content = <AdminUsers me={user} onUser={onUser} />
  else if (current === 'views') content = <AdminViews movies={movies} />
  else if (current === 'payments') content = <AdminPayments />
  else content = <AdminStats movies={movies} shorts={shorts} />

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
      {content}
    </div>
  )
}
