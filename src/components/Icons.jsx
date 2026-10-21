import {
  ArrowLeft,
  CirclePlay,
  CircleUserRound,
  Clapperboard,
  History,
  House,
  Menu,
  Search,
  X,
} from 'lucide-react'

// Lucide айконуудыг нимгэн, бөөрөнхий зураастай (Claude маягийн) нэг ижил хэмжээтэй болгоно
const icon = (Icon) => (props) => (
  <Icon size={24} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" {...props} />
)

export const MenuIcon = icon(Menu)
export const SearchIcon = icon(Search)
export const HomeIcon = icon(House)
export const HistoryIcon = icon(History)
export const FilmIcon = icon(Clapperboard)
export const PlayIcon = icon(CirclePlay)
export const UserIcon = icon(CircleUserRound)
export const CloseIcon = icon(X)
export const BackIcon = icon(ArrowLeft)
