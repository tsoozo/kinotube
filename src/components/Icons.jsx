import {
  ArrowLeft,
  ClockRotateRight,
  HomeSimpleDoor,
  Menu,
  Movie,
  Play,
  Search,
  User,
  Xmark,
} from 'iconoir-react'

// Iconoir айконуудыг нэг ижил хэмжээ, зураасны зузаантай болгоно
const icon = (Icon) => (props) => (
  <Icon width="24" height="24" strokeWidth={1.6} aria-hidden="true" {...props} />
)

export const MenuIcon = icon(Menu)
export const SearchIcon = icon(Search)
export const HomeIcon = icon(HomeSimpleDoor)
export const HistoryIcon = icon(ClockRotateRight)
export const FilmIcon = icon(Movie)
export const PlayIcon = icon(Play)
export const UserIcon = icon(User)
export const CloseIcon = icon(Xmark)
export const BackIcon = icon(ArrowLeft)
