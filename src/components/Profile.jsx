import { useEffect, useState } from 'react'
import Thumbnail from './Thumbnail.jsx'
import {
  PAYMENT_STATUS_TEXT, createPayment, daysLeft, effectiveStatus, formatDate, formatDateTime, formatMoney,
  getHistory, isActive, listPayments, listPlans, updateName,
} from '../auth.js'

const STATUS_PILL = { approved: 'ok', rejected: 'bad', expired: 'bad', created: 'wait', submitted: 'wait' }

export default function Profile({ user, movies, onUser, onLogout, onNavigate }) {
  const [tab, setTab] = useState('history')
  const [message, setMessage] = useState(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user.name)
  const [plans, setPlans] = useState(null)
  const [payments, setPayments] = useState(null)
  const [buying, setBuying] = useState(null)

  useEffect(() => {
    listPlans().then(setPlans).catch((e) => { setPlans([]); setMessage({ ok: false, text: e.message }) })
    listPayments().then(setPayments).catch(() => setPayments([]))
  }, [user.id])

  const saveName = async (e) => {
    e.preventDefault()
    try {
      onUser(await updateName(user, name))
      setMessage({ ok: true, text: 'Нэр хадгалагдлаа' })
    } catch (err) {
      setMessage({ ok: false, text: err.message })
    }
    setEditing(false)
  }

  // Эрх сонгоход төлбөрийн хүсэлт үүсч, банкны шилжүүлгийн дэлгэц рүү шилжинэ.
  const buy = async (code) => {
    setMessage(null)
    setBuying(code)
    try {
      const p = await createPayment(code)
      onNavigate(`#pay-${p.id}`)
    } catch (err) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setBuying(null)
    }
  }

  const active = isActive(user)
  const left = daysLeft(user)
  const open = (payments || []).filter((p) => ['created', 'submitted'].includes(effectiveStatus(p)))
  const history = getHistory(user)
    .map((h) => ({ ...h, movie: movies.find((m) => m.id === h.id) }))
    .filter((h) => h.movie)

  return (
    <div className="profile">
      <section className="profile-head">
        <span className="profile-avatar">{user.name.slice(0, 1)}</span>
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
          <button className="btn-secondary" onClick={onLogout}>Гарах</button>
        </div>
      </section>

      {message && <p className={`toast ${message.ok ? 'ok' : 'bad'}`}>{message.text}</p>}

      <div className="profile-cards">
        <section className={`panel plan-panel ${active ? 'active' : 'expired'}`}>
          <h2>Үзэх эрх</h2>
          {active ? (
            <>
              <p className="plan-status"><span className="pill ok">Идэвхтэй</span></p>
              <p className="big">{formatDate(user.accessUntil)}-нд дуусна</p>
              <p className="muted">{left} хоног үлдсэн</p>
            </>
          ) : (
            <>
              <p className="plan-status"><span className="pill bad">Эрхгүй</span></p>
              <p className="big">Кино үзэхийн тулд эрх авна уу</p>
            </>
          )}
          <div className="plans">
            {plans === null && <p className="muted">Ачаалж байна…</p>}
            {plans?.map((p) => (
              <button key={p.code} className="plan" disabled={buying !== null} onClick={() => buy(p.code)}>
                <span>{p.title}</span>
                <b>{formatMoney(p.price_mnt)}</b>
                <small>{buying === p.code ? 'Түр хүлээнэ үү…' : active ? 'Сунгах' : 'Авах'}</small>
              </button>
            ))}
          </div>
          {active && <p className="muted small">Сунгавал одоогийн эрх дууссаны дараагаас эхэлнэ.</p>}
        </section>

        <section className="panel">
          <h2>Төлбөр</h2>
          {open.length > 0 ? (
            <ul className="open-payments">
              {open.map((p) => (
                <li key={p.id}>
                  <a href={`#pay-${p.id}`}>
                    <span><b>{p.products.title}</b> · {p.ref_code}</span>
                    <span className="pill wait">{PAYMENT_STATUS_TEXT[effectiveStatus(p)]}</span>
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <ol className="steps">
              <li>Эрхээ сонгоно</li>
              <li>Дансанд банкаар шилжүүлнэ, гүйлгээний утга дээр <b>KT-</b> кодоо бичнэ</li>
              <li>"Гүйлгээ хийсэн" товч дарна</li>
              <li>Шалгаж баталгаажмагц эрх тань автоматаар нээгдэнэ</li>
            </ol>
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
                  <Thumbnail movie={h.movie} small />
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
            <thead><tr><th>Огноо</th><th>Утга</th><th>Код</th><th>Төлөв</th><th className="num">Дүн</th></tr></thead>
            <tbody>
              {payments.map((p) => {
                const s = effectiveStatus(p)
                return (
                  <tr key={p.id}>
                    <td>{formatDateTime(p.created_at)}</td>
                    <td>{p.products.title}</td>
                    <td><a href={`#pay-${p.id}`}>{p.ref_code}</a></td>
                    <td><span className={`pill ${STATUS_PILL[s]}`}>{PAYMENT_STATUS_TEXT[s]}</span></td>
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
