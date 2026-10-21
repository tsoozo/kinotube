import { useEffect, useMemo, useState } from 'react'
import Header from './components/Header.jsx'
import Sidebar from './components/Sidebar.jsx'
import Home from './components/Home.jsx'
import Watch from './components/Watch.jsx'
import Login from './components/Login.jsx'
import Profile from './components/Profile.jsx'
import Legal from './components/Legal.jsx'
import { allGenres, loadMovies, matches } from './data.js'
import { currentUser, getHistory, logout } from './auth.js'

// Хаяг: #watch-<id>, #history, #profile, #login, #register, #forgot, #terms, #privacy, бусад үед нүүр.
function readRoute() {
  const hash = decodeURIComponent(location.hash.slice(1))
  if (hash.startsWith('watch-')) return { page: 'watch', id: hash.slice(6) }
  if (['history', 'profile', 'login', 'register', 'forgot', 'terms', 'privacy'].includes(hash)) return { page: hash }
  return { page: 'home' }
}

export default function App() {
  const [movies, setMovies] = useState([])
  const [error, setError] = useState('')
  const [route, setRoute] = useState(readRoute)
  const [query, setQuery] = useState('')
  const [genre, setGenre] = useState('Бүгд')
  const [user, setUser] = useState(currentUser)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 1100)

  useEffect(() => {
    loadMovies().then(setMovies).catch((e) => setError(e.message))
  }, [])

  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Үзэх, профайл, нэвтрэх хуудас руу ороход хажуугийн цэсийг хаана.
  useEffect(() => {
    if (!['home', 'history'].includes(route.page) || window.innerWidth <= 1100) setSidebarOpen(false)
  }, [route])

  // Нэвтрээгүй бол профайл руу орох үед нэвтрэх хуудас руу шилжүүлнэ.
  useEffect(() => {
    if (route.page === 'profile' && !user) location.hash = 'login'
  }, [route, user])

  const genres = useMemo(() => allGenres(movies), [movies])

  const visible = useMemo(() => {
    let list = movies
    if (route.page === 'history') {
      list = getHistory(user).map((h) => movies.find((m) => m.id === h.id)).filter(Boolean)
    }
    return list.filter((m) => matches(m, query) && (genre === 'Бүгд' || (m.genres || []).includes(genre)))
  }, [movies, query, genre, route, user])

  const go = (hash) => {
    if (location.hash === hash || (hash === '' && !location.hash)) window.dispatchEvent(new HashChangeEvent('hashchange'))
    else location.hash = hash
  }

  const onSearch = (q) => {
    setQuery(q)
    if (!['home', 'history'].includes(route.page)) go('')
  }

  const onLogin = (u) => {
    setUser(u)
    go('#profile')
  }

  const onLogout = () => {
    logout()
    setUser(null)
    go('')
  }

  const page = route.page
  const isWatch = page === 'watch'
  const isAuth = ['login', 'register', 'forgot'].includes(page)
  const current = isWatch ? movies.find((m) => m.id === route.id) : null

  let content
  if (error) content = <p className="notice">{error}</p>
  else if (isAuth) content = <Login mode={page} onDone={onLogin} onNavigate={go} />
  else if (page === 'terms' || page === 'privacy') content = <Legal page={page} />
  else if (page === 'profile') content = user && <Profile user={user} movies={movies} onUser={setUser} onLogout={onLogout} />
  else if (isWatch && current) content = <Watch movie={current} movies={movies} user={user} onUser={setUser} />
  else if (isWatch && movies.length > 0) content = <p className="notice">Энэ кино олдсонгүй.</p>
  else if (!isWatch)
    content = (
      <Home
        movies={visible}
        genres={genres}
        genre={genre}
        onGenre={setGenre}
        query={query}
        onClearSearch={() => setQuery('')}
        title={page === 'history' ? 'Сүүлд үзсэн' : null}
        loading={movies.length === 0}
      />
    )

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''} ${isWatch || isAuth || ['profile', 'terms', 'privacy'].includes(page) ? 'is-focus' : ''}`}>
      <Header
        query={query}
        user={user}
        onSearch={onSearch}
        onMenu={() => setSidebarOpen((v) => !v)}
        onHome={() => { setQuery(''); setGenre('Бүгд'); go('') }}
        onNavigate={go}
      />
      <Sidebar
        open={sidebarOpen}
        page={page}
        user={user}
        genres={genres}
        genre={genre}
        onGenre={(g) => { setGenre(g); go('') }}
        onNavigate={go}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="main">{content}</main>
    </div>
  )
}
