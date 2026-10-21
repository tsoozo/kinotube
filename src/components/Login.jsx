import { useState } from 'react'
import PinInput from './PinInput.jsx'
import Logo from './Logo.jsx'
import {
  DEMO, confirmReset, isValidPhone, isValidPin, login, register, requestReset, userExists,
} from '../auth.js'

// mode: login | register | forgot
export default function Login({ mode, onDone, onNavigate }) {
  const [phone, setPhone] = useState('')
  const [pin, setPin] = useState('')
  const [pin2, setPin2] = useState('')
  const [name, setName] = useState('')
  const [smsCode, setSmsCode] = useState('')
  const [sentCode, setSentCode] = useState(null)
  const [error, setError] = useState('')

  const run = (fn) => (e) => {
    e.preventDefault()
    setError('')
    try {
      fn()
    } catch (err) {
      setError(err.message)
    }
  }

  const checkPhone = () => {
    if (!isValidPhone(phone)) throw new Error('8 оронтой утасны дугаараа зөв оруулна уу.')
  }
  const checkNewPin = () => {
    if (!isValidPin(pin)) throw new Error('4 оронтой тоон код оруулна уу.')
    if (pin !== pin2) throw new Error('Хоёр код таарахгүй байна.')
  }

  const switchTo = (m) => {
    setError('')
    setPin('')
    setPin2('')
    setSentCode(null)
    onNavigate(m === 'login' ? '#login' : `#${m}`)
  }

  const phoneField = (
    <label className="field">
      <span>Утасны дугаар</span>
      <input
        id="phone"
        type="tel"
        inputMode="numeric"
        placeholder="9911 2233"
        maxLength={9}
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        autoFocus
      />
    </label>
  )

  let body
  if (mode === 'register') {
    body = (
      <form onSubmit={run(() => { checkPhone(); checkNewPin(); onDone(register(phone, name, pin)) })}>
        <h1>Бүртгүүлэх</h1>
        {phoneField}
        <label className="field">
          <span>Нэр</span>
          <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Таны нэр" />
        </label>
        <div className="field"><span>4 оронтой код үүсгэх</span><PinInput id="new-pin" value={pin} onChange={setPin} /></div>
        <div className="field"><span>Кодоо давтах</span><PinInput id="new-pin2" value={pin2} onChange={setPin2} /></div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn-primary" type="submit">Бүртгүүлэх</button>
        <p className="form-links">
          Бүртгэлтэй юу? <button type="button" onClick={() => switchTo('login')}>Нэвтрэх</button>
        </p>
      </form>
    )
  } else if (mode === 'forgot') {
    body = !sentCode ? (
      <form onSubmit={run(() => { checkPhone(); setSentCode(requestReset(phone)) })}>
        <h1>Кодоо мартсан</h1>
        <p className="form-hint">Бүртгэлтэй дугаар руу тань 6 оронтой баталгаажуулах код илгээнэ.</p>
        {phoneField}
        {error && <p className="form-error">{error}</p>}
        <button className="btn-primary" type="submit">Код авах</button>
        <p className="form-links"><button type="button" onClick={() => switchTo('login')}>Нэвтрэх рүү буцах</button></p>
      </form>
    ) : (
      <form onSubmit={run(() => { checkNewPin(); onDone(confirmReset(smsCode.trim(), pin)) })}>
        <h1>Шинэ код үүсгэх</h1>
        <p className="form-hint">{phone} дугаар руу код илгээлээ.</p>
        <p className="demo-note">Туршилтын горим: SMS илгээгдэхгүй тул код энд харагдана: <b>{sentCode}</b></p>
        <label className="field">
          <span>Баталгаажуулах код</span>
          <input id="sms-code" inputMode="numeric" maxLength={6} value={smsCode} onChange={(e) => setSmsCode(e.target.value)} autoFocus />
        </label>
        <div className="field"><span>Шинэ 4 оронтой код</span><PinInput id="reset-pin" value={pin} onChange={setPin} /></div>
        <div className="field"><span>Кодоо давтах</span><PinInput id="reset-pin2" value={pin2} onChange={setPin2} /></div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn-primary" type="submit">Хадгалаад нэвтрэх</button>
        <p className="form-links"><button type="button" onClick={() => setSentCode(requestReset(phone))}>Код дахин авах</button></p>
      </form>
    )
  } else {
    body = (
      <form onSubmit={run(() => {
        checkPhone()
        if (!isValidPin(pin)) throw new Error('4 оронтой кодоо оруулна уу.')
        onDone(login(phone, pin))
      })}>
        <h1>Нэвтрэх</h1>
        {phoneField}
        <div className="field"><span>4 оронтой код</span><PinInput id="pin" value={pin} onChange={setPin} /></div>
        {error && <p className="form-error">{error}</p>}
        {error && isValidPhone(phone) && !userExists(phone) && (
          <button type="button" className="btn-secondary" onClick={() => switchTo('register')}>Энэ дугаараар бүртгүүлэх</button>
        )}
        <button className="btn-primary" type="submit">Нэвтрэх</button>
        <p className="form-links">
          <button type="button" onClick={() => switchTo('forgot')}>Кодоо мартсан уу?</button>
          <button type="button" onClick={() => switchTo('register')}>Бүртгүүлэх</button>
        </p>
        <p className="demo-note">Туршилтын бүртгэл: {DEMO.phone} · код {DEMO.pin}</p>
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
