import { useState } from 'react'
import PinInput from './PinInput.jsx'
import Logo from './Logo.jsx'
import { configured, isValidEmail, sendCode, verifyCode } from '../auth.js'

// Имэйл рүү ирсэн 6 оронтой кодоор нэвтэрнэ, шинэ хэрэглэгч автоматаар бүртгэгдэнэ.
export default function Login({ onDone }) {
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [step, setStep] = useState('email')
  const [info, setInfo] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

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

  const send = run(async () => {
    if (!isValidEmail(email)) throw new Error('Имэйл хаягаа зөв оруулна уу.')
    await sendCode(email)
    setCode('')
    setInfo(`${email.trim()} хаяг руу 6 оронтой код илгээлээ. Spam хавтсаа ч шалгаарай.`)
    setStep('code')
  })

  const verify = run(async () => {
    if (!/^\d{6}$/.test(code)) throw new Error('6 оронтой кодоо оруулна уу.')
    onDone(await verifyCode(email, code))
  })

  let body
  if (!configured) {
    body = (
      <>
        <h1>Нэвтрэх</h1>
        <p className="form-error">Сервер тохируулаагүй байна. README-ийн дагуу .env файлаа бөглөнө үү.</p>
      </>
    )
  } else if (step === 'email') {
    body = (
      <form onSubmit={send} noValidate>
        <h1>Нэвтрэх</h1>
        <p className="form-hint">Имэйл рүү тань нэвтрэх код илгээнэ. Бүртгэлгүй бол код оруулахад шинээр үүснэ.</p>
        <label className="field">
          <span>Имэйл</span>
          <input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            placeholder="ner@jishee.mn"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Илгээж байна…' : 'Код авах'}</button>
      </form>
    )
  } else {
    body = (
      <form onSubmit={verify} noValidate>
        <h1>Нэвтрэх код</h1>
        {info && <p className="form-hint">{info}</p>}
        <div className="field"><span>6 оронтой код</span><PinInput id="otp" length={6} value={code} onChange={setCode} visible autoFocus /></div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Шалгаж байна…' : 'Нэвтрэх'}</button>
        <p className="form-links">
          <button type="button" onClick={() => { setStep('email'); setError('') }}>Имэйл солих</button>
          <button type="button" onClick={send} disabled={busy}>Код дахин авах</button>
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
