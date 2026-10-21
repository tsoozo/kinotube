import { useMemo, useState } from 'react'
import { TX_TYPES, allTransactions } from '../admin.js'
import { formatDateTime, formatMoney, formatPhone } from '../auth.js'

export default function AdminPayments() {
  const [type, setType] = useState('all')
  const [query, setQuery] = useState('')
  const all = useMemo(allTransactions, [])

  const q = query.trim().toLowerCase()
  const list = all.filter(
    (t) => (type === 'all' || t.type === type) && (!q || `${t.name} ${t.phone} ${t.note}`.toLowerCase().includes(q)),
  )
  const plus = list.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const minus = list.filter((t) => t.amount < 0).reduce((s, t) => s - t.amount, 0)

  return (
    <div className="admin-body">
      <div className="admin-toolbar">
        <input className="admin-search" type="search" placeholder="Нэр, утас, утгаар хайх" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="amounts">
          {[['all', 'Бүгд'], ...Object.entries(TX_TYPES)].map(([id, label]) => (
            <button key={id} className={`chip ${type === id ? 'active' : ''}`} onClick={() => setType(id)}>{label}</button>
          ))}
        </div>
      </div>
      <p className="muted">{list.length} гүйлгээ · орлого +{formatMoney(plus)} · зарлага −{formatMoney(minus)}</p>
      {list.length === 0 ? (
        <p className="notice">Гүйлгээ алга.</p>
      ) : (
        <div className="table-wrap">
          <table className="tx">
            <thead><tr><th>Огноо</th><th>Хэрэглэгч</th><th>Төрөл</th><th>Утга</th><th className="num">Дүн</th></tr></thead>
            <tbody>
              {list.map((t, i) => (
                <tr key={i}>
                  <td>{formatDateTime(t.at)}</td>
                  <td>{t.name} <span className="muted">{formatPhone(t.phone)}</span></td>
                  <td>{TX_TYPES[t.type] || t.type}</td>
                  <td>{t.note}</td>
                  <td className={`num ${t.amount > 0 ? 'plus' : ''}`}>{t.amount === 0 ? '—' : `${t.amount > 0 ? '+' : '−'}${formatMoney(Math.abs(t.amount))}`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
