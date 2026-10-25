import {
  ArrowLeft,
  BookmarkCheck,
  BookmarkPlus,
  Captions,
  CaptionsOff,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  CirclePlay,
  CircleUserRound,
  Clapperboard,
  Clock,
  Download,
  Gauge,
  History,
  House,
  Lock,
  LogOut,
  Maximize,
  Minimize,
  Pause,
  Play,
  Pencil,
  Plus,
  RotateCcw,
  RotateCw,
  Search,
  ShieldCheck,
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
export const PrevIcon = icon(ChevronLeft)
export const NextIcon = icon(ChevronRight)
export const SoundIcon = icon(Volume2)
export const MuteIcon = icon(VolumeX)
export const TrashIcon = icon(Trash2)
export const PlusIcon = icon(Plus)
export const EditIcon = icon(Pencil)
export const DownloadIcon = icon(Download)
export const ResetIcon = icon(RotateCcw)
export const AdminIcon = icon(ShieldCheck)
export const LogoutIcon = icon(LogOut)
export const PlayArrowIcon = icon(Play)
export const PauseIcon = icon(Pause)
export const BackTenIcon = icon(RotateCcw)
export const ForwardTenIcon = icon(RotateCw)
export const FullscreenIcon = icon(Maximize)
export const FullscreenExitIcon = icon(Minimize)
export const LaterIcon = icon(Clock)
export const SaveIcon = icon(BookmarkPlus)
export const SavedIcon = icon(BookmarkCheck)
export const CaptionsIcon = icon(Captions)
export const CaptionsOffIcon = icon(CaptionsOff)
export const SpeedIcon = icon(Gauge)
export const LockIcon = icon(Lock)
