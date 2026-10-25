import { useEffect, useRef, useState } from 'react'
import { NextIcon, PrevIcon } from './Icons.jsx'

// Хэвтээ гүйдэг мөр. Компьютер дээр (хулгана) хоёр талд нь сум гарна.
export default function ShelfRow({ children }) {
  const ref = useRef(null)
  const [edge, setEdge] = useState({ start: true, end: true })

  const update = () => {
    const el = ref.current
    if (!el) return
    setEdge({ start: el.scrollLeft <= 4, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 4 })
  }

  useEffect(() => {
    update()
    const ro = new ResizeObserver(update)
    ro.observe(ref.current)
    return () => ro.disconnect()
  }, [children])

  const scroll = (dir) => {
    const el = ref.current
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: 'smooth' })
  }

  return (
    <div className="shelf">
      <div className="shelf-row" ref={ref} onScroll={update}>{children}</div>
      {!edge.start && (
        <button className="icon-btn shelf-arrow prev" onClick={() => scroll(-1)} aria-label="Өмнөх">
          <PrevIcon />
        </button>
      )}
      {!edge.end && (
        <button className="icon-btn shelf-arrow next" onClick={() => scroll(1)} aria-label="Дараах">
          <NextIcon />
        </button>
      )}
    </div>
  )
}
