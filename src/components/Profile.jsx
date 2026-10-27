import { useEffect, useState } from 'react'
import Thumbnail from './Thumbnail.jsx'
import { AdminIcon, LogoutIcon } from './Icons.jsx'
import {
  PAYMENT_STATUS_TEXT, PLANS, RENTAL, activeRentals, daysLeft, effectiveStatus, formatDate, formatDateTime, formatMoney,
  getHistory, isActive, isAdmin, listPayments, peekReturnTo, updateName, watchedRatio,
} from '../auth.js'

export default function Profile({ user, movies, onUser, onLogout }) {
  const [tab, setTab] = useState('history')
  const [message, setMessage] = useState(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user.name)
  const [leaving, setLeaving] = useState(false)
  const [payments, setPayments] = useState(null)

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
          <p className="muted">{user.email} · {formatDate(user.createdAt)}-нд бүртгүүлсэн</p>
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
          <p className="muted">Дахин орохдоо имэйл рүү ирэх кодоор нэвтэрнэ.</p>
          <div>
            <button className="btn-danger" onClick={onLogout} autoFocus>Гарах</button>
            <button className="btn-secondary" onClick={() => setLeaving(false)}>Болих</button>
          </div>
        </div>
      )}

      {message && <p className={`toast ${message.ok ? 'ok' : 'bad'}`}>{message.text}</p>}
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
