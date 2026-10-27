import { useEffect, useState } from 'react'
import Thumbnail from './Thumbnail.jsx'
import { EditIcon, PlusIcon, TrashIcon } from './Icons.jsx'
import { cleanItem, deleteCatalogItem, saveCatalogItem, slugify, uploadThumbnail, videoDuration } from '../admin.js'
import { matches } from '../data.js'
import { enqueue, isActive, subscribe } from '../uploads.js'

const EMPTY = { id: '', title: '', year: '', genres: '', duration: '', description: '', movie: '', added: '', published: true }

const toForm = (m) => ({
  ...EMPTY, ...m, year: String(m.year ?? ''), genres: (m.genres || []).join(', '), movie: m.movie || '', published: m.published !== false,
})

const sizeText = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${Math.max(1, Math.round(b / 1024 ** 2))} MB`)

// Видеоны төлөв: хуулж байгаа бол явц, үгүй бол R2-д байгаа эсэх.
function VideoPill({ item, job }) {
  if (job && isActive(job)) {
    const pct = job.total ? Math.floor((job.loaded / job.total) * 100) : 0
    return <span className="pill">{job.status === 'queued' ? 'Дараалалд' : `Хуулж байна ${pct}%`}</span>
  }
  if (job?.status === 'error') return <span className="pill bad">Хуулалт тасарсан</span>
  if (item.videoReady) return <span className="pill ok">Видео · {item.videoSize ? sizeText(item.videoSize) : 'бэлэн'}</span>
  return <span className="pill bad">Видео алга</span>
}

// Кино эсвэл Shorts-ийг тус бүрээр нэмэх, засах, устгах. Видеог хадгалмагц арын дараалалд хуулна:
// дараагийн киногоо шууд нэмж болно.
export default function AdminCatalog({ kind, list, movies, onCatalog }) {
  const isShorts = kind === 'shorts'
  const [form, setForm] = useState(null)
  const [message, setMessage] = useState(null)
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [jobs, setJobs] = useState([])

  useEffect(() => subscribe(setJobs), [])

  // Хуулалт дуусмагц жагсаалтыг дахин уншина (видео бэлэн, нийтлэгдсэн эсэх).
  const doneCount = jobs.filter((j) => j.status === 'done').length
  useEffect(() => {
    if (doneCount) onCatalog()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [doneCount])

  const open = (next) => {
    setForm(next)
    setMessage(null)
    window.scrollTo(0, 0)
  }

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const onTitle = (title) => set({ title, ...(form.originalId || form.idEdited ? {} : { id: slugify(title) }) })

  const onVideo = async (file) => {
    set({ videoFile: file || null })
    if (!file) return
    const duration = await videoDuration(file)
    if (duration) setForm((f) => (f.videoFile === file ? { ...f, duration } : f))
  }

  const submit = async (e) => {
    e.preventDefault()
    setMessage(null)
    setBusy(true)
    try {
      const item = cleanItem(kind, form, list, form.originalId)
      const old = list.find((m) => m.id === form.originalId)
      item.thumbnail = old?.thumbKey || null
      if (form.thumbFile) item.thumbnail = await uploadThumbnail(item.kind, item.id, form.thumbFile)
      // Шинэ видеотой бол хуулж дуусахад сервер нийтэлнэ; түүнээс өмнө хэрэглэгчдэд харагдахгүй.
      const publishAfterUpload = Boolean(form.videoFile && item.published)
      if (form.videoFile) item.published = false
      await saveCatalogItem(item)
      if (form.videoFile) enqueue({ id: item.id, kind: item.kind, title: item.title, file: form.videoFile, publish: publishAfterUpload })
      onCatalog()
      setForm(null)
      setMessage({
        ok: true,
        text: form.videoFile
          ? `"${item.title}" хадгалагдлаа. Видео хуулагдаж байна, дуусахад Telegram группт мэдэгдэнэ. Дараагийн бичлэгээ нэмж болно.`
          : `"${item.title}" хадгалагдлаа`,
      })
    } catch (err) {
      setMessage({ ok: false, text: err.message })
    } finally {
      setBusy(false)
    }
  }

  const remove = async (m) => {
    if (!confirm(`"${m.title}"-г видео, зурагтай нь бүр мөсөн устгах уу?`)) return
    try {
      await deleteCatalogItem(isShorts ? 'short' : 'movie', m.id)
      onCatalog()
      setMessage({ ok: true, text: `"${m.title}" устгагдлаа` })
    } catch (err) {
      setMessage({ ok: false, text: err.message })
    }
  }

  const field = (key, label, props = {}) => (
    <label className="field">
      <span>{label}</span>
      <input value={form[key]} onChange={(e) => set({ [key]: e.target.value })} {...props} />
    </label>
  )

  const visible = list.filter((m) => matches(m, query))
  const jobOf = (id) => jobs.find((j) => j.id === id)

  return (
    <div className="admin-body">
      <div className="admin-toolbar">
        <input className="admin-search" type="search" placeholder={isShorts ? 'Shorts хайх' : 'Кино хайх'} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn-primary" onClick={() => open({ ...EMPTY })}>
          <PlusIcon width="20" height="20" /> {isShorts ? 'Shorts нэмэх' : 'Кино нэмэх'}
        </button>
      </div>

      {message && <p className={`toast ${message.ok ? 'ok' : 'bad'}`}>{message.text}</p>}

      {form && (
        <form className="panel admin-form" onSubmit={submit}>
          <h2>{form.originalId ? `Засах · ${form.originalId}` : isShorts ? 'Шинэ Shorts' : 'Шинэ кино'}</h2>
          <div className="form-grid">
            <label className="field">
              <span>Нэр</span>
              <input value={form.title} onChange={(e) => onTitle(e.target.value)} required autoFocus />
            </label>
            {!form.originalId && field('id', 'ID (хаягт харагдана)', {
              required: true, placeholder: 'the-general', autoCapitalize: 'off', spellCheck: false,
              onChange: (e) => set({ id: e.target.value, idEdited: true }),
            })}
            {!isShorts && field('year', 'Он', { inputMode: 'numeric', placeholder: '1926' })}
            {field('duration', isShorts ? 'Урт (≤ 20:00)' : 'Урт', { placeholder: isShorts ? '3:40' : '1:18:00' })}
            {!isShorts && field('genres', 'Төрөл (таслалаар)', { placeholder: 'Инээдмийн, Адал явдалт' })}
            {isShorts && (
              <label className="field">
                <span>Бүтэн кино</span>
                <select value={form.movie} onChange={(e) => set({ movie: e.target.value })}>
                  <option value="">Холбоогүй</option>
                  {movies.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
                </select>
              </label>
            )}
            {field('added', 'Нэмсэн огноо', { type: 'date' })}
          </div>
          <label className="field">
            <span>Тайлбар</span>
            <textarea rows="3" value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </label>
          <div className="form-grid">
            <label className="field">
              <span>Видео (MP4){form.originalId && list.find((m) => m.id === form.originalId)?.videoReady ? ' · солих бол сонгоно' : ''}</span>
              <input type="file" accept="video/mp4,video/webm" onChange={(e) => onVideo(e.target.files[0])} />
              {form.videoFile && <small className="muted">{form.videoFile.name} · {sizeText(form.videoFile.size)}</small>}
            </label>
            <label className="field">
              <span>Зураг {isShorts ? '(9:16)' : '(16:9)'}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => set({ thumbFile: e.target.files[0] || null })} />
            </label>
          </div>
          <label className="check">
            <input type="checkbox" checked={form.published} onChange={(e) => set({ published: e.target.checked })} />
            <span>Сайтад нийтлэх{form.videoFile ? ' (видео хуулж дуусмагц)' : ''}</span>
          </label>
          <div className="admin-actions">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Хадгалж байна…' : 'Хадгалах'}</button>
            <button className="btn-secondary" type="button" onClick={() => setForm(null)}>Болих</button>
          </div>
        </form>
      )}

      <p className="muted">{visible.length} бичлэг · {visible.filter((m) => m.published === false).length} ноорог</p>
      <ul className="list">
        {visible.map((m) => (
          <li key={m.id} className="admin-row">
            <Thumbnail movie={m} small />
            <div className="admin-row-text">
              <b>{m.title}</b>
              <p className="muted">
                {isShorts
                  ? `${m.movie ? `→ ${movies.find((x) => x.id === m.movie)?.title || m.movie}` : 'Холбоогүй'}`
                  : [m.year && `${m.year} он`, (m.genres || []).join(', ')].filter(Boolean).join(' · ')}
              </p>
              <p className="admin-pills">
                {m.published === false ? <span className="pill">Ноорог</span> : <span className="pill ok">Нийтлэгдсэн</span>}
                <VideoPill item={m} job={jobOf(m.id)} />
              </p>
            </div>
            <div className="admin-row-actions">
              <button className="icon-btn" aria-label="Засах" title="Засах" onClick={() => open({ ...toForm(m), originalId: m.id })}>
                <EditIcon width="20" height="20" />
              </button>
              <button className="icon-btn" aria-label="Устгах" title="Устгах" disabled={isActive(jobOf(m.id) || {})} onClick={() => remove(m)}>
                <TrashIcon width="20" height="20" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
