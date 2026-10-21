import { useState } from 'react'
import PinInput from './PinInput.jsx'
import {
  adminAdjustBalance, adminCancelPlan, adminDeleteUser, adminGrant, adminSetBlocked, adminSetPin, adminSetRole,
  listUsers, randomPin,
} from '../admin.js'
import { daysLeft, formatDate, formatDateTime, formatMoney, formatPhone, isActive, isAdmin } from '../auth.js'

const FILTERS = [
  ['all', 'Бүгд', () => true],
  ['active', 'Эрхтэй', isActive],
  ['inactive', 'Эрхгүй', (u) => !isActive(u)],
  ['blocked', 'Хаагдсан', (u) => u.blocked],
  ['admin', 'Админ', isAdmin],
]

const GRANTS = [
  ['7 хоног', { days: 7 }],
  ['1 сар', { months: 1 }],
  ['3 сар', { months: 3 }],
  ['1 жил', { months: 12 }],
]

export default function AdminUsers({ me, movies, onUser }) {
  const [users, setUsers] = useState(listUsers)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(null)
  const [pin, setPin] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [message, setMessage] = useState(null)

  // Үйлдэл хийгээд жагсаалтыг шинэчилнэ. Өөрийгөө өөрчилсөн бол апп-ын төлвийг ч шинэчилнэ.
  const act = (fn, ok) => {
    try {
      const u = fn()
      setUsers(listUsers())
      if (u?.phone === me.phone) onUser(u)
      setMessage({ ok: true, text: ok })
      return true
    } catch (e) {
      setMessage({ ok: false, text: e.message })
      return false
    }
  }

  const toggle = (phone) => {
    setOpen(open === phone ? null : phone)
    setPin('')
    setAmount('')
    setNote('')
    setMessage(null)
  }

  const q = query.trim().toLowerCase().replace(/\s/g, '')
  const test = FILTERS.find((f) => f[0] === filter)[2]
  const visible = users.filter((u) => test(u) && (!q || `${u.name}${u.phone}`.toLowerCase().replace(/\s/g, '').includes(q)))

  const detail = (u) => {
    const self = u.phone === me.phone
    const watched = (u.history || []).map((h) => movies.find((m) => m.id === h.id)?.title).filter(Boolean)
    return (
      <div className="admin-detail">
        {message && <p className={`toast ${message.ok ? 'ok' : 'bad'}`}>{message.text}</p>}
        <div className="profile-cards">
          <section className="panel">
            <h2>Үзэх эрх</h2>
            {isActive(u) ? (
              <p className="plan-status"><span className="pill ok">Идэвхтэй</span> {u.subscription.label} · {formatDate(u.subscription.endsAt)} хүртэл ({daysLeft(u)} хоног)</p>
            ) : (
              <p className="plan-status"><span className="pill bad">Эрхгүй</span> {u.subscription && `Сүүлийнх ${formatDate(u.subscription.endsAt)}-нд дууссан`}</p>
            )}
            <p className="muted">Үнэгүй эрх олгох / сунгах</p>
            <div className="amounts">
              {GRANTS.map(([label, period]) => (
                <button key={label} className="chip" onClick={() => act(() => adminGrant(u.phone, period), `${label} эрх олголоо`)}>+{label}</button>
              ))}
              {isActive(u) && (
                <button className="chip danger" onClick={() => confirm('Эрхийг одоо цуцлах уу?') && act(() => adminCancelPlan(u.phone), 'Эрх цуцлагдлаа')}>Цуцлах</button>
              )}
            </div>
          </section>

          <section className="panel">
            <h2>Данс</h2>
            <p className="big balance">{formatMoney(u.balance)}</p>
            <form
              className="inline-form"
              onSubmit={(e) => {
                e.preventDefault()
                if (act(() => adminAdjustBalance(u.phone, Number(amount), note), 'Данс засагдлаа')) {
                  setAmount('')
                  setNote('')
                }
              }}
            >
              <input aria-label="Дүн" inputMode="numeric" placeholder="+5000 / -5000" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^\d-]/g, ''))} />
              <input aria-label="Шалтгаан" placeholder="Шалтгаан" value={note} onChange={(e) => setNote(e.target.value)} />
              <button className="btn-small" type="submit">Хийх</button>
            </form>
          </section>

          <section className="panel">
            <h2>Нэвтрэх код</h2>
            <p className="muted">Код мартсан хэрэглэгчид шинэ код тохируулж, өөрт нь хэлнэ.</p>
            <form
              className="admin-pin"
              onSubmit={(e) => {
                e.preventDefault()
                if (act(() => adminSetPin(u.phone, pin), `Шинэ код: ${pin}`)) setPin('')
              }}
            >
              <PinInput id={`pin-${u.phone}`} value={pin} onChange={setPin} />
              <div className="admin-actions">
                <button className="btn-small" type="submit">Тохируулах</button>
                <button className="btn-secondary" type="button" onClick={() => setPin(randomPin())}>Санамсаргүй</button>
              </div>
            </form>
          </section>
        </div>

        <div className="admin-actions">
          <button className="btn-secondary" disabled={self} onClick={() => act(() => adminSetBlocked(u.phone, !u.blocked), u.blocked ? 'Бүртгэл нээгдлээ' : 'Бүртгэл хаагдлаа')}>
            {u.blocked ? 'Хаалт нээх' : 'Бүртгэл хаах'}
          </button>
          <button className="btn-secondary" disabled={self} onClick={() => act(() => adminSetRole(u.phone, !isAdmin(u)), isAdmin(u) ? 'Админ эрх хасагдлаа' : 'Админ болголоо')}>
            {isAdmin(u) ? 'Админ эрх хасах' : 'Админ болгох'}
          </button>
          <button
            className="btn-secondary danger"
            disabled={self}
            onClick={() => confirm(`${u.name} (${formatPhone(u.phone)})-г бүр мөсөн устгах уу?`) && act(() => { adminDeleteUser(u.phone); setOpen(null) }, 'Хэрэглэгч устгагдлаа')}
          >
            Устгах
          </button>
        </div>

        <p className="muted">Үзсэн: {watched.length ? watched.join(', ') : 'алга'}</p>
        {u.transactions.length > 0 && (
          <div className="table-wrap">
            <table className="tx">
              <tbody>
                {u.transactions.slice(0, 10).map((t, i) => (
                  <tr key={i}>
                    <td>{formatDateTime(t.at)}</td>
                    <td>{t.note}</td>
                    <td className={`num ${t.amount > 0 ? 'plus' : ''}`}>{t.amount === 0 ? '—' : `${t.amount > 0 ? '+' : '−'}${formatMoney(Math.abs(t.amount))}`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="admin-body">
      <div className="admin-toolbar">
        <input className="admin-search" type="search" placeholder="Нэр эсвэл утасны дугаар" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="amounts">
          {FILTERS.map(([id, label]) => (
            <button key={id} className={`chip ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
      </div>
      <p className="muted">{visible.length} хэрэглэгч</p>
      <ul className="list admin-users">
        {visible.map((u) => (
          <li key={u.phone} className={open === u.phone ? 'open' : ''}>
            <button className="admin-user" onClick={() => toggle(u.phone)} aria-expanded={open === u.phone}>
              <span className="profile-avatar small">{u.name.slice(0, 1)}</span>
              <span className="admin-user-text">
                <b>{u.name} {isAdmin(u) && <span className="pill ok">Админ</span>} {u.blocked && <span className="pill bad">Хаагдсан</span>}</b>
                <span className="muted">{formatPhone(u.phone)} · {formatDate(u.createdAt)}</span>
              </span>
              <span className="admin-user-meta">
                <span className={`pill ${isActive(u) ? 'ok' : 'bad'}`}>{isActive(u) ? `${daysLeft(u)} хоног` : 'Эрхгүй'}</span>
                <span className="muted">{formatMoney(u.balance)}</span>
              </span>
            </button>
            {open === u.phone && detail(u)}
          </li>
        ))}
      </ul>
      <p className="demo-note">Туршилтын горим: зөвхөн энэ хөтөч дээр бүртгүүлсэн хэрэглэгчид харагдана.</p>
    </div>
  )
}
