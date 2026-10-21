import { useEffect, useState } from 'react'
import {
  effectiveStatus, formatMoney, getBank, getPayment, submitPayment, watchPayment,
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

// Банкны шилжүүлгээр эрх авах дэлгэц (#pay-<id>). Зугаагийн төлбөрийн дэлгэцтэй ижил дараалал:
// төлбөр хүлээгдэж байна → "Гүйлгээ хийсэн" → шалгаж байна → батлагдсан / татгалзсан / хугацаа дууссан.
export default function Pay({ id, onPaid }) {
  const [payment, setPayment] = useState(null)
  const [missing, setMissing] = useState(false)
  const [bank, setBank] = useState(null)
  const [error, setError] = useState('')
  const [pending, setPending] = useState(false)

  useEffect(() => {
    setPayment(null)
    setMissing(false)
    getPayment(id).then((p) => (p ? setPayment(p) : setMissing(true))).catch((e) => setError(e.message))
    getBank().then(setBank).catch((e) => setError(e.message))
  }, [id])

  const status = payment ? effectiveStatus(payment) : null

  useEffect(() => {
    if (status !== 'submitted') return
    return watchPayment(id, setPayment)
  }, [id, status])

  useEffect(() => {
    if (status === 'approved') onPaid()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  if (missing) return <p className="notice">Төлбөрийн хүсэлт олдсонгүй.</p>
  if (!payment) return error ? <p className="notice">{error}</p> : <p className="notice">Ачаалж байна…</p>

  const title = payment.products?.title || '—'
  const ref = payment.ref_code
  const amount = payment.amount_mnt

  let body
  if (status === 'approved') {
    body = (
      <div className="pay-state" role="status">
        <h1>Эрх нээгдлээ</h1>
        <p className="muted">{title} баталгаажлаа. Бүх кино нээлттэй.</p>
        <a className="btn-primary" href="#">Кино үзэх</a>
      </div>
    )
  } else if (status === 'rejected') {
    body = (
      <div className="pay-state" role="status">
        <h1>Төлбөр баталгаажсангүй</h1>
        <p className="muted">
          {ref} кодтой гүйлгээ олдсонгүй эсвэл дүн таарсангүй.
          {payment.reject_reason && <><br />Шалтгаан: {payment.reject_reason}</>}
        </p>
        <p className="muted small">Мөнгө шилжүүлсэн бол гүйлгээний баримтаа хадгалаад бидэнтэй холбогдоно уу.</p>
        <a className="btn-secondary" href="#profile">Дахин оролдох</a>
      </div>
    )
  } else if (status === 'expired') {
    body = (
      <div className="pay-state">
        <h1>Хугацаа дууссан</h1>
        <p className="muted">Энэ төлбөрийн хүсэлт 24 цагийн дотор баталгаажаагүй тул хүчингүй боллоо.</p>
        <a className="btn-secondary" href="#profile">Шинээр авах</a>
      </div>
    )
  } else if (status === 'submitted') {
    body = (
      <div className="pay-state" role="status" aria-live="polite">
        <h1>Шалгаж байна</h1>
        <p>{ref} · {formatMoney(amount)}</p>
        <p className="muted">
          Гүйлгээг шалгаж байна. Ихэвчлэн хэдэн минут болно. Баталгаажмагц энэ хуудас өөрөө шинэчлэгдэнэ — хааж орхисон ч эрх
          тань нээгдэнэ.
        </p>
        <p className="waiting"><span className="dot" aria-hidden="true" />Хүлээж байна</p>
        <a className="link-btn" href="#profile">Миний профайл</a>
      </div>
    )
  } else {
    const submit = async () => {
      setError('')
      setPending(true)
      try {
        const next = await submitPayment(id)
        if (next) setPayment((p) => ({ ...p, status: next }))
      } catch (e) {
        setError(e.message)
      } finally {
        setPending(false)
      }
    }
    body = (
      <>
        <div>
          <h1>Төлбөр</h1>
          <p className="muted">{title}</p>
        </div>
        <dl className="pay-rows">
          <Row label="Дүн" value={formatMoney(amount)} copy={String(amount)} strong />
          <Row label="Банк" value={bank?.name} />
          <Row label="Дансны дугаар" value={bank?.accountNumber} copy={bank?.accountNumber?.replace(/\s/g, '')} mono />
          <Row label="Хүлээн авагч" value={bank?.accountHolder} />
          <Row label="Гүйлгээний утга" value={ref} copy={ref} mono strong />
        </dl>
        <p>Гүйлгээний утга дээр <strong className="ref">{ref}</strong> гэж бичнэ үү.</p>
        <p className="muted small">
          Яг {formatMoney(amount)} шилжүүлнэ үү. Утгагүй эсвэл дүн зөрүүтэй гүйлгээг баталгаажуулах боломжгүй. Хүсэлт 24
          цагийн дотор хүчинтэй.
        </p>
        {error && <p className="form-error">{error}</p>}
        <button type="button" className="btn-primary wide" disabled={pending} onClick={submit}>
          {pending ? 'Илгээж байна…' : 'Гүйлгээ хийсэн'}
        </button>
      </>
    )
  }

  return (
    <div className="pay" data-status={status}>
      {body}
    </div>
  )
}
