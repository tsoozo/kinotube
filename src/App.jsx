import { useEffect, useMemo, useState } from 'react'
import Header from './components/Header.jsx'
import Sidebar from './components/Sidebar.jsx'
import Home from './components/Home.jsx'
import Watch from './components/Watch.jsx'
import Login from './components/Login.jsx'
import Profile from './components/Profile.jsx'
import Pay from './components/Pay.jsx'
import Shorts from './components/Shorts.jsx'
import History from './components/History.jsx'
import { allGenres, loadMovies, loadShorts, matches } from './data.js'
import { configured, getHistory, loadUser, logout, supabase, watchedRatio } from './auth.js'

// Хаяг: #watch-<id>, #shorts, #shorts-<id>, #pay-<төлбөрийн id>, #history, #profile, #login, бусад үед нүүр.
function readRoute() {
  const hash = decodeURIComponent(location.hash.slice(1))
  if (hash.startsWith('watch-')) return { page: 'watch', id: hash.slice(6) }
  if (hash === 'shorts' || hash.startsWith('shorts-')) return { page: 'shorts', id: hash.slice(7) }
  if (hash.startsWith('pay-')) return { page: 'pay', id: hash.slice(4) }
  if (['register', 'forgot'].includes(hash)) return { page: 'login' }
  if (['history', 'profile', 'login'].includes(hash)) return { page: hash }
  return { page: 'home' }
}

export default function App() {
  const [movies, setMovies] = useState([])
  const [shorts, setShorts] = useState(null)
  const [error, setError] = useState('')
  const [route, setRoute] = useState(readRoute)
  const [query, setQuery] = useState('')
  const [genre, setGenre] = useState('Бүгд')
  const [user, setUser] = useState(null)
  const [authReady, setAuthReady] = useState(!configured)
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth > 1100)

  useEffect(() => {
    loadMovies().then(setMovies).catch((e) => setError(e.message))
    loadShorts().then(setShorts).catch(() => setShorts([]))
  }, [])

  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute())
      // Үзэх хуудсан дээр хадгалсан байрлалыг дахин уншина.
      setUser((u) => (u ? { ...u } : u))
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Үзэх, профайл, нэвтрэх хуудас руу ороход хажуугийн цэсийг хаана.
  useEffect(() => {
    if (!['home', 'history', 'shorts'].includes(route.page) || window.innerWidth <= 1100) setSidebarOpen(false)
  }, [route])

  // Нэвтрэлтийн session-ийг уншиж, нэвтрэх/гарахыг дагана.
  useEffect(() => {
    if (!supabase) return
    loadUser().then(setUser).catch(() => setUser(null)).finally(() => setAuthReady(true))
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') setUser(null)
      // Callback дотроос Supabase-ийг шууд дуудвал түгжрэх тул дараагийн tick-д уншина.
      else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') setTimeout(() => loadUser().then(setUser).catch(() => {}))
    })
    return () => data.subscription.unsubscribe()
  }, [])

  // Нэвтрээгүй бол профайл, төлбөр рүү орох үед нэвтрэх хуудас руу шилжүүлнэ.
  useEffect(() => {
    if (authReady && ['profile', 'pay'].includes(route.page) && !user) location.hash = 'login'
  }, [route, user, authReady])

  const genres = useMemo(() => allGenres(movies), [movies])

  const visible = useMemo(
    () => movies.filter((m) => matches(m, query) && (genre === 'Бүгд' || (m.genres || []).includes(genre))),
    [movies, query, genre],
  )

  // Нүүрний карт дээрх улаан зурвас.
  const progress = useMemo(() => {
    const map = {}
    getHistory(user).forEach((h) => (map[h.id] = watchedRatio(h)))
    return map
  }, [user, route])

  const go = (hash) => {
    if (location.hash === hash || (hash === '' && !location.hash)) window.dispatchEvent(new HashChangeEvent('hashchange'))
    else location.hash = hash
  }

  const onSearch = (q) => {
    setQuery(q)
    if (route.page !== 'home') go('')
  }

  const onLogin = (u) => {
    setUser(u)
    go('#profile')
  }

  const onLogout = async () => {
    await logout()
    setUser(null)
    go('')
  }

  const refreshUser = () => loadUser().then(setUser).catch(() => {})

  const page = route.page
  const isWatch = page === 'watch'
  const isAuth = page === 'login'
  const current = isWatch ? movies.find((m) => m.id === route.id) : null

  let content
  if (error) content = <p className="notice">{error}</p>
  else if (!authReady && ['watch', 'profile', 'pay', 'history'].includes(page)) content = <p className="notice">Ачаалж байна…</p>
  else if (isAuth) content = <Login onDone={onLogin} />
  else if (page === 'profile') content = user && <Profile user={user} movies={movies} onUser={setUser} onLogout={onLogout} onNavigate={go} />
  else if (page === 'pay') content = user && <Pay id={route.id} onPaid={refreshUser} />
  else if (isWatch && current) content = <Watch movie={current} movies={movies} user={user} onUser={setUser} />
  else if (page === 'shorts') content = <Shorts shorts={shorts || []} movies={movies} startId={route.id} loading={!shorts} />
  else if (isWatch && movies.length > 0) content = <p className="notice">Энэ кино олдсонгүй.</p>
  else if (page === 'history') content = <History movies={movies} user={user} onUser={setUser} />
  else if (!isWatch)
    content = (
      <Home
        movies={visible}
        genres={genres}
        genre={genre}
        onGenre={setGenre}
        query={query}
        onClearSearch={() => setQuery('')}
        progressOf={(id) => progress[id]}
        loading={movies.length === 0}
        shorts={page === 'home' && genre === 'Бүгд' && !query.trim() ? shorts || [] : []}
      />
    )

  return (
    <div className={`app ${sidebarOpen ? 'sidebar-open' : ''} ${isWatch || isAuth || page === 'profile' || page === 'pay' ? 'is-focus' : ''} ${page === 'shorts' ? 'is-shorts' : ''}`}>
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
        genre={genre}
        onGenre={(g) => { setGenre(g); go('') }}
        onNavigate={go}
        onClose={() => setSidebarOpen(false)}
      />
      <main className="main">{content}</main>
    </div>
  )
}
