import { HistoryIcon, HomeIcon, ShortsIcon, UserIcon } from './Icons.jsx'

// YouTube утасны апп шиг доод талд байнга харагдах цэс.
export default function BottomNav({ page, user, onHome, onNavigate }) {
  const isProfile = ['profile', 'admin', 'login', 'register', 'forgot'].includes(page)
  const item = (active, icon, label, onClick) => (
    <button className={`bottom-item ${active ? 'active' : ''}`} onClick={onClick} aria-current={active ? 'page' : undefined}>
      {icon}
      <span>{label}</span>
    </button>
  )

  return (
    <nav className="bottom-nav" aria-label="Үндсэн цэс">
      {item(page === 'home', <HomeIcon />, 'Нүүр', onHome)}
      {item(page === 'shorts', <ShortsIcon />, 'Shorts', () => onNavigate('#shorts'))}
      {item(page === 'history' || page === 'later', <HistoryIcon />, 'Түүх', () => onNavigate('#history'))}
      {item(
        isProfile,
        user ? <span className="bottom-avatar">{user.name.slice(0, 1)}</span> : <UserIcon />,
        user ? 'Профайл' : 'Нэвтрэх',
        () => onNavigate(user ? '#profile' : '#login'),
      )}
    </nav>
  )
}
