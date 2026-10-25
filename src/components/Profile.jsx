import { useState } from 'react'
import PinInput from './PinInput.jsx'
import Thumbnail from './Thumbnail.jsx'
import { AdminIcon, LogoutIcon } from './Icons.jsx'
import {
  PLANS, RENTAL, TOPUP_AMOUNTS, activeRentals, buyPlan, changePin, daysLeft, formatDate, formatDateTime, formatMoney,
  formatPhone, isActive, isAdmin, isValidPin, peekReturnTo, topUp, updateName, watchedRatio,
} from '../auth.js'

export default function Profile({ user, movies, onUser, onLogout }) {
  const [tab, setTab] = useState('history')
  const [message, setMessage] = useState(null)
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(user.name)
  const [pinForm, setPinForm] = useState(null)
  const [leaving, setLeaving] = useState(false)

  const act = (fn, ok) => {
    try {
      onUser(fn())
      setMessage({ ok: true, text: ok })
    } catch (e) {
      setMessage({ ok: false, text: e.message })
    }
  }

  const active = isActive(user)
  const left = daysLeft(user)
  const rentals = activeRentals(user)
  // Кино үзэх гэж байгаад данс цэнэглэхээр ирсэн бол буцах холбоос.
  const back = movies.find((m) => m.id === peekReturnTo())
  const history = (user.history || [])
    .map((h) => ({ ...h, movie: movies.find((m) => m.id === h.id) }))
    .filter((h) => h.movie)

  return (
    <div className="profile">
      <section className="profile-head">
        <span className="profile-avatar">{user.name.slice(0, 1)}</span>
        <div className="profile-id">
          {editing ? (
            <form className="inline-form" onSubmit={(e) => { e.preventDefault(); act(() => updateName(user, name), 'Нэр хадгалагдлаа'); setEditing(false) }}>
              <input id="profile-name" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
              <button className="btn-small" type="submit">Хадгалах</button>
            </form>
          ) : (
            <h1>{user.name} <button className="link-btn" onClick={() => setEditing(true)}>Засах</button></h1>
          )}
          <p className="muted">{formatPhone(user.phone)} · {formatDate(user.createdAt)}-нд бүртгүүлсэн</p>
        </div>
        <div className="profile-actions">
          {isAdmin(user) && <a className="btn-secondary" href="#admin"><AdminIcon width="20" height="20" /> Админ</a>}
          <button className="btn-secondary" onClick={() => setPinForm(pinForm ? null : { old: '', next: '' })}>Код солих</button>
          <button className="btn-secondary danger" onClick={() => setLeaving(true)}><LogoutIcon width="20" height="20" /> Гарах</button>
        </div>
      </section>

      {/* Гарах товч дээд хэсэгт, гүйлгэхгүйгээр харагдана */}
      {leaving && (
        <div className="panel logout-confirm" role="alertdialog" aria-labelledby="logout-q">
          <p id="logout-q"><b>Бүртгэлээсээ гарах уу?</b></p>
          <p className="muted">Дахин орохдоо утасны дугаар, 4 оронтой кодоо оруулна.</p>
          <div>
            <button className="btn-danger" onClick={onLogout} autoFocus>Гарах</button>
            <button className="btn-secondary" onClick={() => setLeaving(false)}>Болих</button>
          </div>
        </div>
      )}

      {pinForm && (
        <form
          className="panel pin-change"
          onSubmit={(e) => {
            e.preventDefault()
            if (!isValidPin(pinForm.next)) return setMessage({ ok: false, text: 'Шинэ код 4 оронтой тоо байх ёстой.' })
            act(() => changePin(user, pinForm.old, pinForm.next), 'Код солигдлоо')
            setPinForm(null)
          }}
        >
          <div className="field"><span>Одоогийн код</span><PinInput id="old-pin" value={pinForm.old} onChange={(v) => setPinForm({ ...pinForm, old: v })} /></div>
          <div className="field"><span>Шинэ код</span><PinInput id="next-pin" value={pinForm.next} onChange={(v) => setPinForm({ ...pinForm, next: v })} /></div>
          <button className="btn-primary" type="submit">Солих</button>
        </form>
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
            {PLANS.map((p) => (
              <button key={p.id} className="plan" onClick={() => act(() => buyPlan(user, p.id), `${p.label} авлаа`)}>
                <span>{p.label} · бүх кино</span>
                <b>{formatMoney(p.price)}</b>
                <small>{active ? 'Сунгах' : 'Авах'}</small>
              </button>
            ))}
          </div>
          <p className="muted plan-note">Нэг киног {RENTAL.days} хоног {formatMoney(RENTAL.price)}-өөр тухайн киноны хуудаснаас авна.</p>
          {rentals.length > 0 && (
            <ul className="rentals">
              {rentals.map((r) => (
                <li key={r.id}>
                  <a href={`#watch-${encodeURIComponent(r.id)}`}>{r.title}</a>
                  <span className="muted">{formatDateTime(r.endsAt)} хүртэл</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="panel">
          <h2>Данс</h2>
          <p className="muted">Үлдэгдэл</p>
          <p className="big balance">{formatMoney(user.balance)}</p>
          <p className="muted">Цэнэглэх дүн</p>
          <div className="amounts">
            {TOPUP_AMOUNTS.map((a) => (
              <button key={a} className="chip" onClick={() => act(() => topUp(user, a), `${formatMoney(a)} цэнэглэлээ`)}>
                +{formatMoney(a)}
              </button>
            ))}
          </div>
          <p className="demo-note">Туршилтын горим: жинхэнэ төлбөр авахгүй, үлдэгдэл шууд нэмэгдэнэ.</p>
        </section>
      </div>

      <div className="tabs">
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>Үзсэн түүх</button>
        <button className={tab === 'payments' ? 'active' : ''} onClick={() => setTab('payments')}>Гүйлгээний түүх</button>
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
      ) : user.transactions.length === 0 ? (
        <p className="notice">Гүйлгээ алга.</p>
      ) : (
        <div className="table-wrap">
          <table className="tx">
            <thead><tr><th>Огноо</th><th>Утга</th><th className="num">Дүн</th></tr></thead>
            <tbody>
              {user.transactions.map((t, i) => (
                <tr key={i}>
                  <td>{formatDateTime(t.at)}</td>
                  <td>{t.note}</td>
                  <td className={`num ${t.amount > 0 ? 'plus' : ''}`}>{t.amount > 0 ? '+' : '−'}{formatMoney(Math.abs(t.amount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
