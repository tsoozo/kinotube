import { useEffect, useState } from 'react'
import Thumbnail from './Thumbnail.jsx'
import PinInput from './PinInput.jsx'
import { AdminIcon, LogoutIcon } from './Icons.jsx'
import {
  PAYMENT_STATUS_TEXT, PLANS, RENTAL, activeRentals, daysLeft, effectiveStatus, formatDate, formatDateTime, formatMoney,
  getHistory, isActive, isAdmin, isValidPhone, isValidPin, listPayments, peekReturnTo, setMyPin, updateName, userContact,
  watchedRatio,
} from '../auth.js'

// Утасны дугаар, 4 оронтой код тохируулах/солих (хуучин имэйл бүртгэлд дугаар нэмэх).
function PinSettings({ user, onUser, onMessage, onClose }) {
  const [phone, setPhone] = useState(user.phone || '')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const save = async (e) => {
    e.preventDefault()
    if (!isValidPhone(phone)) return setError('Утасны дугаараа 8 оронтойгоор оруулна уу.')
    if (!isValidPin(pin)) return setError('4 оронтой код оруулна уу.')
    if (pin !== pin2) return setError('Хоёр код таарахгүй байна.')
    setError('')
    setBusy(true)
    try {
      onUser(await setMyPin(user, phone, pin))
      onMessage({ ok: true, text: 'Нэвтрэх дугаар, код хадгалагдлаа' })
      onClose?.()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel pin-settings">
      <h2>{user.phone ? 'Код солих' : 'Утасны дугаар, код тохируулах'}</h2>
      {!user.phone && <p className="muted">Дараа нь утасны дугаар, 4 оронтой кодоороо нэвтэрнэ.</p>}
      <form onSubmit={save} noValidate>
        <label className="field">
          <span>Утасны дугаар</span>
          <input id="my-phone" type="tel" inputMode="numeric" maxLength={8} placeholder="99112233" value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 8))} />
        </label>
        <div className="field"><span>Шинэ код</span><PinInput id="my-pin" value={pin} onChange={setPin} /></div>
        <div className="field"><span>Кодоо давтах</span><PinInput id="my-pin2" value={pin2} onChange={setPin2} /></div>
        {error && <p className="form-error">{error}</p>}
        <div className="pin-actions">
          <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Хадгалж байна…' : 'Хадгалах'}</button>
          {onClose && <button className="btn-secondary" type="button" onClick={onClose}>Болих</button>}
        </div>
      </form>
    </section>
  )
}

