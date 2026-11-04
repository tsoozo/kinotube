import { useEffect, useState } from 'react'
import PinInput from './PinInput.jsx'
import Logo from './Logo.jsx'
import {
  cleanPhone, configured, isValidEmail, isValidPhone, isValidPin, loginWithPin, phoneRegistered, registerWithPin, sendCode, verifyCode,
} from '../auth.js'

// Утасны дугаар + 4 оронтой кодоор нэвтэрнэ/бүртгүүлнэ. legacy: хуучин имэйл бүртгэлд (#login-email).
export default function Login({ onDone, legacy }) {
  const [mode, setMode] = useState(legacy ? 'email' : 'login')
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  // Нэвтрэхэд: { phone, registered } — дугаар бүртгэлтэй эсэхийг кодын өмнө шалгана.
  const [known, setKnown] = useState(null)

  const go = (m) => {
    setMode(m)
    setError('')
    setPin('')
    setPin2('')
  }

  const run = (fn) => async (e) => {
    e?.preventDefault()
    setError('')
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const checkPhone = () => {
    if (!isValidPhone(phone)) throw new Error('Утасны дугаараа 8 оронтойгоор оруулна уу.')
  }

  // Дугаарыг шалгаад бүртгэлтэй бол кодын нүд рүү шилжинэ. Шалгаж чадахгүй бол кодыг асууна.
  const check = async (p) => {
    let registered = true
    try {
      registered = await phoneRegistered(p)
    } catch {
      // Сүлжээний алдаа: шууд нэвтрэх оролдлогод үлдээнэ.
    }
    setKnown((k) => (k?.phone === p ? { phone: p, registered } : k))
  }

  // Бүртгэлтэй нь батлагдмагц кодын эхний нүд рүү.
  const ready = mode === 'login' && known?.phone === phone && known.registered === true
  useEffect(() => {
    if (ready) document.getElementById('pin-0')?.focus()
  }, [ready])

  const login = run(async () => {
    checkPhone()
    if (known?.phone !== phone || known.registered == null) {
      setKnown({ phone, registered: null })
      return check(phone)
    }
    if (!known.registered) return
    if (!isValidPin(pin)) throw new Error('4 оронтой кодоо оруулна уу.')
    try {
      onDone(await loginWithPin(phone, pin))
    } catch (err) {
      setPin('')
      throw err
    }
  })

  const register = run(async () => {
    checkPhone()
    if (!isValidPin(pin)) throw new Error('4 оронтой код сонгоно уу.')
    if (pin !== pin2) {
      setPin2('')
      throw new Error('Хоёр код таарахгүй байна.')
    }
    onDone(await registerWithPin(phone, pin, name))
  })

  const send = run(async () => {
    if (!isValidEmail(email)) throw new Error('Имэйл хаягаа зөв оруулна уу.')
    await sendCode(email)
    setCode('')
    setInfo(`${email.trim()} хаяг руу 6 оронтой код илгээлээ.`)
    setMode('email-code')
  })

  const verify = run(async () => {
    if (!/^\d{6}$/.test(code)) throw new Error('6 оронтой кодоо оруулна уу.')
    onDone(await verifyCode(email, code))
  })

  // 8 оронтой дугаар бүрэн болмогц нэвтрэхэд бүртгэлийг шалгана, бүртгүүлэхэд кодын нүд рүү шилжинэ.
  const onPhone = (v) => {
    const next = cleanPhone(v).slice(0, 8)
    setPhone(next)
    setError('')
    if (mode === 'login') {
      setPin('')
      if (next.length === 8) {
        if (known?.phone !== next) {
          setKnown({ phone: next, registered: null })
          check(next)
        }
      } else setKnown(null)
    } else if (next.length === 8 && phone.length < 8) setTimeout(() => document.getElementById('pin-0')?.focus(), 0)
  }
  // Бүртгэлд: код бүрэн болмогц давтах нүд рүү.
  const onPin = (v) => {
    if (mode === 'register' && v.length === 4 && pin.length < 4) setTimeout(() => document.getElementById('pin2-0')?.focus(), 0)
    setPin(v)
  }

  const phoneField = (
    <label className="field">
      <span>Утасны дугаар</span>
      <input
        id="phone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        placeholder="99112233"
        maxLength={9}
        value={phone}
        onChange={(e) => onPhone(e.target.value)}
        autoFocus
      />
    </label>
  )
  const err = error && <p className="form-error">{error}</p>

  let body
  if (!configured) {
    body = (
      <>
        <h1>Нэвтрэх</h1>
        <p className="form-error">Сервер тохируулаагүй байна. README-ийн дагуу .env файлаа бөглөнө үү.</p>
      </>
    )
  } else if (mode === 'login') {
    const state = known?.phone === phone ? known.registered : undefined
    body = (
      <form onSubmit={login} noValidate>
        <h1>Нэвтрэх</h1>
        {phoneField}
        {state === false ? (
          <>
            <div className="auth-notice">
              <strong>Бүртгэлтэй хэрэглэгч алга</strong>
              <span>{phone} дугаараар бүртгэл байхгүй байна. Эхлээд бүртгүүлж, өөрийн 4 оронтой кодыг сонгоно уу.</span>
            </div>
            <button className="btn-primary" type="button" onClick={() => go('register')}>Бүртгүүлэх</button>
          </>
        ) : state === true ? (
          <>
            <div className="field"><span>4 оронтой код</span><PinInput id="pin" value={pin} onChange={onPin} /></div>
            <p className="form-hint">Бүртгүүлэхдээ өөрийн зохиосон 4 оронтой кодоо оруулна уу. Код SMS-ээр ирэхгүй.</p>
            {err}
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Шалгаж байна…' : 'Нэвтрэх'}</button>
          </>
        ) : (
          <>
            {err}
            <button className="btn-primary" type="submit" disabled={busy || state === null}>
              {state === null ? 'Шалгаж байна…' : 'Үргэлжлүүлэх'}
            </button>
          </>
        )}
        {state !== false && (
          <p className="form-links">
            <span>Шинэ хэрэглэгч үү?</span>
            <button type="button" onClick={() => go('register')}>Бүртгүүлэх</button>
          </p>
        )}
      </form>
    )
  } else if (mode === 'register') {
    body = (
      <form onSubmit={register} noValidate>
        <h1>Бүртгүүлэх</h1>
        {phoneField}
        <label className="field">
          <span>Нэр (заавал биш)</span>
          <input id="name" type="text" autoComplete="nickname" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <div className="field"><span>4 оронтой код сонгох</span><PinInput id="pin" value={pin} onChange={onPin} /></div>
        <div className="field"><span>Кодоо давтах</span><PinInput id="pin2" value={pin2} onChange={setPin2} /></div>
        <p className="form-hint">Өөрийн зохиосон 4 оронтой кодыг оруулна уу. Код SMS-ээр ирэхгүй, дараа нь энэ дугаар, кодоороо нэвтэрнэ тул сайн санаарай.</p>
        {err}
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Бүртгэж байна…' : 'Бүртгүүлэх'}</button>
        <p className="form-links">
          <button type="button" onClick={() => go('login')}>Бүртгэлтэй юу? Нэвтрэх</button>
        </p>
      </form>
    )
  } else if (mode === 'email') {
    body = (
      <form onSubmit={send} noValidate>
        <h1>Хуучин бүртгэлээр нэвтрэх</h1>
        <p className="form-hint">Өмнө нь имэйлээр бүртгүүлсэн бол нэвтрээд профайлаасаа утасны дугаар, код тохируулаарай.</p>
        <label className="field">
          <span>Имэйл</span>
          <input id="email" type="email" inputMode="email" autoComplete="email" value={email}
            onChange={(e) => setEmail(e.target.value)} autoFocus />
        </label>
        {err}
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Илгээж байна…' : 'Код авах'}</button>
        <p className="form-links">
          <a href="#login">Утасаар нэвтрэх</a>
        </p>
      </form>
    )
  } else {
    body = (
      <form onSubmit={verify} noValidate>
        <h1>Нэвтрэх код</h1>
        {info && <p className="form-hint">{info}</p>}
        <div className="field"><span>6 оронтой код</span><PinInput id="otp" length={6} value={code} onChange={setCode} visible autoFocus /></div>
        {err}
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Шалгаж байна…' : 'Нэвтрэх'}</button>
        <p className="form-links">
          <button type="button" onClick={() => go('email')}>Имэйл солих</button>
        </p>
      </form>
    )
  }

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-logo"><Logo /></div>
        {body}
      </div>
    </div>
  )
}
