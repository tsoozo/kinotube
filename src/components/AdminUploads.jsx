import { useEffect, useState } from 'react'
import { cancel, clearFinished, isActive, retry, subscribe } from '../uploads.js'

const sizeText = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${Math.max(1, Math.round(b / 1024 ** 2))} MB`)

const STATUS = {
  queued: 'Дараалалд',
  uploading: 'Хуулж байна',
  finishing: 'Нийлүүлж байна',
  done: 'Дууссан',
  error: 'Тасарсан',
  canceled: 'Цуцалсан',
}

// Видео хуулах дараалал (админы бүх таб дээр). Хуулж байхад сайт дотор шилжиж болно, хөтчийг хаавал зогсоно.
export default function AdminUploads() {
  const [jobs, setJobs] = useState([])
  useEffect(() => subscribe(setJobs), [])
  if (!jobs.length) return null
  const active = jobs.filter(isActive).length

  return (
    <section className="panel uploads" aria-label="Видео хуулалт">
      <div className="uploads-head">
        <h2>Видео хуулалт</h2>
        {active < jobs.length && <button className="link-btn" onClick={clearFinished}>Дууссаныг арилгах</button>}
      </div>
      {active > 0 && <p className="muted small">Хуулж дуустал энэ цонхыг хаахгүй. Сайтын бусад хэсэг рүү шилжиж, дараагийн киногоо нэмж болно.</p>}
      <ul>
        {jobs.map((j) => {
          const pct = j.total ? Math.floor((j.loaded / j.total) * 100) : 0
          return (
            <li key={j.id}>
              <div className="uploads-row">
                <b>{j.title}</b>
                <span className={`pill ${j.status === 'done' ? 'ok' : j.status === 'error' ? 'bad' : ''}`}>
                  {STATUS[j.status]}{j.status === 'uploading' ? ` ${pct}%` : ''}
                </span>
              </div>
              <div className="uploads-bar"><span style={{ width: `${j.status === 'done' ? 100 : pct}%` }} /></div>
              <p className="muted small">
                {j.name} · {sizeText(j.loaded)} / {sizeText(j.total)}
                {j.status === 'done' && (j.published ? ' · сайтад нийтлэгдсэн' : ' · ноорог')}
                {j.error && ` · ${j.error}`}
              </p>
              {isActive(j) && <button className="link-btn" onClick={() => cancel(j.id)}>Цуцлах</button>}
              {(j.status === 'error' || j.status === 'canceled') && j.file && <button className="link-btn" onClick={() => retry(j.id)}>Дахин оролдох</button>}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
