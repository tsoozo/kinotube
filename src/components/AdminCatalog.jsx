import { useEffect, useState } from 'react'
import Thumbnail from './Thumbnail.jsx'
import CoverPicker from './CoverPicker.jsx'
import { AutoIcon, EditIcon, PlusIcon, ShareIcon, TrashIcon } from './Icons.jsx'
import AdminEpisodes from './AdminEpisodes.jsx'
import { cleanItem, deleteCatalogItem, saveCatalogItem, slugify, uploadOgCard, uploadThumbnail, videoDuration, videoSource } from '../admin.js'
import { bestFrame } from '../frames.js'
import { CATEGORIES, FREE_EPISODES, FREE_SECONDS, categoryLabel, episodesOf, matches } from '../data.js'
import { enqueue, isActive, jobKey, subscribe } from '../uploads.js'
import { RENTAL, formatMoney } from '../auth.js'

const EMPTY = { id: '', title: '', year: '', genres: '', categories: [], price: String(RENTAL.price), duration: '', description: '', orientation: 'horizontal', added: '', published: true }

const toForm = (m) => ({
  ...EMPTY, ...m, year: String(m.year ?? ''), genres: (m.genres || []).join(', '), categories: m.categories || [], price: m.price ? String(m.price) : '', orientation: m.orientation || 'horizontal', published: m.published !== false,
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

// Цувралын ангиудын видео: хэд нь бэлэн.
function EpisodesPill({ item, jobs }) {
  const eps = item.episodes || []
  const uploading = jobs.filter((j) => j.id === item.id && j.ep && isActive(j)).length
  if (uploading) return <span className="pill">{uploading} анги хуулж байна</span>
  if (!eps.length) return <span className="pill bad">Анги алга</span>
  const ready = eps.filter((e) => e.videoReady).length
  return <span className={`pill ${ready === eps.length ? 'ok' : 'bad'}`}>Видео {ready}/{eps.length} анги</span>
}

// Кино (нэг ангитай) эсвэл цуврал (олон ангитай)-ыг тус бүрээр нэмэх, засах, устгах. Хэлбэр: хэвтээ эсвэл босоо
// (босоо цуврал = Shorts). Видеог хадгалмагц арын дараалалд хуулна: дараагийн бичлэгээ шууд нэмж болно.
export default function AdminCatalog({ kind, list, onCatalog }) {
  const isSeries = kind === 'series'
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

  // Цувралын шинэ ангиуд хуулж дуусмагц нийтлэх эсэх.
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
      // Нүүр сонгоогүй бол шинэ видеоноос хамгийн тохиромжтой кадрыг нүүр болгоно.
      if (!item.thumbnail && form.videoFile) {
        setMessage({ ok: true, text: 'Видеоноос нүүр зураг авч байна…' })
        item.thumbnail = await autoThumb(item.kind, item.id, form.videoFile, item.orientation)
        setMessage(null)
      }
      if (isSeries) {
        // Бэлэн ангигүй цуврал эхний анги хуулагдмагц нийтлэгдэнэ.
        const ready = (old?.episodes || []).some((e) => e.videoReady)
        const wantsPublish = item.published
        if (!ready) item.published = false
        await saveCatalogItem(item)
        await shareCard(item, form.thumbFile)
        onCatalog()
        // Шинэ цувралын формыг нээлттэй үлдээж ангиудыг нэмүүлнэ.
        setForm({ ...toForm({ ...item, price: item.price_mnt, published: wantsPublish }), originalId: item.id, thumbFile: null })
        setMessage({
          ok: true,
          text: form.originalId
            ? `"${item.title}" хадгалагдлаа`
            : `"${item.title}" цуврал үүслээ. Одоо доороос ангиудаа нэмнэ үү.`,
        })
        return
      }
      // Шинэ видеотой бол хуулж дуусахад сервер нийтэлнэ; түүнээс өмнө хэрэглэгчдэд харагдахгүй.
      const publishAfterUpload = Boolean(form.videoFile && item.published)
      if (form.videoFile) item.published = false
      await saveCatalogItem(item)
      await shareCard(item, form.thumbFile)
      if (form.videoFile) enqueue({ id: item.id, kind: 'movie', title: item.title, file: form.videoFile, publish: publishAfterUpload })
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

  // Хуваалцах карт: бүтэхгүй бол хадгалалтыг саатуулахгүй (дараа "Хуваалцах зураг"-аар дахин үүсгэнэ).
  const shareCard = (item, cover) => uploadOgCard(item, cover).catch((err) => console.warn('og card', item.id, err.message))

  // Видеоноос нүүр зураг гаргаж хуулна. Бүтэхгүй бол null (өнгөт fallback харагдана).
  const autoThumb = async (k, id, src, orientation) => {
    try {
      return await uploadThumbnail(k, id, await bestFrame(src, orientation))
    } catch {
      return null
    }
  }

  // Нүүргүй цувралд анги нэмэхэд эхний видеоноос нүүр тавина (админ гараар сонгосон бол хийхгүй).
  const seriesCover = async (series, file) => {
    if (series.thumbKey || form?.thumbFile) return false
    const thumbnail = await autoThumb('series', series.id, file, series.orientation)
    if (!thumbnail) return false
    const item = { ...cleanItem('series', toForm(series), list, series.id), thumbnail }
    await saveCatalogItem(item)
    await shareCard(item)
    return true
  }

  // Нүүргүй, видео нь байршсан бичлэг бүрт видеоноос хамгийн тохиромжтой кадрыг нүүр болгоно.
  const hasVideo = (m) => (isSeries ? episodesOf(m)[0]?.videoReady : m.videoReady)
  const coverless = list.filter((m) => !m.thumbKey && hasVideo(m))
  const autoCovers = async () => {
    if (!confirm(`Нүүр зураггүй ${coverless.length} бичлэгт видеоноос нь нүүр сонгож тавих уу?`)) return
    setBusy(true)
    let done = 0
    const failed = []
    for (const m of coverless) {
      setMessage({ ok: true, text: `Нүүр сонгож байна ${done + failed.length + 1}/${coverless.length} · ${m.title}` })
      try {
        const thumbnail = await uploadThumbnail(kind, m.id, await bestFrame(await videoSource(kind, m.id), m.orientation))
        const item = { ...cleanItem(kind, toForm(m), list, m.id), thumbnail }
        await saveCatalogItem(item)
        await shareCard(item)
        done++
      } catch (err) {
        failed.push(`${m.title}: ${err.message}`)
      }
    }
    setBusy(false)
    onCatalog()
    setMessage({ ok: !failed.length, text: [`${done} бичлэгт нүүр тавилаа.`, ...failed].join(' ') })
  }

  // Нүүртэй бүх бичлэгт хуваалцах карт (дахин) үүсгэнэ.
  const covered = list.filter((m) => m.thumbKey)
  const shareCards = async () => {
    if (!confirm(`${covered.length} бичлэгт Facebook-т хуваалцах зураг үүсгэх үү?`)) return
    setBusy(true)
    let done = 0
    const failed = []
    for (const m of covered) {
      setMessage({ ok: true, text: `Хуваалцах зураг үүсгэж байна ${done + failed.length + 1}/${covered.length} · ${m.title}` })
      try {
        await uploadOgCard({ ...m, thumbnail: m.thumbKey })
        done++
      } catch (err) {
        failed.push(`${m.title}: ${err.message}`)
      }
    }
    setBusy(false)
    setMessage({ ok: !failed.length, text: [`${done} бичлэгт хуваалцах зураг үүслээ.`, ...failed].join(' ') })
  }

  const remove = async (m) => {
    if (!confirm(`"${m.title}"-г видео, зурагтай нь бүр мөсөн устгах уу?`)) return
    try {
      await deleteCatalogItem(kind, m.id)
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

  const toggleCategory = (id) =>
    set({ categories: form.categories.includes(id) ? form.categories.filter((c) => c !== id) : [...form.categories, id] })

  const visible = list.filter((m) => matches(m, query))
  const jobOf = (id, ep) => jobs.find((j) => j.key === jobKey(id, ep))
  const editing = form?.originalId ? list.find((m) => m.id === form.originalId) : null
  const noun = isSeries ? 'цуврал' : 'кино'

  return (
    <div className="admin-body">
      <div className="admin-toolbar">
        <input className="admin-search" type="search" placeholder={isSeries ? 'Цуврал хайх' : 'Кино хайх'} value={query} onChange={(e) => setQuery(e.target.value)} />
        <button className="btn-primary" onClick={() => open({ ...EMPTY })}>
          <PlusIcon width="20" height="20" /> {isSeries ? 'Цуврал нэмэх' : 'Кино нэмэх'}
        </button>
        {coverless.length > 0 && (
          <button className="btn-secondary" disabled={busy} onClick={autoCovers} title="Видеоноос хамгийн тохиромжтой кадрыг нүүр болгоно">
            <AutoIcon width="20" height="20" /> Нүүр сонгох ({coverless.length})
          </button>
        )}
        {covered.length > 0 && (
          <button className="btn-secondary" disabled={busy} onClick={shareCards} title="Facebook, Messenger-т линк хуваалцахад харагдах зургийг үүсгэнэ">
            <ShareIcon width="20" height="20" /> Хуваалцах зураг
          </button>
        )}
      </div>

      <p className="muted small">
        {isSeries
          ? `Олон ангитай кино. Эхний ${FREE_EPISODES} анги үнэгүй, цааш нь төлбөртэй. Босоо бол Shorts-д (хөндлөн гүйлгэж дараагийн анги), хэвтээ нь үзэх хуудсанд.`
          : `Нэг ангитай кино. Эхний ${FREE_SECONDS / 60} минут үнэгүй, цааш нь төлбөртэй. Босоо кино Shorts-д харагдана.`}
      </p>

      {message && <p className={`toast ${message.ok ? 'ok' : 'bad'}`}>{message.text}</p>}

      {form && (
        <form className="panel admin-form" onSubmit={submit}>
          <h2>{form.originalId ? `Засах · ${form.originalId}` : isSeries ? 'Шинэ цуврал' : 'Шинэ кино'}</h2>
          <div className="form-grid">
            <label className="field">
              <span>Нэр</span>
              <input value={form.title} onChange={(e) => onTitle(e.target.value)} required autoFocus />
            </label>
            {!form.originalId && field('id', 'ID (хаягт харагдана)', {
              required: true, placeholder: 'the-general', autoCapitalize: 'off', spellCheck: false,
              onChange: (e) => set({ id: e.target.value, idEdited: true }),
            })}
            <label className="field">
              <span>Хэлбэр</span>
              <select value={form.orientation} onChange={(e) => set({ orientation: e.target.value })}>
                <option value="horizontal">Хэвтээ (16:9)</option>
                <option value="vertical">Босоо (9:16) · Shorts</option>
              </select>
            </label>
            {field('price', `Үнэ, ₮ · ${noun} бүтнээр ${RENTAL.days} хоног үзэх`, { inputMode: 'numeric', placeholder: String(RENTAL.price), required: true })}
            {field('year', 'Он', { inputMode: 'numeric', placeholder: '2026' })}
            {!isSeries && field('duration', 'Урт', { placeholder: '1:18:00' })}
            {field('genres', 'Төрөл (таслалаар)', { placeholder: 'Инээдмийн, Адал явдалт' })}
            {field('added', 'Нэмсэн огноо', { type: 'date' })}
          </div>
          {(
            <fieldset className="field category-picks">
              <span>Ангилал</span>
              <div>
                {CATEGORIES.map((c) => (
                  <label key={c.id} className="check">
                    <input type="checkbox" checked={form.categories.includes(c.id)} onChange={() => toggleCategory(c.id)} />
                    <span>{c.label}</span>
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          <label className="field">
            <span>Тайлбар</span>
            <textarea rows="3" value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </label>
          <div className="form-grid">
            {!isSeries && (
              <label className="field">
                <span>Видео (MP4){editing?.videoReady ? ' · солих бол сонгоно' : ''}</span>
                <input type="file" accept="video/mp4,video/webm" onChange={(e) => onVideo(e.target.files[0])} />
                {form.videoFile && <small className="muted">{form.videoFile.name} · {sizeText(form.videoFile.size)}</small>}
              </label>
            )}
            <label className="field">
              <span>Нүүр зураг {form.orientation === 'vertical' ? '(9:16)' : '(16:9)'}</span>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => set({ thumbFile: e.target.files[0] || null })} />
            </label>
          </div>
          <CoverPicker
            kind={kind}
            id={form.originalId}
            orientation={form.orientation}
            file={form.videoFile}
            hasVideo={Boolean(editing && hasVideo(editing))}
            auto={!form.thumbFile && !editing?.thumbKey}
            value={form.thumbFile}
            onPick={(thumbFile) => set({ thumbFile })}
          />
          <label className="check">
            <input type="checkbox" checked={form.published} onChange={(e) => set({ published: e.target.checked })} />
            <span>
              Сайтад нийтлэх
              {form.videoFile ? ' (видео хуулж дуусмагц)' : isSeries && !(editing?.episodes || []).some((e) => e.videoReady) ? ' (эхний анги хуулагдмагц)' : ''}
            </span>
          </label>
          <div className="admin-actions">
            <button className="btn-primary" type="submit" disabled={busy}>{busy ? 'Хадгалж байна…' : 'Хадгалах'}</button>
            <button className="btn-secondary" type="button" onClick={() => setForm(null)}>{isSeries && form.originalId ? 'Хаах' : 'Болих'}</button>
          </div>
          {isSeries && editing && (
            <AdminEpisodes series={editing} jobs={jobs} publish={form.published} onChange={onCatalog} onMessage={setMessage} onCover={seriesCover} />
          )}
          {isSeries && !editing && <p className="muted small">Цувралаа хадгалсны дараа ангиудаа нэмнэ.</p>}
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
                {[
                  m.orientation === 'vertical' ? 'Босоо · Shorts' : 'Хэвтээ',
                  isSeries && `${(m.episodes || []).length} анги`,
                  m.year && `${m.year} он`, `${formatMoney(m.price || RENTAL.price)} / ${RENTAL.days} хоног`, (m.categories || []).map(categoryLabel).join(', '), (m.genres || []).join(', '),
                ].filter(Boolean).join(' · ')}
              </p>
              <p className="admin-pills">
                {m.published === false ? <span className="pill">Ноорог</span> : <span className="pill ok">Нийтлэгдсэн</span>}
                {isSeries ? <EpisodesPill item={m} jobs={jobs} /> : <VideoPill item={m} job={jobOf(m.id)} />}
              </p>
            </div>
            <div className="admin-row-actions">
              <button className="icon-btn" aria-label="Засах" title="Засах" onClick={() => open({ ...toForm(m), price: String(m.price || RENTAL.price), originalId: m.id })}>
                <EditIcon width="20" height="20" />
              </button>
              <button className="icon-btn" aria-label="Устгах" title="Устгах" disabled={jobs.some((j) => j.id === m.id && isActive(j))} onClick={() => remove(m)}>
                <TrashIcon width="20" height="20" />
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}
