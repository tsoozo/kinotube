import { useEffect, useRef, useState } from 'react'
import { BackIcon, CardIcon, CrownIcon, PhoneIcon, QrIcon, SuccessIcon } from './Icons.jsx'
import { PLANS, RENTAL, buyPlan, canWatchMovie, formatDateTime, formatMoney, rentMovie } from '../auth.js'

const METHODS = [
  ['qpay', 'QPay', QrIcon],
  ['socialpay', 'SocialPay', PhoneIcon],
  ['card', 'Банкны карт', CardIcon],
]

// Сонгосон эрхийн төлбөр. Амжилттай бол үзэж байсан кино руу шууд буцна.
// Туршилтын горим: жинхэнэ төлбөр авахгүй. QPay холбогдоход pay()-г серверийн дуудлагаар солино.
export default function Checkout({ kind, movie, user, onUser }) {
  const [method, setMethod] = useState('qpay')
  const [step, setStep] = useState('choose')
  const [ends, setEnds] = useState('')
  const timer = useRef(0)
  const month = PLANS[0]
  const rent = kind === 'rent'
  const price = rent ? RENTAL.price : month.price
  const watchHash = `#watch-${encodeURIComponent(movie.id)}`

  useEffect(() => () => clearTimeout(timer.current), [])

  // Аль хэдийн эрхтэй бол төлөх шаардлагагүй.
  useEffect(() => {
    if (step === 'choose' && canWatchMovie(user, movie.id)) location.replace(watchHash)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pay = () => {
    setStep('processing')
    timer.current = setTimeout(() => {
      const u = rent ? rentMovie(user, movie, true) : buyPlan(user, month.id, true)
      onUser(u)
      setEnds(rent ? u.rentals[0].endsAt : u.subscription.endsAt)
      setStep('done')
      timer.current = setTimeout(() => location.replace(watchHash), 1800)
    }, 1200)
  }

  if (step === 'done') {
    return (
      <div className="checkout">
        <div className="checkout-done" role="status">
          <SuccessIcon />
          <h1>Төлбөр амжилттай</h1>
          <p className="muted">{rent ? movie.title : 'Бүх кино'} · {formatDateTime(ends)} хүртэл</p>
          <a className="btn-primary" href={watchHash} onClick={(e) => { e.preventDefault(); location.replace(watchHash) }}>Киноо үзэх</a>
        </div>
      </div>
    )
  }

  return (
    <div className="checkout">
      <a className="link-btn checkout-back" href={watchHash}><BackIcon /> Буцах</a>
      <h1>Төлбөр төлөх</h1>

      <section className={`checkout-summary ${rent ? '' : 'premium'}`}>
        {!rent && <CrownIcon className="pay-crown" />}
        <span>{rent ? 'Зөвхөн энэ кино' : 'Бүх кино'}</span>
        <b>{formatMoney(price)}</b>
        <small>{rent ? `«${movie.title}» · ${RENTAL.days} хоног үзнэ` : '1 сар хязгааргүй үзнэ'}</small>
      </section>

      <h2>Төлбөрийн хэрэгсэл</h2>
      <div className="checkout-methods" role="radiogroup" aria-label="Төлбөрийн хэрэгсэл">
        {METHODS.map(([id, label, Icon]) => (
          <button
            key={id}
            role="radio"
            aria-checked={method === id}
            className={`checkout-method ${method === id ? 'active' : ''}`}
            onClick={() => setMethod(id)}
          >
            <Icon />
            <span>{label}</span>
            <i className="checkout-radio" />
          </button>
        ))}
      </div>

      <button className="btn-primary checkout-pay" onClick={pay} disabled={step === 'processing'}>
        {step === 'processing' ? 'Төлбөр шалгаж байна...' : `${formatMoney(price)} төлөх`}
      </button>
      <p className="demo-note">Туршилтын горим: жинхэнэ төлбөр авахгүй, товч дармагц амжилттай болно.</p>
    </div>
  )
}
