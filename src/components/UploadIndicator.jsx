import { useEffect, useState } from 'react'
import { isActive, subscribe } from '../uploads.js'

// Админ хуудаснаас гарсан үед ч видео хуулж байгааг харуулна.
export default function UploadIndicator() {
  const [jobs, setJobs] = useState([])
  useEffect(() => subscribe(setJobs), [])
  const active = jobs.filter(isActive)
  if (!active.length) return null
  const total = active.reduce((s, j) => s + j.total, 0)
  const loaded = active.reduce((s, j) => s + j.loaded, 0)
  return (
    <a className="upload-indicator" href="#admin-movies" role="status">
      Видео хуулж байна · {active.length} · {total ? Math.floor((loaded / total) * 100) : 0}%
    </a>
  )
}
