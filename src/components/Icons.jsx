import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  CirclePlay,
  CircleUserRound,
  Clapperboard,
  History,
  House,
  Search,
  SquarePlay,
  Volume2,
  VolumeX,
  Trash2,
  X,
} from 'lucide-react'

// Lucide айконуудыг нимгэн, бөөрөнхий зураастай (Claude маягийн) нэг ижил хэмжээтэй болгоно
const icon = (Icon) => (props) => (
  <Icon size={24} strokeWidth={1.5} absoluteStrokeWidth aria-hidden="true" {...props} />
)

export const SearchIcon = icon(Search)
export const HomeIcon = icon(House)
export const HistoryIcon = icon(History)
export const FilmIcon = icon(Clapperboard)
export const PlayIcon = icon(CirclePlay)
export const UserIcon = icon(CircleUserRound)
export const CloseIcon = icon(X)
export const BackIcon = icon(ArrowLeft)
export const ShortsIcon = icon(SquarePlay)
export const UpIcon = icon(ChevronUp)
export const DownIcon = icon(ChevronDown)
export const SoundIcon = icon(Volume2)
export const MuteIcon = icon(VolumeX)
export const TrashIcon = icon(Trash2)
