import { useEffect, useRef, useState } from 'react'
import { BackIcon, CrownIcon, SuccessIcon } from './Icons.jsx'
import {
  BANK, PLANS, RENTAL, canWatchMovie, createPayment, effectiveStatus, findOpenPayment, formatDateTime, formatMoney,
  loadUser, rentalEndsAt, submitPayment, takeReturnTo, watchPayment,
} from '../auth.js'

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    // Хуучин Android WebView: түр textarea-гаар хуулна.
    const ta = document.createElement('textarea')
    ta.value = text
    ta.setAttribute('readonly', '')
    ta.style.position = 'fixed'
    ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    const ok = document.execCommand('copy')
    ta.remove()
    return ok
  }
}

function CopyButton({ value, label }) {
  const [copied, setCopied] = useState(false)
  return (
    <button
      type="button"
      className="copy-btn"
      aria-label={`${label} хуулах`}
      onClick={async () => {
        if (await copyText(value)) {
          setCopied(true)
          setTimeout(() => setCopied(false), 1500)
        }
      }}
    >
      <span aria-live="polite">{copied ? 'Хуулсан' : 'Хуулах'}</span>
    </button>
  )
}

function Row({ label, value, copy, mono, strong }) {
  return (
    <div className="pay-row">
      <div>
        <dt>{label}</dt>
        <dd className={`${mono ? 'mono' : ''} ${strong ? 'strong' : ''}`}>{value || '—'}</dd>
      </div>
      {copy && value ? <CopyButton value={copy} label={label} /> : null}
    </div>
  )
}

