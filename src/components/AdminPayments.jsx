import { useEffect, useState } from 'react'
import { approvePayment, listPaymentRequests, rejectPayment } from '../admin.js'
import { PAYMENT_STATUS_TEXT, formatDateTime, formatMoney } from '../auth.js'

const FILTERS = [['submitted', 'Шалгах'], ['approved', 'Батлагдсан'], ['rejected', 'Татгалзсан'], ['all', 'Бүгд']]

// Банкны шилжүүлгийн хүсэлтүүд. Telegram-аас гадна эндээс батлах / татгалзах боломжтой.
export default function AdminPayments() {
  const [status, setStatus] = useState('submitted')
  const [list, setList] = useState(null)
  const [message, setMessage] = useState(null)
  const [busy, setBusy] = useState('')

  const reload = () =>
    listPaymentRequests(status).then(setList).catch((e) => {
      setList([])
      setMessage({ ok: false, text: e.message })
    })

  useEffect(() => {
    setList(null)
    reload()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status])

  const decide = async (p, approve) => {
    let reason = null
    if (!approve) {
      reason = prompt(`${p.ref_code}: татгалзах шалтгаан (заавал биш)`, '')
      if (reason === null) return
    } else if (!confirm(`${p.ref_code} · ${formatMoney(p.amount_mnt)} · ${p.email}\nДансанд орсныг шалгасан уу? Батлах уу?`)) return
    setBusy(p.id)
    try {
      const r = approve ? await approvePayment(p.id) : await rejectPayment(p.id, reason)
      setMessage(
        r?.ok === false
          ? { ok: false, text: `${p.ref_code}: аль хэдийн шийдвэрлэгдсэн байна.` }
          : { ok: true, text: `${p.ref_code}: ${approve ? 'батлагдлаа, эрх нээгдлээ' : 'татгалзлаа'}.` },
      )
      reload()
    } catch (e) {
      setMessage({ ok: false, text: e.message })
    } finally {
      setBusy('')
    }
  }

  const total = (list || []).filter((p) => p.status === 'approved').reduce((s, p) => s + p.amount_mnt, 0)

  return (
    <div className="admin-body">
      <div className="admin-toolbar">
        <div className="amounts">
          {FILTERS.map(([id, label]) => (
            <button key={id} className={`chip ${status === id ? 'active' : ''}`} onClick={() => setStatus(id)}>{label}</button>
          ))}
        </div>
      </div>
      {message && <p className={`toast ${message.ok ? 'ok' : 'bad'}`}>{message.text}</p>}
      {list === null ? (
        <p className="notice">Ачаалж байна…</p>
      ) : list.length === 0 ? (
        <p className="notice">{status === 'submitted' ? 'Шалгах төлбөр алга.' : 'Төлбөр алга.'}</p>
      ) : (
        <>
          <p className="muted">{list.length} хүсэлт{total ? ` · батлагдсан ${formatMoney(total)}` : ''}</p>
          <div className="table-wrap">
            <table className="tx">
              <thead><tr><th>Огноо</th><th>Утга</th><th>Хэрэглэгч</th><th>Эрх</th><th className="num">Дүн</th><th>Төлөв</th></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDateTime(p.submitted_at || p.created_at)}</td>
                    <td className="mono">{p.ref_code}</td>
                    <td>{p.email}</td>
                    <td>{p.title}{p.movie_title ? ` · ${p.movie_title}` : ''}</td>
                    <td className="num">{formatMoney(p.amount_mnt)}</td>
                    <td>
                      {p.status === 'submitted' ? (
                        <span className="admin-actions">
                          <button className="btn-small" disabled={busy === p.id} onClick={() => decide(p, true)}>Батлах</button>
                          <button className="btn-secondary" disabled={busy === p.id} onClick={() => decide(p, false)}>Татгалзах</button>
                        </span>
                      ) : (
                        <>
                          {PAYMENT_STATUS_TEXT[p.status]}
                          {p.decided_by === 'telegram' && <span className="muted"> · Telegram</span>}
                          {p.reject_reason && <span className="muted"> · {p.reject_reason}</span>}
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