export default function Profile({ user, movies, onUser, onLogout }) {
  const [tab, setTab] = useState('history')
  const [message, setMessage] = useState(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user.name)
  const [leaving, setLeaving] = useState(false)
  const [payments, setPayments] = useState(null)
  const [pinOpen, setPinOpen] = useState(false)

  useEffect(() => {
    if (tab !== 'payments') return
    listPayments().then(setPayments).catch((e) => {
      setPayments([])
      setMessage({ ok: false, text: e.message })
    })
  }, [tab])

  const saveName = async (e) => {
    e.preventDefault()
    try {
      onUser(await updateName(user, name))
      setMessage({ ok: true, text: 'Нэр хадгалагдлаа' })
      setEditing(false)
    } catch (err) {
      setMessage({ ok: false, text: err.message })
    }
  }

  const active = isActive(user)
  const left = daysLeft(user)
  const rentals = activeRentals(user)
  // Кино үзэх гэж байгаад эрх авахаар ирсэн бол буцах холбоос.
  const back = movies.find((m) => m.id === peekReturnTo())
  const history = getHistory(user)
    .map((h) => ({ ...h, movie: movies.find((m) => m.id === h.id) }))
    .filter((h) => h.movie)
  const month = PLANS[0]

  return (
    <div className="profile">
      <section className="profile-head">
        <span className="profile-avatar">{user.name.slice(0, 1).toUpperCase()}</span>
        <div className="profile-id">
          {editing ? (
            <form className="inline-form" onSubmit={saveName}>
              <input id="profile-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} autoFocus />
              <button className="btn-small" type="submit">Хадгалах</button>
            </form>
          ) : (
            <h1>{user.name} <button className="link-btn" onClick={() => setEditing(true)}>Засах</button></h1>
          )}
          <p className="muted">
            {userContact(user)}{userContact(user) && ' · '}{formatDate(user.createdAt)}-нд бүртгүүлсэн
            {user.phone && !pinOpen && <> · <button className="link-btn" onClick={() => setPinOpen(true)}>Код солих</button></>}
          </p>
        </div>
        <div className="profile-actions">
          {isAdmin(user) && <a className="btn-secondary" href="#admin"><AdminIcon width="20" height="20" /> Админ</a>}
          <button className="btn-secondary danger" onClick={() => setLeaving(true)}><LogoutIcon width="20" height="20" /> Гарах</button>
        </div>
      </section>

      {/* Гарах товч дээд хэсэгт, гүйлгэхгүйгээр харагдана */}
      {leaving && (
        <div className="panel logout-confirm" role="alertdialog" aria-labelledby="logout-q">
          <p id="logout-q"><b>Бүртгэлээсээ гарах уу?</b></p>
          <p className="muted">{user.phone ? 'Дахин орохдоо утасны дугаар, 4 оронтой кодоороо нэвтэрнэ.' : 'Утасны дугаар, код тохируулаагүй тул дахин нэвтрэхэд хүндрэлтэй. Эхлээд тохируулна уу.'}</p>
          <div>
            <button className="btn-danger" onClick={onLogout} autoFocus>Гарах</button>
            <button className="btn-secondary" onClick={() => setLeaving(false)}>Болих</button>
          </div>
        </div>
      )}

      {message && <p className={`toast ${message.ok ? 'ok' : 'bad'}`}>{message.text}</p>}
      {(!user.phone || pinOpen) && (
        <PinSettings user={user} onUser={onUser} onMessage={setMessage} onClose={user.phone ? () => setPinOpen(false) : null} />
      )}
      {back && !active && (
        <a className="toast ok back-link" href={`#watch-${encodeURIComponent(back.id)}`}>
          «{back.title}» руу буцаж эрхээ сонгох
        </a>
      )}

      <div className="profile-cards">
        <section className={`panel plan-panel ${active ? 'active' : 'expired'}`}>
          <h2>Үзэх эрх</h2>
          {active ? (
            <>
              <p className="plan-status"><span className="pill ok">Идэвхтэй</span> {user.subscription.label}</p>
              <p className="big">{formatDate(user.subscription.endsAt)}-нд дуусна</p>
              <p className="muted">{left} хоног үлдсэн</p>
            </>
          ) : (
            <>
              <p className="plan-status"><span className="pill bad">Эрхгүй</span></p>
              <p className="big">{rentals.length ? 'Зөвхөн сонгосон кино' : 'Кино үзэхийн тулд эрх авна уу'}</p>
              {user.subscription && <p className="muted">Сүүлийн эрх {formatDate(user.subscription.endsAt)}-нд дууссан</p>}
            </>
          )}
          <div className="plans">
            <a className="plan" href="#pay-month">
              <span>{month.label} · бүх кино</span>
              <b>{formatMoney(month.price)}</b>
              <small>{active ? 'Сунгах' : 'Авах'}</small>
            </a>
          </div>
          <p className="muted plan-note">Нэг киног {RENTAL.days} хоногоор тухайн киноны хуудаснаас авна (үнэ кино бүрт өөр).</p>
          {rentals.length > 0 && (
            <ul className="rentals">
              {rentals.map((r) => (
                <li key={r.id}>
                  <a href={`#watch-${encodeURIComponent(r.id)}`}>{r.title || r.id}</a>
                  <span className="muted">{formatDateTime(r.endsAt)} хүртэл</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="tabs">
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Үзсэн түүх</button>
        <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>Төлбөрийн түүх</button>
      </div>

      {tab === 'history' ? (
        history.length === 0 ? (
          <p className="notice">Та одоогоор кино үзээгүй байна.</p>
        ) : (
          <ul className="list">
            {history.map((h) => (
              <li key={h.id}>
                <a className="history-row" href={`#watch-${encodeURIComponent(h.id)}`}>
                  <Thumbnail movie={h.movie} small progress={watchedRatio(h)} />
                  <div>
                    <b>{h.movie.title}</b>
                    <p className="muted">{h.movie.year} он · {h.movie.duration}</p>
                    {h.at && <p className="muted">Үзсэн: {formatDateTime(h.at)}</p>}
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )
      ) : payments === null ? (
        <p className="notice">Ачаалж байна…</p>
      ) : payments.length === 0 ? (
        <p className="notice">Төлбөр алга.</p>
      ) : (
        <div className="table-wrap">
          <table className="tx">
            <thead><tr><th>Огноо</th><th>Утга</th><th>Төлөв</th><th className="num">Дүн</th></tr></thead>
            <tbody>
              {payments.map((p) => {
                const st = effectiveStatus(p)
                const open = st === 'created' || st === 'submitted'
                const href = p.product === 'rent' ? `#pay-rent-${encodeURIComponent(p.movie_id)}` : '#pay-month'
                return (
                  <tr key={p.id}>
                    <td>{formatDateTime(p.created_at)}</td>
                    <td>
                      {p.products?.title}{p.movie_title ? ` · ${p.movie_title}` : ''} <span className="muted">{p.ref_code}</span>
                    </td>
                    <td>
                      {open ? <a href={href}>{PAYMENT_STATUS_TEXT[st]}</a> : PAYMENT_STATUS_TEXT[st]}
                      {st === 'rejected' && p.reject_reason && <span className="muted"> · {p.reject_reason}</span>}
                    </td>
                    <td className="num">{formatMoney(p.amount_mnt)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
