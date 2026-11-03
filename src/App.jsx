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
import Checkout from './components/Checkout.jsx'
import UploadIndicator from './components/UploadIndicator.jsx'
import { CATEGORIES, allGenres, inCategory, isPublic, isShortsItem, loadMovies, matches, watchHref } from './data.js'
import {
  canWatchMovie, currentUser, getHistory, isAdmin, loadUser, logout, onAuthChange, peekReturnTo, takeReturnTo, watchedRatio,
} from './auth.js'

// Хаяг: #cat-<ангилал>, #watch-<id>[/<анги>], #pay-rent-<id>, #pay-month[-<id>], #shorts, #shorts-<id>[/<анги>], #history, #later, #profile, #admin, #admin-<таб>, #login, бусад үед нүүр.
// Хуучин #register, #forgot нь #login руу очно. #login-email: хуучин имэйл бүртгэлээр нэвтрэх (холбоосгүй).
// "<id>/<анги>" → { id, ep }
function splitEp(text) {
  const m = /^(.*)\/(\d+)$/.exec(text)
  return m ? { id: m[1], ep: Number(m[2]) } : { id: text, ep: 0 }
}

function readRoute() {
  const hash = decodeURIComponent(location.hash.slice(1))
  if (hash.startsWith('cat-')) return { page: 'home', category: hash.slice(4) }
  if (hash.startsWith('watch-')) return { page: 'watch', ...splitEp(hash.slice(6)) }
  const pay = hash.match(/^pay-(rent|month)(?:-(.+))?$/)
  if (pay) return { page: 'pay', kind: pay[1], id: pay[2] || '' }
  if (hash === 'shorts' || hash.startsWith('shorts-')) return { page: 'shorts', ...splitEp(hash.slice(7)) }
  if (hash === 'admin' || hash.startsWith('admin-')) return { page: 'admin', id: hash.slice(6) }
  if (['history', 'later', 'profile', 'login'].includes(hash)) return { page: hash }
  if (hash === 'register' || hash === 'forgot') return { page: 'login' }
  if (hash === 'login-email') return { page: 'login', legacy: true }
  return { page: 'home' }
}

