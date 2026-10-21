import { useEffect, useMemo, useRef, useState } from 'react'
import { BellIcon, WarningIcon } from './Icons.jsx'
import Thumbnail from './Thumbnail.jsx'
import { buildNotifications } from '../notifications.js'
import { getSeenNotifications, markNotificationsSeen } from '../auth.js'
import { timeAgo } from '../data.js'

export default function Notifications({ movies, user }) {
  const [open, setOpen] = useState(false)
  const [seen, setSeen] = useState(getSeenNotifications)
  const [unreadOnOpen, setUnreadOnOpen] = useState([])
  const ref = useRef(null)
  const items = useMemo(() => buildNotifications(movies, user), [movies, user])
  const unread = items.filter((n) => !seen.includes(n.id)).length

  // Гадна дарвал эсвэл Esc дарвал хаана.
  useEffect(() => {
    if (!open) return
    const onDown = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Нээх үед уншаагүйг тэмдэглээд, тэр төлөвийг цэгээр харуулна.
  const toggle = () => {
    if (!open) {
      setUnreadOnOpen(items.filter((n) => !seen.includes(n.id)).map((n) => n.id))
      markNotificationsSeen(items.map((n) => n.id))
      setSeen(getSeenNotifications())
    }
    setOpen((v) => !v)
  }

  return (
    <div className="notif" ref={ref}>
      <button className="icon-btn notif-btn" onClick={toggle} aria-label="Мэдэгдэл" aria-expanded={open}>
        <BellIcon />
        {unread > 0 && <span className="notif-badge">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <div className="notif-panel" role="dialog" aria-label="Мэдэгдэл">
          <h3>Мэдэгдэл</h3>
          {items.length === 0 ? (
            <p className="notif-empty">Шинэ мэдэгдэл алга.</p>
          ) : (
            <ul>
              {items.map((n) => (
                <li key={n.id}>
                  <a href={n.href} onClick={() => setOpen(false)} className={unreadOnOpen.includes(n.id) ? 'unread' : ''}>
                    <span className="notif-dot" />
                    <div className="notif-text">
                      <p>{n.text}</p>
                      <span>{n.type === 'movie' ? timeAgo(n.at) : 'Профайл руу орж сунгана уу'}</span>
                    </div>
                    {n.movie ? (
                      <div className="notif-thumb"><Thumbnail movie={n.movie} small /></div>
                    ) : (
                      <WarningIcon className="notif-warn" />
                    )}
                  </a>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
