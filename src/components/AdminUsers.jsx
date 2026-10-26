import { useEffect, useState } from 'react'
import {
  adminCancelPlan, adminGrant, adminSetBlocked, adminSetEnd, adminSetRole, findUserByEmail, listUsers,
} from '../admin.js'
import { daysLeft, formatDate, formatMoney, isActive, isAdmin, isValidEmail, loadUser } from '../auth.js'

const FILTERS = [
  ['all', 'Бүгд'],
  ['active', 'Эрхтэй'],
  ['inactive', 'Эрхгүй'],
  ['blocked', 'Хаагдсан'],
  ['admin', 'Админ'],
]

const GRANTS = [
  ['7 хоног', { days: 7 }],
  ['1 сар', { months: 1 }],
  ['3 сар', { months: 3 }],
  ['1 жил', { months: 12 }],
]

const until = (u) => (isActive(u) ? `${formatDate(u.subscription.endsAt)} хүртэл.` : 'эрхгүй.')

// Нэг хэрэглэгчийн эрх олгох / сунгах / дуусах өдөр / цуцлах.
function GrantControls({ user, onAction }) {
  const [customN, setCustomN] = useState('')
  const [customUnit, setCustomUnit] = useState('days')
  const [endDate, setEndDate] = useState('')

  const grant = (label, period) => onAction((id) => adminGrant(id, period), (u) => `${label} эрх олголоо. ${until(u)}`)
  const grantCustom = () => {
    const n = Number(customN)
    if (!Number.isInteger(n) || n < 1) return onAction(() => Promise.reject(new Error('Хугацааг 1-ээс их бүхэл тоогоор оруулна уу.')))
    grant(`${n} ${customUnit === 'days' ? 'хоног' : 'сар'}`, customUnit === 'days' ? { days: n } : { months: n })
    setCustomN('')
  }

  return (
    <>
      <div className="amounts">
        {GRANTS.map(([label, period]) => (
          <button key={label} className="chip" onClick={() => grant(label, period)}>+{label}</button>
        ))}
        {isActive(user) && (
          <button className="chip danger" onClick={() => confirm(`${user.email}-ийн эрхийг цуцлах уу?`) && onAction(adminCancelPlan, () => 'эрх цуцлагдлаа.')}>
            Цуцлах
          </button>
        )}
      </div>
      <form className="grant-custom" onSubmit={(e) => { e.preventDefault(); grantCustom() }}>
        <span className="muted">Өөрөө тохируулах</span>
        <input className="admin-search" inputMode="numeric" placeholder="Тоо" aria-label="Хугацаа" value={customN} onChange={(e) => setCustomN(e.target.value.replace(/\D/g, '').slice(0, 4))} />
        <select className="admin-search" aria-label="Нэгж" value={customUnit} onChange={(e) => setCustomUnit(e.target.value)}>
          <option value="days">хоног</option>
          <option value="months">сар</option>
        </select>
        <button className="btn-small" type="submit">Сунгах</button>
      </form>
      <form className="grant-custom" onSubmit={(e) => { e.preventDefault(); onAction((id) => adminSetEnd(id, endDate), (u) => `эрх ${until(u)}`); setEndDate('') }}>
        <span className="muted">Дуусах өдөр</span>
        <input className="admin-search" type="date" aria-label="Дуусах өдөр" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        <button className="btn-small" type="submit">Тохируулах</button>
      </form>
    </>
  )
}