// #pay-<rent|month>[-<id>]: банкны шилжүүлгээр эрх авах. Дараалал:
// эрх сонгох → дансны мэдээлэл, KT код → "Гүйлгээ хийсэн" → шалгаж байна → батлагдсан / татгалзсан.
// Админ Telegram-аар батлахад эрх нээгдэж, үзэж байсан кино руу шууд буцна.
export default function Checkout({ kind, movie, user, onUser }) {
  const rent = kind === 'rent'
  const [payment, setPayment] = useState(undefined)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const timer = useRef(0)
  const backHash = movie ? `#watch-${encodeURIComponent(movie.id)}` : '#profile'
  const price = rent ? RENTAL.price : PLANS[0].price

  // Аль хэдийн эрхтэй бол төлөх шаардлагагүй (сарын эрхийг профайлаас сунгаж болно).
  useEffect(() => {
    if (movie && canWatchMovie(user, movie.id)) location.replace(backHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Энэ эрхийн дуусаагүй хүсэлт байвал шууд үргэлжлүүлнэ.
  useEffect(() => {
    findOpenPayment(kind, movie?.id).then(setPayment).catch((e) => {
      setPayment(null)
      setError(e.message)
    })
  }, [kind, movie?.id])

  useEffect(() => () => clearTimeout(timer.current), [])

  const status = payment ? effectiveStatus(payment) : null

  useEffect(() => {
    if (status !== 'submitted') return
    return watchPayment(payment.id, setPayment)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment?.id, status])

  // Батлагдмагц эрхээ серверээс дахин уншаад үзэж байсан кино руу буцна.
  useEffect(() => {
    if (status !== 'approved') return
    const returnId = takeReturnTo()
    const target = movie ? backHash : returnId ? `#watch-${encodeURIComponent(returnId)}` : ''
    loadUser().then((u) => {
      if (u) onUser(u)
      if (target) timer.current = setTimeout(() => location.replace(target), 2500)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const run = (fn) => async () => {
    setError('')
    setBusy(true)
    try {
      await fn()
    } catch (e) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const start = run(async () => setPayment(await createPayment(kind, movie)))
  const submit = run(async () => {
    const next = await submitPayment(payment.id)
    if (next) setPayment((p) => ({ ...p, status: next }))
  })
  const again = () => {
    setError('')
    setPayment(null)
  }

  const summary = (
    <section className={`checkout-summary ${rent ? '' : 'premium'}`}>
      {!rent && <CrownIcon className="pay-crown" />}
      <span>{rent ? 'Зөвхөн энэ кино' : 'Бүх кино'}</span>
      <b>{formatMoney(payment?.amount_mnt ?? price)}</b>
      <small>{rent ? `«${movie.title}» · ${RENTAL.days} хоног үзнэ` : '1 сар хязгааргүй үзнэ'}</small>
    </section>
  )

  let body
  if (payment === undefined) {
    body = <p className="notice">Ачаалж байна…</p>
  } else if (status === 'approved') {
    const ends = rent ? rentalEndsAt(user, movie.id) : user.subscription?.endsAt
    body = (
      <div className="checkout-done" role="status">
        <SuccessIcon />
        <h1>Эрх нээгдлээ</h1>
        <p className="muted">{rent ? movie.title : 'Бүх кино'}{ends ? ` · ${formatDateTime(ends)} хүртэл` : ''}</p>
        <a className="btn-primary" href={movie ? backHash : '#'} onClick={(e) => { e.preventDefault(); location.replace(movie ? backHash : '#') }}>
          {movie ? 'Киноо үзэх' : 'Кино үзэх'}
        </a>
      </div>
    )
  } else if (status === 'rejected') {
    body = (
      <div className="pay-state" role="status">
        <h1>Төлбөр баталгаажсангүй</h1>
        <p className="muted">
          {payment.ref_code} кодтой гүйлгээ олдсонгүй эсвэл дүн таарсангүй.
          {payment.reject_reason && <><br />Шалтгаан: {payment.reject_reason}</>}
        </p>
        <p className="muted small">Мөнгө шилжүүлсэн бол гүйлгээний баримтаа хадгалаад бидэнтэй холбогдоно уу.</p>
        <button className="btn-secondary" onClick={again}>Дахин оролдох</button>
      </div>
    )
  } else if (status === 'expired') {
    body = (
      <div className="pay-state">
        <h1>Хугацаа дууссан</h1>
        <p className="muted">Энэ төлбөрийн хүсэлт 24 цагийн дотор баталгаажаагүй тул хүчингүй боллоо.</p>
        <button className="btn-secondary" onClick={again}>Шинээр авах</button>
      </div>
    )
  } else if (status === 'submitted') {
    body = (
      <div className="pay-state" role="status" aria-live="polite">
        <h1>Шалгаж байна</h1>
        <p>{payment.ref_code} · {formatMoney(payment.amount_mnt)}</p>
        <p className="muted">
          Гүйлгээг шалгаж байна. Ихэвчлэн хэдэн минут болно. Баталгаажмагц энэ хуудас өөрөө шинэчлэгдэнэ. Хааж орхисон ч
          эрх тань нээгдэнэ.
        </p>
        <p className="waiting"><span className="dot" aria-hidden="true" />Хүлээж байна</p>
      </div>
    )
  } else if (status === 'created') {
    const ref = payment.ref_code
    const amount = payment.amount_mnt
    body = (
      <>
        {summary}
        <dl className="pay-rows">
          <Row label="Дүн" value={formatMoney(amount)} copy={String(amount)} strong />
          <Row label="Банк" value={BANK.name} />
          <Row label="Дансны дугаар" value={BANK.accountNumber} copy={BANK.accountNumber} mono />
          <Row label="Хүлээн авагч" value={BANK.accountHolder} />
          <Row label="Гүйлгээний утга" value={ref} copy={ref} mono strong />
        </dl>
        <p>Гүйлгээний утга дээр <strong className="ref">{ref}</strong> гэж бичнэ үү.</p>
        <p className="muted small">
          Яг {formatMoney(amount)} шилжүүлнэ үү. Утгагүй эсвэл дүн зөрүүтэй гүйлгээг баталгаажуулах боломжгүй. Хүсэлт 24
          цагийн дотор хүчинтэй.
        </p>
        {error && <p className="form-error">{error}</p>}
        <button type="button" className="btn-primary checkout-pay" disabled={busy} onClick={submit}>
          {busy ? 'Илгээж байна…' : 'Гүйлгээ хийсэн'}
        </button>
      </>
    )
  } else {
    body = (
      <>
        {summary}
        <p className="muted">
          Дансаар шилжүүлэг хийнэ. Дараагийн алхамд дансны дугаар, гүйлгээний утга харагдана. Төлбөр баталгаажмагц эрх
          тань нээгдэнэ.
        </p>
        {error && <p className="form-error">{error}</p>}
        <button type="button" className="btn-primary checkout-pay" disabled={busy} onClick={start}>
          {busy ? 'Түр хүлээнэ үү…' : 'Дансаар төлөх'}
        </button>
      </>
    )
  }

  return (
    <div className="checkout" data-status={status || 'new'}>
      {status !== 'approved' && <a className="link-btn checkout-back" href={backHash}><BackIcon /> Буцах</a>}
      {(!status || status === 'created') && <h1>Төлбөр төлөх</h1>}
      {body}
    </div>
  )
}
