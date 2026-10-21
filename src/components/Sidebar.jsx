import { FilmIcon, HistoryIcon, HomeIcon, ShortsIcon, UserIcon } from './Icons.jsx'

export default function Sidebar({ open, page, user, genres, genre, onGenre, onNavigate, onClose }) {
  const item = (active, Icon, label, onClick) => (
    <button key={label} className={`side-item ${active ? 'active' : ''}`} onClick={onClick}>
      <Icon />
      <span>{label}</span>
    </button>
  )

  return (
    <>
      {open && <div className="scrim" onClick={onClose} />}
      <nav className={`sidebar ${open ? 'open' : ''}`} aria-label="Үндсэн цэс">
        {item(page === 'home' && genre === 'Бүгд', HomeIcon, 'Нүүр', () => onGenre('Бүгд'))}
        {item(page === 'shorts', ShortsIcon, 'Shorts', () => onNavigate('#shorts'))}
        {item(page === 'history', HistoryIcon, 'Сүүлд үзсэн', () => onNavigate('#history'))}
        {item(page === 'profile', UserIcon, user ? 'Миний профайл' : 'Нэвтрэх', () => onNavigate(user ? '#profile' : '#login'))}
        <hr />
        <h3>Төрөл</h3>
        {genres.map((g) => item(page === 'home' && genre === g, FilmIcon, g, () => onGenre(g)))}
      </nav>
      <nav className="mini-sidebar" aria-label="Товч цэс">
        <button className={page === 'home' ? 'active' : ''} onClick={() => onGenre('Бүгд')}><HomeIcon /><span>Нүүр</span></button>
        <button className={page === 'shorts' ? 'active' : ''} onClick={() => onNavigate('#shorts')}><ShortsIcon /><span>Shorts</span></button>
        <button className={page === 'history' ? 'active' : ''} onClick={() => onNavigate('#history')}><HistoryIcon /><span>Түүх</span></button>
        <button className={page === 'profile' ? 'active' : ''} onClick={() => onNavigate(user ? '#profile' : '#login')}><UserIcon /><span>{user ? 'Профайл' : 'Нэвтрэх'}</span></button>
      </nav>
    </>
  )
}
