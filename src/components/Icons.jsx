const icon = (d) => (props) => (
  <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" {...props}>
    <path d={d} fill="currentColor" />
  </svg>
)

export const MenuIcon = icon('M3 6h18v2H3zm0 5h18v2H3zm0 5h18v2H3z')
export const SearchIcon = icon('M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14')
export const HomeIcon = icon('M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z')
export const HistoryIcon = icon('M13 3a9 9 0 0 0-9 9H1l3.89 3.89.07.14L9 12H6c0-3.87 3.13-7 7-7s7 3.13 7 7-3.13 7-7 7c-1.93 0-3.68-.79-4.94-2.06l-1.42 1.42A8.95 8.95 0 0 0 13 21a9 9 0 0 0 0-18m-1 5v5l4.28 2.54.72-1.21-3.5-2.08V8z')
export const FilmIcon = icon('M18 4l2 4h-3l-2-4h-2l2 4h-3l-2-4H8l2 4H7L5 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V4z')
export const PlayIcon = icon('M8 5v14l11-7z')
export const UserIcon = icon('M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4m0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4')
export const CloseIcon = icon('M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z')
export const BackIcon = icon('M21 11H6.83l3.58-3.59L9 6l-6 6 6 6 1.41-1.41L6.83 13H21z')
