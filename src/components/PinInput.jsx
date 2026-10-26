import { useRef } from 'react'

// Кодын нүднүүд (имэйлээр ирэх 6 оронтой код). Тоо бичихэд дараагийн нүд рүү шилжинэ.
export default function PinInput({ id, value, onChange, length = 4, autoFocus, visible }) {
  const refs = useRef([])
  const digits = Array.from({ length }, (_, i) => value[i] || '')

  const set = (i, ch) => {
    const next = digits.slice()
    next[i] = ch
    onChange(next.join('').slice(0, length))
  }

  const onInput = (i, e) => {
    const v = e.target.value.replace(/\D/g, '')
    if (!v) return set(i, '')
    if (v.length > 1) {
      onChange(v.slice(0, length))
      refs.current[Math.min(v.length, length) - 1]?.focus()
      return
    }
    set(i, v)
    refs.current[i + 1]?.focus()
  }

  const onKey = (i, e) => {
    if (e.key === 'Backspace' && !digits[i] && i > 0) {
      set(i - 1, '')
      refs.current[i - 1]?.focus()
    }
  }

  return (
    <div className="pin" role="group">
      {digits.map((d, i) => (
        <input
          key={i}
          id={`${id}-${i}`}
          ref={(el) => (refs.current[i] = el)}
          type={visible ? 'text' : 'password'}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={length}
          value={d}
          autoFocus={autoFocus && i === 0}
          aria-label={`${i + 1}-р орон`}
          onChange={(e) => onInput(i, e)}
          onKeyDown={(e) => onKey(i, e)}
        />
      ))}
    </div>
  )
}
