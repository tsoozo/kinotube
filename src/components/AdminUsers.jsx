import { useEffect, useState } from 'react'
import {
  adminCancelPlan, adminGrant, adminSetBlocked, adminSetEnd, adminSetPin, adminSetRole, findUser, listUsers,
} from '../admin.js'
import { daysLeft, formatDate, formatMoney, isActive, isAdmin, isValidPhone, isValidPin, loadUser, userContact } from '../auth.js'

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
          <button className="chip danger" onClick={() => confirm(`${userContact(user)}-ийн эрхийг цуцлах уу?`) && onAction(adminCancelPlan, () => 'эрх цуцлагдлаа.')}>
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

// Кодоо мартсан хэрэглэгчид шинэ код (утсаар нь хүнийг таниад өгнө).
function PinReset({ user, onAction, busy }) {
  const [phone, setPhone] = useState(user.phone || '')
  const [pin, setPin] = useState('')
  const [err, setErr] = useState('')
  const submit = (e) => {
    e.preventDefault()
    if (!isValidPhone(phone)) return setErr('Утасны дугаараа 8 оронтойгоор оруулна уу.')
    if (!isValidPin(pin)) return setErr('4 оронтой код оруулна уу.')
    setErr('')
    onAction((id) => adminSetPin(id, phone, pin), `шинэ код ${pin} тохирууллаа.`)
    setPin('')
  }
  return (
    <section className="panel">
      <h2>Нэвтрэх код</h2>
      <p className="muted">Кодоо мартсан хэрэглэгчид шинэ 4 оронтой код өгнө. Хүнийг нь шалгаад өгөөрэй.</p>
      <form className="grant-custom" onSubmit={submit}>
        <input className="admin-search" type="tel" inputMode="numeric" maxLength={8} placeholder="Утасны дугаар" aria-label="Утасны дугаар"
          value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))} />
        <input className="admin-search" type="text" inputMode="numeric" maxLength={4} placeholder="Шинэ код" aria-label="Шинэ код"
          value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        <button className="btn-small" type="submit" disabled={busy}>Тохируулах</button>
      </form>
      {err && <p className="form-error">{err}</p>}
    </section>
  )
}

export default function AdminUsers({ me, onUser }) {
  const [users, setUsers] = useState(null)
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(null)
  const [message, setMessage] = useState(null)
  const [query, setQuery] = useState('')
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
      setMsg({ ok: true, text: `${userContact(u) || u.name}: ${text(next)}` })
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
    if (!isValidPhone(query) && !/@/.test(query)) return setGrantMsg({ ok: false, text: 'Утасны дугаараа 8 оронтойгоор оруулна уу.' })
    try {
      const u = await findUser(query)
      if (u) setTarget(u)
      else setGrantMsg({ ok: false, text: `${query.trim()} дугаартай хэрэглэгч олдсонгүй. Эхлээд сайтад бүртгүүлсэн байх ёстой.` })
    } catch (err) {
      setGrantMsg({ ok: false, text: err.message })
    }
  }

  const userLine = (u) => (
    <span className="admin-user-text">
      <b>{u.name} {isAdmin(u) && <span className="pill ok">Админ</span>} {u.blocked && <span className="pill bad">Хаагдсан</span>}</b>
      <span className="muted">{userContact(u) || 'Дугааргүй'} · {formatDate(u.createdAt)}</span>
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
        <PinReset user={u} onAction={act} busy={busy} />
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
        <p className="muted">Хэрэглэгчийн утасны дугаарыг оруулна.</p>
        <form className="grant-custom" onSubmit={find}>
          <input
            className="admin-search"
            type="tel"
            inputMode="numeric"
            placeholder="99112233"
            aria-label="Утасны дугаар"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setGrantMsg(null) }}
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
