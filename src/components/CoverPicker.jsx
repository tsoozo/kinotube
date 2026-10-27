import { useEffect, useRef, useState } from 'react'
import { FramesIcon } from './Icons.jsx'
import { videoSource } from '../admin.js'
import { releaseFrames, videoFrames } from '../frames.js'

const clock = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`

// Видеоноос нүүр зураг сонгох: кадрууд гаргаж, хамгийн тохиромжтойг автоматаар сонгоно, админ өөр кадр сонгож болно.
// file: шинээр сонгосон видео (байхгүй бол R2 дээрх видео), auto: видео сонгомогц өөрөө гаргана.
export default function CoverPicker({ kind, id, file, hasVideo, auto, value, onPick }) {
  const [frames, setFrames] = useState([])
  const [best, setBest] = useState(-1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = useRef(0)

  // Хуучин кадруудын зургийг санах ойгоос чөлөөлнө.
  useEffect(() => () => releaseFrames(frames), [frames])

  const extract = async (pick, shuffle = false) => {
    const n = ++run.current
    setBusy(true)
    setError('')
    try {
      const src = file || (await videoSource(kind, id))
      const res = await videoFrames(src, kind, 6, shuffle)
      if (n !== run.current) return releaseFrames(res.frames)
      setFrames(res.frames)
      setBest(res.best)
      if (pick) onPick(res.frames[res.best].file)
    } catch (err) {
      if (n === run.current) setError(err.message)
    } finally {
      if (n === run.current) setBusy(false)
    }
  }

  // Шинэ видео сонгоход өмнөх кадрууд хамааралгүй болно.
  useEffect(() => {
    setFrames([])
    setBest(-1)
    setError('')
    run.current++
    setBusy(false)
    if (file && auto) extract(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file])

  if (!file && !hasVideo) return null

  return (
    <div className="field cover-picker">
      <span>Видеоноос нүүр сонгох</span>
      {!frames.length && (
        <button className="btn-secondary" type="button" disabled={busy} onClick={() => extract(true)}>
          <FramesIcon width="20" height="20" /> {busy ? 'Кадр гаргаж байна…' : 'Кадрууд гаргах'}
        </button>
      )}
      {error && <p className="toast bad">{error}</p>}
      {frames.length > 0 && (
        <>
          <div className={`cover-frames ${kind === 'short' ? 'tall' : ''}`}>
            {frames.map((f, i) => (
              <button
                key={f.url}
                type="button"
                className={`cover-frame ${value === f.file ? 'on' : ''}`}
                aria-pressed={value === f.file}
                onClick={() => onPick(value === f.file ? null : f.file)}
              >
                <img src={f.url} alt="" />
                <span>{i === best ? `Санал · ${clock(f.time)}` : clock(f.time)}</span>
              </button>
            ))}
          </div>
          <small className="muted">
            {frames.some((f) => f.file === value) ? 'Сонгосон кадр нүүр болно. Дахин дарвал болино.' : 'Нүүр болгох кадраа сонгоно уу.'}
            {' '}
            <button className="link-btn" type="button" disabled={busy} onClick={() => extract(false, true)}>Өөр кадрууд</button>
          </small>
        </>
      )}
    </div>
  )
}
