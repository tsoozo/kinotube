import { useState } from 'react'
import Thumbnail from './Thumbnail.jsx'
import { DownloadIcon, EditIcon, PlusIcon, ResetIcon, TrashIcon } from './Icons.jsx'
import { cleanItem, downloadJson, isCatalogEdited, resetCatalog, saveCatalog } from '../admin.js'
import { matches } from '../data.js'

const EMPTY = { id: '', title: '', year: '', genres: '', duration: '', description: '', video: '', thumbnail: '', movie: '', added: '' }

const toForm = (m) => ({ ...EMPTY, ...m, year: String(m.year ?? ''), genres: (m.genres || []).join(', '), movie: m.movie || '' })

// Кино эсвэл Shorts-ийн жагсаалтыг нэмэх, засах, устгах.
export default function AdminCatalog({ kind, list, movies, onCatalog }) {
  const isShorts = kind === 'shorts'
  const file = isShorts ? 'shorts.json' : 'movies.json'
  const [edited, setEdited] = useState(() => isCatalogEdited(kind))
  const [form, setForm] = useState(null)
  const [message, setMessage] = useState(null)
  const [query, setQuery] = useState('')

  const commit = (next, text) => {
    saveCatalog(kind, next)
    setEdited(true)
    onCatalog(kind, next)
    setMessage({ ok: true, text })
  }

  const submit = (e) => {
    e.preventDefault()
    try {
      const item = cleanItem(kind, form, list, form.originalId)
      const next = form.originalId
        ? list.map((m) => (m.id === form.originalId ? item : m))
        : [item, ...list]
      commit(next, form.originalId ? `"${item.title}" хадгалагдлаа` : `"${item.title}" нэмэгдлээ`)
      setForm(null)
    } catch (err) {
      setMessage({ ok: false, text: err.message })
    }
  }

  const remove = (m) => {
    if (!confirm(`"${m.title}"-г устгах уу?`)) return
    commit(list.filter((x) => x.id !== m.id), `"${m.title}" устгагдлаа`)
  }

  const reset = () => {
    if (!confirm(`Энэ хөтөч дээрх засварыг арилгаж, ${file} файлын жагсаалт руу буцах уу?`)) return
    resetCatalog(kind)
    setEdited(false)
    setForm(null)
    onCatalog(kind, null)
    setMessage({ ok: true, text: `${file} файлын жагсаалт руу буцлаа` })
  }

  const field = (key, label, props = {}) => (
    <label className="field">
      <span>{label}</span>
      <input value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} {...props} />
    </label>
  )

  const visible = list.filter((m) => matches(m, query))

  return (
    <div className="admin-body">
      <div className="admin-toolbar">
        <input className="admin-search" type="search" placeholder={isShorts ? 'Shorts хайх' : 'Кино хайх'} value={query} onChange={(e) => setQuery(e.target.value)} />
        <div className="admin-actions">
          <button className="btn-primary" onClick={() => { setForm({ ...EMPTY }); setMessage(null) }}>
            <PlusIcon width="20" height="20" /> {isShorts ? 'Shorts нэмэх' : 'Кино нэмэх'}
          </button>
          <button className="btn-secondary" onClick={() => downloadJson(file, list)}>
            <DownloadIcon width="20" height="20" /> {file}
          </button>
        </div>
      </div>

      {edited && (
        <div className="demo-note admin-edited">
          <span>Энэ хөтөч дээр засварласан жагсаалт ашиглаж байна. Бүх хүнд харагдуулахын тулд <b>{file}</b>-г татаж аваад <code>public/</code>-д солино.</span>
          <button className="link-btn" onClick={reset}><ResetIcon width="18" height="18" /> Файл руу буцах</button>
        </div>
      )}

      {message && <p className={`toast ${message.ok ? 'ok' : 'bad'}`}>{message.text}</p>}

      {form && (
        <form className="panel admin-form" onSubmit={submit}>
          <h2>{form.originalId ? 'Засах' : isShorts ? 'Шинэ Shorts' : 'Шинэ кино'}</h2>
          <div className="form-grid">
            {field('title', 'Нэр', { required: true, autoFocus: true })}
            {field('id', 'ID (латин, зураас)', { required: true, placeholder: 'the-general', autoCapitalize: 'off', spellCheck: false })}
            {!isShorts && field('year', 'Он', { inputMode: 'numeric', placeholder: '1926' })}
            {field('duration', isShorts ? 'Урт (≤ 20:00)' : 'Урт', { placeholder: isShorts ? '3:40' : '1:18:00' })}
            {!isShorts && field('genres', 'Төрөл (таслалаар)', { placeholder: 'Инээдмийн, Адал явдалт' })}
            {isShorts && (
              <label className="field">
                <span>Бүтэн кино</span>
                <select value={form.movie} onChange={(e) => setForm({ ...form, movie: e.target.value })}>
                  <option value="">Холбоогүй</option>
                  {movies.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
              </label>
            )}
            {field('video', 'Видео зам', { placeholder: isShorts ? 'shorts/<id>.mp4' : 'videos/<id>.mp4' })}
            {field('thumbnail', 'Зургийн зам', { placeholder: isShorts ? 'shorts/<id>.jpg' : 'thumbnails/<id>.jpg' })}
            {field('added', 'Нэмсэн огноо', { type: 'date' })}
          </div>
          <label className="field">
            <span>Тайлбар</span>
            <textarea rows="3" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </label>
          <div className="admin-actions">
            <button className="btn-primary" type="submit">Хадгалах</button>
            <button className="btn-secondary" type="button" onClick={() => setForm(null)}>Болих</button>
          </div>
        </form>
      )}

      <p className="muted">{visible.length} бичлэг</p>
      <ul className="list">
        {visible.map((m) => (
          <li key={m.id} className="admin-row">
            <Thumbnail movie={m} small />
            <div className="admin-row-text">
              <b>{m.title}</b>
              <p className="muted">
                {isShorts
                  ? `${m.movie ? `→ ${movies.find((x) => x.id === m.movie)?.title || m.movie}` : 'Холбоогүй'}`
                  : `${m.year} он · ${(m.genres || []).join(', ')}`}
              </p>
              <p className="muted">{m.id} · {m.added}</p>
            </div>
            <div className="admin-row-actions">
              <button className="icon-btn" aria-label="Засах" title="Засах" onClick={() => { setForm({ ...toForm(m), originalId: m.id }); setMessage(null); window.scrollTo(0, 0) }}>
                <EditIcon width="20" height="20" />
              </button>
              <button className="icon-btn" aria-label="Устгах" title="Устгах" onClick={() => remove(m)}>
                <TrashIcon width="20" height="20" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