export default function App() {
  // allMovies: бүх кино, цуврал (админд ноорог ч орно); хэрэглэгчдэд зөвхөн нийтэлсэн нь.
  // movies: нүүрний кино, хэвтээ цуврал; shorts: босоо цуврал (Shorts).
  const [allMovies, setMovies] = useState(null)
  const published = useMemo(() => (allMovies || []).filter(isPublic), [allMovies])
  const movies = useMemo(() => published.filter((m) => !isShortsItem(m)), [published])
  const shorts = useMemo(() => allMovies && published.filter(isShortsItem), [allMovies, published])
  const [error, setError] = useState('')
  const [route, setRoute] = useState(readRoute)
  const [query, setQuery] = useState('')
  const [genre, setGenre] = useState('Бүгд')
  const [user, setUser] = useState(currentUser)
  const [headerHidden, setHeaderHidden] = useState(false)

  // Эрх, нэрийг серверээс шинэчилнэ. Өөр tab-д нэвтэрч/гарсан ч мэдэгдэнэ.
  useEffect(() => {
    loadUser().then(setUser).catch(() => {})
    return onAuthChange(setUser)
  }, [])

  useEffect(() => {
    loadMovies().then(setMovies).catch((e) => {
      setError(e.message)
      setMovies([])
    })
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
    if (['profile', 'admin', 'pay'].includes(route.page) && !user) location.hash = 'login'
  }, [route, user])

  // Ангилал хаягаас (#cat-korean), жанр нь ангиллын дотор шүүнэ.
  const category = CATEGORIES.some((c) => c.id === route.category) ? route.category : ''
  const genres = useMemo(() => allGenres(movies.filter((m) => inCategory(m, category))), [movies, category])

  const visible = useMemo(
    () => movies.filter((m) => inCategory(m, category) && matches(m, query) && (genre === 'Бүгд' || (m.genres || []).includes(genre))),
    [movies, query, genre, category],
  )

  // Хайлт, ангилал эсвэл жанр сонгосон үед зөвхөн тохирох Shorts.
  const visibleShorts = useMemo(
    () => (shorts || []).filter((s) => inCategory(s, category) && matches(s, query) && (genre === 'Бүгд' || (s.genres || []).includes(genre))),
    [shorts, query, genre, category],
  )

  // Ангилал солиход өмнөх жанр тэнд байхгүй байж болно.
  useEffect(() => setGenre('Бүгд'), [category])

  const onCategory = (id) => go(id && id !== category ? `#cat-${id}` : '')

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

  // Буцаж орох хаяг: "<id>" эсвэл "<id>/<анги>".
  const returnHash = (r) => {
    const { id, ep } = splitEp(r)
    const item = (allMovies || []).find((m) => m.id === id)
    return item ? watchHref(item, ep) : `#watch-${encodeURIComponent(id)}`
  }
  const returnId = () => splitEp(peekReturnTo() || '').id

  // Кино үзэх гэж байгаад нэвтэрсэн бол тэр кино руу, үгүй бол Shorts руу.
  const onLogin = (u) => {
    setUser(u)
    const r = canWatchMovie(u, returnId()) ? takeReturnTo() : peekReturnTo()
    go(r ? returnHash(r) : isAdmin(u) ? '#admin' : '#shorts')
  }

  // Профайл дээр эрх авмагц хүлээж байсан кино руу шилжинэ.
  useEffect(() => {
    if (route.page !== 'profile' || !canWatchMovie(user, returnId())) return
    const r = takeReturnTo()
    if (r) location.hash = returnHash(r).slice(1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route, user])

  const goHome = () => {
    setQuery('')
    setGenre('Бүгд')
    go('')
  }

  // Админ кино нэмж/засахад серверээс дахин уншина.
  const onCatalog = () => {
    loadMovies(true).then(setMovies).catch(() => {})
  }

  // Эхлээд нүүр рүү шилжинэ, эс бөгөөс профайлын хамгаалалт нэвтрэх хуудас руу аваачна.
  const onLogout = async () => {
    await logout()
    location.hash = ''
    setRoute({ page: 'home' })
    setUser(null)
  }

  const page = route.page
  const isWatch = page === 'watch'
  const isAuth = page === 'login'
  const current = isWatch || page === 'pay' ? (allMovies || []).find((m) => m.id === route.id) : null

  // Босоо цувралыг Shorts-д үзнэ.
  useEffect(() => {
    if (isWatch && current && isShortsItem(current)) location.replace(watchHref(current, route.ep))
  }, [isWatch, current, route.ep])

  let content
  if (error) content = <p className="notice">{error}</p>
  else if (isAuth) content = <Login key={route.legacy ? 'email' : 'phone'} onDone={onLogin} legacy={route.legacy} />
  else if (page === 'profile') content = user && <Profile user={user} movies={published} onUser={setUser} onLogout={onLogout} />
  else if (page === 'pay') content = user && (current || (route.kind === 'month' && !route.id)) && <Checkout key={route.id + route.kind} kind={route.kind} movie={current} user={user} onUser={setUser} />
  else if (isWatch && current) content = <Watch key={current.id} movie={current} ep={route.ep} movies={movies} user={user} onUser={setUser} />
  else if (page === 'shorts') content = <Shorts series={query.trim() ? visibleShorts : shorts || []} startId={route.id} startEp={route.ep} user={user} loading={!shorts} />
  else if (isWatch && allMovies?.length > 0) content = <p className="notice">Энэ кино олдсонгүй.</p>
  else if (page === 'admin') content = user && <Admin tab={route.id} user={user} items={allMovies || []} onCatalog={onCatalog} onUser={setUser} />
  else if (page === 'history') content = <History movies={published} user={user} onUser={setUser} />
  else if (page === 'later') content = <Later movies={published} user={user} onUser={setUser} />
  else if (!isWatch)
    content = (
      <Home
        movies={visible}
        genres={genres}
        genre={genre}
        onGenre={setGenre}
        category={category}
        onCategory={onCategory}
        query={query}
        onClearSearch={() => setQuery('')}
        progressOf={(id) => progress[id]}
        loading={!allMovies}
        shorts={page === 'home' && (genre === 'Бүгд' || query.trim()) ? visibleShorts : []}
        continueItems={page === 'home' && genre === 'Бүгд' && !category && !query.trim() ? continueItems : []}
        categoryRows={page === 'home' && genre === 'Бүгд' && !category && !query.trim()}
      />
    )

  return (
    <div className={`app ${isWatch || isAuth || ['profile', 'admin', 'pay'].includes(page) ? 'is-focus' : ''} ${page === 'shorts' ? 'is-shorts' : ''} ${headerHidden ? 'header-hidden' : ''}`}>
      <Header
        query={query}
        user={user}
        onSearch={onSearch}
        onHome={goHome}
        onNavigate={go}
      />
      <main className="main">{content}</main>
      {isAdmin(user) && page !== 'admin' && <UploadIndicator />}
      <BottomNav page={page} user={user} onHome={goHome} onNavigate={(hash) => { setQuery(''); go(hash) }} />
    </div>
  )
}
