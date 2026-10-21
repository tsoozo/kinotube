import { useEffect, useRef, useState } from 'react'
import { BackIcon, CloseIcon, MenuIcon, SearchIcon, UserIcon } from './Icons.jsx'
import Logo from './Logo.jsx'

export default function Header({ query, user, onSearch, onMenu, onHome, onNavigate }) {
  const [text, setText] = useState(query)
  const [mobileSearch, setMobileSearch] = useState(false)
  const inputRef = useRef(null)
  useEffect(() => setText(query), [query])

  const submit = (e) => {
    e.preventDefault()
    onSearch(text)
    inputRef.current?.blur()
  }

  const openMobileSearch = () => {
    setMobileSearch(true)
    setTimeout(() => inputRef.current?.focus(), 0)
  }

  return (
    <header className={`header ${mobileSearch ? 'searching' : ''}`}>
      <div className="header-left">
        <button className="icon-btn" onClick={onMenu} aria-label="Цэс">
          <MenuIcon />
        </button>
        <Logo onClick={(e) => { e.preventDefault(); onHome() }} />
      </div>
      <form className="search" onSubmit={submit} role="search">
        <button type="button" className="icon-btn search-back" onClick={() => setMobileSearch(false)} aria-label="Буцах">
          <BackIcon />
        </button>
        <div className="search-box">
          <input
            id="search"
            ref={inputRef}
            type="text"
            enterKeyHint="search"
            placeholder="Кино, төрөл, он хайх"
            value={text}
            onChange={(e) => { setText(e.target.value); onSearch(e.target.value) }}
          />
          {text && (
            <button type="button" className="search-clear" onClick={() => { setText(''); onSearch(''); inputRef.current?.focus() }} aria-label="Арилгах">
              <CloseIcon width="20" height="20" />
            </button>
          )}
        </div>
        <button type="submit" className="search-submit" aria-label="Хайх">
          <SearchIcon />
        </button>
      </form>
      <div className="header-right">
        <button className="icon-btn search-open" onClick={openMobileSearch} aria-label="Хайх">
          <SearchIcon />
        </button>
        {user ? (
          <button className="avatar-btn" onClick={() => onNavigate('#profile')} aria-label="Профайл" title={user.name}>
            {user.name.slice(0, 1)}
          </button>
        ) : (
          <button className="signin-btn" onClick={() => onNavigate('#login')}>
            <UserIcon width="22" height="22" />
            <span>Нэвтрэх</span>
          </button>
        )}
      </div>
    </header>
  )
}
