import { useCallback, useEffect, useRef, useState } from 'react'
import { api, isAdmin, read, write } from '../auth.js'
import { SEC_BASE, SEC_EMO, VOICES } from '../voiceScript.js'
import { DownloadIcon, MicIcon, PlayArrowIcon, StopIcon, SuccessIcon, UploadIcon } from './Icons.jsx'

// Дубляжийн хоолойн сан: карт бүрийн бичвэрийг утсан дээрээ шууд хурааж (микрофон) эсвэл файлаар оруулна.
const fmt = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
const ACCEPT = 'audio/*,.m4a,.mp3,.wav,.aac,.caf,.ogg,.3gp,.amr'
const extOf = (name) => (/\.([a-z0-9]{2,4})$/i.exec(name || '')?.[1] || '').toLowerCase()

export default function VoiceBank({ user }) {
  const [voice, setVoice] = useState(() => read('kino-hooloi-tab', 'er'))
  const [done, setDone] = useState({})
  const [error, setError] = useState('')
  const [busy, setBusy] = useState('')
  const [rec, setRec] = useState(null)
  const [sec, setSec] = useState(0)
  const mr = useRef(null)
  const audio = useRef(null)
  const v = VOICES.find((x) => x.id === voice) || VOICES[0]
  const kid = v.id === 'huu' || v.id === 'ohin'

  const load = useCallback(() => api('/api/voice', { method: 'POST', body: JSON.stringify({ action: 'list' }) })
    .then(({ items }) => setDone(Object.fromEntries(items.map((it) => [it.key.slice(11).replace(/\.[a-z0-9]+$/, ''), it]))))
    .catch((e) => setError(e.message)), [])
  useEffect(() => { load() }, [load])
  useEffect(() => () => mr.current?.state === 'recording' && mr.current.stop(), [])
  useEffect(() => {
    if (!rec) return
    const t = setInterval(() => setSec((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [rec])

  const pick = (id) => { setVoice(id); write('kino-hooloi-tab', id); window.scrollTo(0, 0) }

  async function upload(card, file) {
    const k = `${v.id}/${card}`
    setError(''); setBusy(k)
    try {
      const type = (file.type || '').split(';')[0]
      const { url } = await api('/api/voice', { method: 'POST', body: JSON.stringify({ action: 'put', voice: v.id, card, type, ext: extOf(file.name), size: file.size }) })
      const res = await fetch(url, { method: 'PUT', body: file, headers: type ? { 'content-type': type } : {} })
      if (!res.ok) throw new Error('Хадгалж чадсангүй. Дахин оролдоно уу.')
      await load()
    } catch (e) {
      setError(`#${card}: ${e.message}`)
    } finally {
      setBusy('')
    }
  }

  async function toggle(card) {
    setError('')
    if (mr.current?.state === 'recording') {
      const same = rec === card
      mr.current.stop()
      if (same) return
    }
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError('Энэ хөтөч дээр дуу хураах боломжгүй. Safari эсвэл Chrome-оор нээнэ үү, эсвэл "Файл оруулах"-ыг ашиглана уу.')
      return
    }
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } })
    } catch {
      setError('Микрофон нээгдсэнгүй. Хөтчийн тохиргооноос энэ сайтад микрофон зөвшөөрнө үү.')
      return
    }
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((x) => MediaRecorder.isTypeSupported?.(x)) || ''
    const r = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
    const chunks = []
    r.ondataavailable = (e) => e.data?.size && chunks.push(e.data)
    r.onstop = () => {
      stream.getTracks().forEach((t) => t.stop())
      setRec(null)
      const mime = (r.mimeType || type || 'audio/mp4').split(';')[0]
      const blob = new Blob(chunks, { type: mime })
      if (blob.size > 1000) upload(card, new File([blob], `${card}.${mime.includes('webm') ? 'webm' : 'm4a'}`, { type: mime }))
    }
    mr.current = r
    r.start(1000)
    setSec(0)
    setRec(card)
  }

  async function link(card) {
    const it = done[`${v.id}/${card}`]
    const { url } = await api('/api/voice', { method: 'POST', body: JSON.stringify({ action: 'get', key: it.key }) })
    return url
  }

  async function play(card) {
    try {
      audio.current?.pause()
      audio.current = new Audio(await link(card))
      await audio.current.play()
    } catch (e) {
      setError(e.message || 'Тоглуулж чадсангүй.')
    }
  }

  const count = (x) => x.cards.filter((_, i) => done[`${x.id}/${i + 1}`]).length
  const n = count(v)
  const section = (i) => (kid ? (i === 0 ? 'Хүүхдийн яриа' : null) : i === 0 ? 'Энгийн яриа' : i === SEC_BASE ? 'Сэтгэл хөдлөл' : i === SEC_EMO ? 'Дүрийн мөр' : null)

  return (
    <div className="voicebank">
      <h1>Хоолойн сан</h1>
      <p className="voicebank-sub">KinoTube дубляжийн 6 хоолой. Нэг удаа хураагаад бүх кинонд ашиглана.</p>
      <div className="voicebank-how">
        <ol>
          <li>Өөрийн хоолойг сонгоно. Нэг хоолойг эхнээс нь дуустал нэг л хүн уншина.</li>
          <li><b>Хураах</b> дараад бичвэрийг кинонд тоглож байгаа юм шиг, шар тэмдэглэлд бичсэн аястай уншина. Дуусмагц <b>Зогсоох</b> дарахад шууд хадгалагдана.</li>
          <li>Утасныхаа диктофоноор (Voice Memos) хураасан бол <b>Файл оруулах</b> дарж .m4a файлаа сонгоно.</li>
        </ol>
        <p>Нам гүм өрөөнд, утсаа амнаасаа 20–30 см зайтай барина. Том хүн 20 орчим минут, хүүхэд 10 орчим минут уншина. Хэдэн өдөр хувааж болно.</p>
      </div>
      <div className="chips voicebank-tabs" role="group" aria-label="Хоолой сонгох">
        {VOICES.map((x) => (
          <button key={x.id} type="button" className={`chip ${x.id === v.id ? 'active' : ''}`} onClick={() => pick(x.id)}>
            {x.name} <small>{count(x)}/{x.cards.length}</small>
          </button>
        ))}
      </div>
      <div className="voicebank-head">
        <h2>{v.name}</h2>
        <p>{v.who}</p>
        <p className="voicebank-progress">{n} / {v.cards.length} карт хураагдсан</p>
        <div className="voicebank-bar"><span style={{ width: `${(100 * n) / v.cards.length}%` }} /></div>
      </div>
      {error && <p className="form-error">{error}</p>}
      {v.cards.map(([mood, text], i) => {
        const card = i + 1
        const k = `${v.id}/${card}`
        const has = done[k]
        const sec2 = section(i)
        return (
          <div key={k}>
            {sec2 && <h3 className="voicebank-sec">{sec2}</h3>}
            <div className={`voicebank-card ${rec === card ? 'recording' : ''}`}>
              <div className="voicebank-meta">
                <b>#{card}</b>
                <span className="voicebank-mood">{mood}</span>
                {has && <span className="voicebank-done"><SuccessIcon width={16} height={16} /> Хураагдсан</span>}
              </div>
              <p className="voicebank-text">{text}</p>
              <div className="voicebank-acts">
                <button type="button" className={rec === card ? 'btn-danger btn-sm' : 'btn-primary btn-sm'} disabled={busy === k} onClick={() => toggle(card)}>
                  {rec === card ? <><StopIcon width={18} height={18} /> Зогсоох {fmt(sec)}</> : busy === k ? 'Хадгалж байна...' : <><MicIcon width={18} height={18} /> {has ? 'Дахин хураах' : 'Хураах'}</>}
                </button>
                <label className="btn-secondary btn-sm voicebank-file">
                  <UploadIcon width={18} height={18} /> Файл оруулах
                  <input type="file" accept={ACCEPT} onChange={(e) => { const f = e.target.files[0]; e.target.value = ''; if (f) upload(card, f) }} />
                </label>
                {has && (
                  <button type="button" className="btn-secondary btn-sm" onClick={() => play(card)}>
                    <PlayArrowIcon width={18} height={18} /> Сонсох
                  </button>
                )}
                {has && isAdmin(user) && (
                  <button type="button" className="btn-secondary btn-sm" onClick={async () => { location.href = await link(card) }}>
                    <DownloadIcon width={18} height={18} /> Татах
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
