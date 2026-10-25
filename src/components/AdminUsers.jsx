import { useState } from 'react'
import PinInput from './PinInput.jsx'
import {
  adminAdjustBalance, adminCancelPlan, adminDeleteUser, adminGrant, adminSetBlocked, adminSetEnd, adminSetPin, adminSetRole,
  listUsers, randomPin,
} from '../admin.js'
import {
  daysLeft, findUser, formatDate, formatDateTime, formatMoney, formatPhone, isActive, isAdmin, isValidPhone, normalizePhone,
} from '../auth.js'

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
  const [grantPhone, setGrantPhone] = useState('')
  const [grantMsg, setGrantMsg] = useState(null)
  const [customN, setCustomN] = useState('')
  const [customUnit, setCustomUnit] = useState('days')
  const [endDate, setEndDate] = useState('')

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

  // Нэвтрэх нэрээр (утасны дугаар) хайж, эрх олгох / сунгах / цуцлах.
  const grantDigits = normalizePhone(grantPhone)
  const target = isValidPhone(grantDigits) ? findUser(grantDigits) : null
  const who = target && `${target.name} (${formatPhone(target.phone)})`

  const onTarget = (fn, text) => {
    try {
      const u = fn(target.phone)
      setUsers(listUsers())
      if (u.phone === me.phone) onUser(u)
      setGrantMsg({ ok: true, text: `${who}: ${text(u)}` })
      setCustomN('')
      setEndDate('')
    } catch (e) {
      setGrantMsg({ ok: false, text: e.message })
    }
  }
  const until = (u) => `${formatDate(u.subscription.endsAt)} хүртэл.`
  const grant = (label, period) => onTarget((p) => adminGrant(p, period), (u) => `${label} эрх олголоо. ${until(u)}`)
  const grantCustom = () => {
    const n = Number(customN)
    if (!Number.isInteger(n) || n < 1) return setGrantMsg({ ok: false, text: 'Хугацааг 1-ээс их бүхэл тоогоор оруулна уу.' })
    grant(`${n} ${customUnit === 'days' ? 'хоног' : 'сар'}`, customUnit === 'days' ? { days: n } : { months: n })
  }
  const cancelTarget = () => confirm(`${who}-ийн эрхийг цуцлах уу?`) && onTarget(adminCancelPlan, () => 'эрх цуцлагдлаа.')

  return (
    <div className="admin-body">
      <section className="panel quick-grant">
        <h2>Эрх олгох, цуцлах</h2>
        <p className="muted">Хэрэглэгчийн нэвтрэх дугаарыг оруулна.</p>
        <input
          className="admin-search"
          inputMode="numeric"
          placeholder="Утасны дугаар"
          aria-label="Утасны дугаар"
          value={grantPhone}
          onChange={(e) => { setGrantPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 9)); setGrantMsg(null) }}
        />
        {grantDigits.length === 8 && !target && (
          <p className="toast bad">{isValidPhone(grantDigits) ? `${formatPhone(grantDigits)} дугаартай хэрэглэгч олдсонгүй.` : 'Утасны дугаар буруу байна.'}</p>
        )}
        {target && (
          <>
            <div className="grant-user">
              <span className="profile-avatar small">{target.name.slice(0, 1)}</span>
              <span className="admin-user-text">
                <b>{target.name} {target.blocked && <span className="pill bad">Хаагдсан</span>}</b>
                <span className="muted">{formatPhone(target.phone)}</span>
                {isActive(target) ? (
                  <span className="pill ok">{formatDate(target.subscription.endsAt)} хүртэл · {daysLeft(target)} хоног</span>
                ) : (
                  <span className="pill bad">Эрхгүй</span>
                )}
              </span>
            </div>
            <div className="amounts">
              {GRANTS.map(([label, period]) => (
                <button key={label} className="chip" onClick={() => grant(label, period)}>+{label}</button>
              ))}
              {isActive(target) && <button className="chip danger" onClick={cancelTarget}>Цуцлах</button>}
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
            <form className="grant-custom" onSubmit={(e) => { e.preventDefault(); onTarget((p) => adminSetEnd(p, endDate), (u) => `эрх ${until(u)}`) }}>
              <span className="muted">Дуусах өдөр</span>
              <input className="admin-search" type="date" aria-label="Дуусах өдөр" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
              <button className="btn-small" type="submit">Тохируулах</button>
            </form>
          </>
        )}
        {grantMsg && <p className={`toast ${grantMsg.ok ? 'ok' : 'bad'}`}>{grantMsg.text}</p>}
      </section>
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
