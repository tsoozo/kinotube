import { useState } from 'react'
import { PlusIcon, TrashIcon } from './Icons.jsx'
import { deleteEpisode, saveEpisode, videoDuration } from '../admin.js'
import { episodesOf, freeLabel, freeLimit } from '../data.js'
import { enqueue, isActive, jobKey } from '../uploads.js'

const sizeText = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(2)} GB` : `${Math.max(1, Math.round(b / 1024 ** 2))} MB`)

// Файлын нэрийн тоогоор эрэмбэлнэ ("анги 2" < "анги 10").
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

function EpisodePill({ episode, job }) {
  if (job && isActive(job)) {
    const pct = job.total ? Math.floor((job.loaded / job.total) * 100) : 0
    return <span className="pill">{job.status === 'queued' ? 'Дараалалд' : `Хуулж байна ${pct}%`}</span>
  }
  if (job?.status === 'error') return <span className="pill bad">Хуулалт тасарсан</span>
  if (episode.videoReady) return <span className="pill ok">Видео · {episode.videoSize ? sizeText(episode.videoSize) : 'бэлэн'}</span>
  return <span className="pill bad">Видео алга</span>
}

// Цувралын ангиуд: олон видео нэг дор сонгоход дарааллаар нь анги болгож хуулна, анги бүрийн видеог сольж, устгана.
export default function AdminEpisodes({ series, jobs, publish, onChange, onMessage, onCover }) {
  const [busy, setBusy] = useState(false)
  const [drafts, setDrafts] = useState({})
  const episodes = episodesOf(series)
  const jobOf = (n) => jobs.find((j) => j.key === jobKey(series.id, n))

  const run = async (fn) => {
    setBusy(true)
    try {
      await fn()
    } catch (err) {
      onMessage({ ok: false, text: err.message })
    } finally {
      setBusy(false)
      onChange()
    }
  }

  const upload = (n, file) => enqueue({ id: series.id, kind: 'episode', ep: n, title: series.title, file, publish })

  // Олон видео: дараагийн дугааруудаар шинэ анги үүсгэнэ.
  const addFiles = (list) =>
    run(async () => {
      const files = [...list].sort(byName)
      if (!files.length) return
      // Нүүргүй цуврал бол эхний видеоноос нүүр авна (хуулалт эхлэхээс өмнө: нийтлэлтийн төлөвийг дарахгүй).
      if (!series.thumbKey && onCover) onMessage({ ok: true, text: 'Видеоноос нүүр зураг авч байна…' })
      const covered = !series.thumbKey && onCover ? await onCover(series, files[0]) : false
      let n = episodes.reduce((max, e) => Math.max(max, e.number), 0)
      for (const file of files) {
        n++
        await saveEpisode(series.id, { number: n, duration: await videoDuration(file) })
        upload(n, file)
      }
      onMessage({ ok: true, text: `${files.length} анги нэмэгдлээ${covered ? ', нүүр зургийг видеоноос авлаа' : ''}. Видео хуулагдаж байна, дуусахад Telegram группт мэдэгдэнэ.` })
    })

  const replace = (e, file) =>
    run(async () => {
      if (!file) return
      const duration = await videoDuration(file)
      if (duration && duration !== e.duration) await saveEpisode(series.id, { ...e, duration })
      upload(e.number, file)
    })

  const saveTitle = (e) => {
    const title = drafts[e.number]
    if (title === undefined || title === e.title) return
    run(async () => {
      await saveEpisode(series.id, { ...e, title })
      setDrafts((d) => ({ ...d, [e.number]: undefined }))
    })
  }

  const remove = (e) => {
    if (!confirm(`${e.number}-р ангийг видеотой нь устгах уу?`)) return
    run(async () => {
      await deleteEpisode(series.id, e.number)
      onMessage({ ok: true, text: `${e.number}-р анги устгагдлаа` })
    })
  }

  return (
    <section className="admin-episodes">
      <h3>Ангиуд · {episodes.length}</h3>
      <p className="muted small">{freeLabel(series, episodes.length)} хүн бүрт үнэгүй{series.orientation === 'vertical' && episodes.length > 1 ? ' (ангиудын нийт хугацаагаар)' : ''}. Олон видео нэг дор сонговол файлын нэрийн дарааллаар анги болно.</p>
      {episodes.length > 0 && (
        <ul className="list episode-list">
          {episodes.map((e) => {
            const job = jobOf(e.number)
            return (
              <li key={e.number} className="episode-row">
                <b className="episode-no">{e.number}</b>
                <div className="episode-main">
                  <input
                    className="episode-title"
                    placeholder={`${e.number}-р анги (нэр заавал биш)`}
                    value={drafts[e.number] ?? e.title}
                    onChange={(ev) => setDrafts((d) => ({ ...d, [e.number]: ev.target.value }))}
                    onBlur={() => saveTitle(e)}
                    onKeyDown={(ev) => ev.key === 'Enter' && (ev.preventDefault(), ev.currentTarget.blur())}
                  />
                  <p className="admin-pills">
                    <EpisodePill episode={e} job={job} />
                    {e.duration && <span className="muted small">{e.duration}</span>}
                    {episodes.length > 1 && freeLimit(series, episodes, e.number) === Infinity && <span className="pill">Үнэгүй</span>}
                    {episodes.length > 1 && freeLimit(series, episodes, e.number) > 0 && freeLimit(series, episodes, e.number) !== Infinity && <span className="pill">{Math.ceil(freeLimit(series, episodes, e.number) / 60)} мин үнэгүй</span>}
                  </p>
                </div>
                <label className="btn-secondary episode-file">
                  {e.videoReady ? 'Солих' : 'Видео'}
                  <input type="file" accept="video/mp4,video/webm" hidden disabled={busy || isActive(job || {})} onChange={(ev) => replace(e, ev.target.files[0])} />
                </label>
                <button type="button" className="icon-btn" aria-label="Устгах" title="Устгах" disabled={busy || isActive(job || {})} onClick={() => remove(e)}>
                  <TrashIcon width="20" height="20" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <label className={`btn-primary episode-add ${busy ? 'disabled' : ''}`}>
        <PlusIcon width="20" height="20" /> {busy ? 'Нэмж байна…' : 'Анги нэмэх (видео сонгох)'}
        <input type="file" accept="video/mp4,video/webm" multiple hidden disabled={busy} onChange={(ev) => { addFiles(ev.target.files); ev.target.value = '' }} />
      </label>
    </section>
  )
}
