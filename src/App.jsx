import { useEffect, useMemo, useState } from 'react'
import Header from './components/Header.jsx'
import BottomNav from './components/BottomNav.jsx'
import Home from './components/Home.jsx'
import Watch from './components/Watch.jsx'
import Login from './components/Login.jsx'
import Profile from './components/Profile.jsx'
import Shorts from './components/Shorts.jsx'
import History from './components/History.jsx'
import Admin from './components/Admin.jsx'
import Later from './components/Later.jsx'
import { allGenres, loadMovies, loadShorts, matches } from './data.js'
import { canWatchMovie, currentUser, getHistory, isAdmin, logout, peekReturnTo, takeReturnTo, watchedRatio } from './auth.js'

// Хаяг: #watch-<id>, #shorts, #shorts-<id>, #history, #later, #profile, #admin, #admin-<таб>, #login, #register, #forgot, бусад үед нүүр.
function readRoute() {
  const hash = decodeURIComponent(location.hash.slice(1))
  if (hash.startsWith('watch-')) return { page: 'watch', id: hash.slice(6) }
  if (hash === 'shorts' || hash.startsWith('shorts-')) return { page: 'shorts', id: hash.slice(7) }
  if (hash === 'admin' || hash.startsWith('admin-')) return { page: 'admin', id: hash.slice(6) }
  if (['history', 'later', 'profile', 'login', 'register', 'forgot'].includes(hash)) return { page: hash }
  return { page: 'home' }
}

export default function App() {
  const [movies, setMovies] = useState([])
  const [shorts, setShorts] = useState(null)
  const [error, setError] = useState('')
  const [route, setRoute] = useState(readRoute)
  const [query, setQuery] = useState('')
  const [genre, setGenre] = useState('Бүгд')
  const [user, setUser] = useState(currentUser)
  const [headerHidden, setHeaderHidden] = useState(false)

  useEffect(() => {
    loadMovies().then(setMovies).catch((e) => setError(e.message))
    loadShorts().then(setShorts).catch(() => setShorts([]))
  }, [])

  useEffect(() => {
    const onHash = () => {
      setRoute(readRoute())
      // Үзэх хуудсан дээр хадгалсан байрлалыг дахин уншина.
      setUser(currentUser())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // Доош гүйлгэхэд дээд хэсгийг нууж, дээш гүйлгэхэд буцааж гаргана (Shorts-ийн жагсаалт ч мөн).
  useEffect(() => {
    const last = new WeakMap()
    const onScroll = (e) => {
      const el = e.target === document ? document.documentElement : e.target
      if (!(el instanceof Element)) return
      const y = el === document.documentElement ? window.scrollY : el.scrollTop
      const prev = last.get(el) ?? 0
      last.set(el, y)
      if (y < 56) setHeaderHidden(false)
      else if (y - prev > 6) setHeaderHidden(true)
      else if (prev - y > 6) setHeaderHidden(false)
    }
    document.addEventListener('scroll', onScroll, { capture: true, passive: true })
    return () => document.removeEventListener('scroll', onScroll, { capture: true })
  }, [])

  useEffect(() => setHeaderHidden(false), [route])

  // Нэвтрээгүй бол профайл руу орох үед нэвтрэх хуудас руу шилжүүлнэ.
  useEffect(() => {
    if ((route.page === 'profile' || route.page === 'admin') && !user) location.hash = 'login'
  }, [route, user])

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
  }, [user])

  // Нүүрний "Үргэлжлүүлэн үзэх": дуусгаагүй, сүүлд үзсэн нь эхэндээ.
  const continueItems = useMemo(
    () =>
      getHistory(user)
        .filter((h) => !h.done && h.pos > 0)
        .map((h) => ({ movie: movies.find((m) => m.id === h.id), progress: watchedRatio(h) }))
        .filter((x) => x.movie)
        .slice(0, 12),
    [user, movies],
  )

  const go = (hash) => {
    if (location.hash === hash || (hash === '' && !location.hash)) window.dispatchEvent(new HashChangeEvent('hashchange'))
    else location.hash = hash
  }

  const onSearch = (q) => {
    setQuery(q)
    if (route.page !== 'home') go('')
  }

  // Кино үзэх гэж байгаад нэвтэрсэн бол тэр кино руу, үгүй бол Shorts руу.
  const onLogin = (u) => {
    setUser(u)
    const id = canWatchMovie(u, peekReturnTo()) ? takeReturnTo() : peekReturnTo()
    go(id ? `#watch-${encodeURIComponent(id)}` : isAdmin(u) ? '#admin' : '#shorts')
  }

  // Профайл дээр эрх авмагц хүлээж байсан кино руу шилжинэ.
  useEffect(() => {
    if (route.page !== 'profile' || !canWatchMovie(user, peekReturnTo())) return
    const id = takeReturnTo()
    if (id) location.hash = `watch-${encodeURIComponent(id)}`
  }, [route, user])

  const goHome = () => {
    setQuery('')
    setGenre('Бүгд')
    go('')
  }

  // Админ жагсаалт засахад бүх хуудсанд шууд харагдана. null бол json файлаас дахин уншина.
  const onCatalog = (kind, list) => {
    if (kind === 'movies') (list ? Promise.resolve(list) : loadMovies()).then(setMovies)
    else (list ? Promise.resolve(list) : loadShorts()).then(setShorts)
  }

  // Эхлээд нүүр рүү шилжинэ, эс бөгөөс профайлын хамгаалалт нэвтрэх хуудас руу аваачна.
  const onLogout = () => {
    logout()
    location.hash = ''
    setRoute({ page: 'home' })
    setUser(null)
  }

  const page = route.page
  const isWatch = page === 'watch'
  const isAuth = ['login', 'register', 'forgot'].includes(page)
  const current = isWatch ? movies.find((m) => m.id === route.id) : null

  let content
  if (error) content = <p className="notice">{error}</p>
  else if (isAuth) content = <Login mode={page} onDone={onLogin} onNavigate={go} />
  else if (page === 'profile') content = user && <Profile user={user} movies={movies} onUser={setUser} onLogout={onLogout} />
  else if (isWatch && current) content = <Watch movie={current} movies={movies} user={user} onUser={setUser} />
  else if (page === 'shorts') content = <Shorts shorts={shorts || []} movies={movies} startId={route.id} loading={!shorts} />
  else if (isWatch && movies.length > 0) content = <p className="notice">Энэ кино олдсонгүй.</p>
  else if (page === 'admin') content = user && <Admin tab={route.id} user={user} movies={movies} shorts={shorts || []} onCatalog={onCatalog} onUser={setUser} />
  else if (page === 'history') content = <History movies={movies} user={user} onUser={setUser} />
  else if (page === 'later') content = <Later movies={movies} user={user} onUser={setUser} />
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
        continueItems={page === 'home' && genre === 'Бүгд' && !query.trim() ? continueItems : []}
      />
    )

  return (
    <div className={`app ${isWatch || isAuth || page === 'profile' || page === 'admin' ? 'is-focus' : ''} ${page === 'shorts' ? 'is-shorts' : ''} ${headerHidden ? 'header-hidden' : ''}`}>
      <Header
        query={query}
        user={user}
        onSearch={onSearch}
        onHome={goHome}
        onNavigate={go}
      />
      <main className="main">{content}</main>
      <BottomNav page={page} user={user} onHome={goHome} onNavigate={go} />
    </div>
  )
}
