import logoK from '../assets/logo-k.png'

export default function Logo({ onClick, href = '#' }) {
  return (
    <a className="logo" href={href} onClick={onClick}>
      <img className="logo-mark" src={logoK} alt="" width="17" height="24" />
      <span className="logo-text">KinoTube</span>
    </a>
  )
}