export default function AdminUsers({ me, onUser }) {
  const [users, setUsers] = useState(null)
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(null)
  const [message, setMessage] = useState(null)
  const [email, setEmail] = useState('')
  const [target, setTarget] = useState(null)
  const [grantMsg, setGrantMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const reload = () =>
    listUsers(filter).then(setUsers).catch((e) => {
      setUsers([])
      setMessage({ ok: false, text: e.message })
    })

  useEffect(() => {
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  // Үйлдлийн дараа жагсаалтыг шинэчилнэ. Өөрийгөө өөрчилсөн бол апп-ын төлвийг ч шинэчилнэ.
  const run = async (u, fn, text, setMsg) => {
    setBusy(true)
    try {
      const next = await fn(u.id)
      if (u.id === me.id) loadUser().then((x) => x && onUser(x))
      if (target?.id === u.id) setTarget(next)
      setMsg({ ok: true, text: `${u.email}: ${text(next)}` })
      reload()
    } catch (e) {
      setMsg({ ok: false, text: e.message })
    } finally {
      setBusy(false)
    }
  }

  const find = async (e) => {
    e.preventDefault()
    setGrantMsg(null)
    setTarget(null)
    if (!isValidEmail(email)) return setGrantMsg({ ok: false, text: 'Имэйл хаягаа зөв оруулна уу.' })
    try {
      const u = await findUserByEmail(email)
      if (u) setTarget(u)
      else setGrantMsg({ ok: false, text: `${email.trim()} хаягтай хэрэглэгч олдсонгүй. Эхлээд сайтад нэг удаа нэвтэрсэн байх ёстой.` })
    } catch (err) {
      setGrantMsg({ ok: false, text: err.message })
    }
  }

  const userLine = (u) => (
    <span className="admin-user-text">
      <b>{u.name} {isAdmin(u) && <span className="pill ok">Админ</span>} {u.blocked && <span className="pill bad">Хаагдсан</span>}</b>
      <span className="muted">{u.email} · {formatDate(u.createdAt)}</span>
    </span>
  )

  const detail = (u) => {
    const self = u.id === me.id
    const act = (fn, text) => run(u, fn, typeof text === 'function' ? text : () => text, setMessage)
    return (
      <div className="admin-detail">
        {message && <p className={`toast ${message.ok ? 'ok' : 'bad'}`}>{message.text}</p>}
        <section className="panel">
          <h2>Үзэх эрх</h2>
          {isActive(u) ? (
            <p className="plan-status"><span className="pill ok">Идэвхтэй</span> {formatDate(u.subscription.endsAt)} хүртэл ({daysLeft(u)} хоног)</p>
          ) : (
            <p className="plan-status"><span className="pill bad">Эрхгүй</span> {u.subscription && `Сүүлийнх ${formatDate(u.subscription.endsAt)}-нд дууссан`}</p>
          )}
          <GrantControls user={u} onAction={act} />
        </section>
        <div className="admin-actions">
          <button className="btn-secondary" disabled={self || busy} onClick={() => act((id) => adminSetBlocked(id, !u.blocked), u.blocked ? 'хаалт нээгдлээ.' : 'бүртгэл хаагдлаа.')}>
            {u.blocked ? 'Хаалт нээх' : 'Бүртгэл хаах'}
          </button>
          <button className="btn-secondary" disabled={self || busy} onClick={() => act((id) => adminSetRole(id, !isAdmin(u)), isAdmin(u) ? 'админ эрх хасагдлаа.' : 'админ боллоо.')}>
            {isAdmin(u) ? 'Админ эрх хасах' : 'Админ болгох'}
          </button>
        </div>
        <p className="muted">
          Түрээсэлж буй кино: {u.rentals} · Үзсэн кино: {u.views} · Нийт төлсөн: {formatMoney(u.paid)}
        </p>
      </div>
    )
  }

  return (
    <div className="admin-body">
      <section className="panel quick-grant">
        <h2>Эрх олгох, цуцлах</h2>
        <p className="muted">Хэрэглэгчийн нэвтэрдэг имэйлийг оруулна.</p>
        <form className="grant-custom" onSubmit={find}>
          <input
            className="admin-search"
            type="email"
            inputMode="email"
            placeholder="ner@jishee.mn"
            aria-label="Имэйл"
            value={email}
            onChange={(e) => { setEmail(e.target.value); setGrantMsg(null) }}
          />
          <button className="btn-small" type="submit">Хайх</button>
        </form>
        {target && (
          <>
            <div className="grant-user">
              <span className="profile-avatar small">{target.name.slice(0, 1).toUpperCase()}</span>
              {userLine(target)}
              {isActive(target) ? (
                <span className="pill ok">{formatDate(target.subscription.endsAt)} хүртэл · {daysLeft(target)} хоног</span>
              ) : (
                <span className="pill bad">Эрхгүй</span>
              )}
            </div>
            <GrantControls user={target} onAction={(fn, text) => run(target, fn, text, setGrantMsg)} />
          </>
        )}
        {grantMsg && <p className={`toast ${grantMsg.ok ? 'ok' : 'bad'}`}>{grantMsg.text}</p>}
      </section>
      <div className="admin-toolbar">
        <div className="amounts">
          {FILTERS.map(([id, label]) => (
            <button key={id} className={`chip ${filter === id ? 'active' : ''}`} onClick={() => setFilter(id)}>{label}</button>
          ))}
        </div>
      </div>
      {users === null ? (
        <p className="notice">Ачаалж байна…</p>
      ) : (
        <>
          <p className="muted">{users.length} хэрэглэгч</p>
          <ul className="list admin-users">
            {users.map((u) => (
              <li key={u.id} className={open === u.id ? 'open' : ''}>
                <button className="admin-user" onClick={() => { setOpen(open === u.id ? null : u.id); setMessage(null) }} aria-expanded={open === u.id}>
                  <span className="profile-avatar small">{u.name.slice(0, 1).toUpperCase()}</span>
                  {userLine(u)}
                  <span className="admin-user-meta">
                    <span className={`pill ${isActive(u) ? 'ok' : 'bad'}`}>{isActive(u) ? `${daysLeft(u)} хоног` : 'Эрхгүй'}</span>
                    {u.paid > 0 && <span className="muted">{formatMoney(u.paid)}</span>}
                  </span>
                </button>
                {open === u.id && detail(u)}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
