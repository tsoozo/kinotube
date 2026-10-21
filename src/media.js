// Видео, зургийн хаяг. Файлууд гадны хадгалалтад (Cloudflare R2, Bunny гэх мэт) байх үед
// VITE_MEDIA_BASE_URL-д тэр хаягийг өгнө: "videos/x.mp4" -> "https://cdn.example.com/videos/x.mp4".
// Тохируулаагүй бол өмнөх шигээ public/ хавтсаас уншина.
const BASE = (import.meta.env.VITE_MEDIA_BASE_URL || '').replace(/\/+$/, '')

// Bunny Stream ашиглавал movies.json-д "bunnyId" нэмж, VITE_BUNNY_LIBRARY_ID-г тохируулна.
const BUNNY_LIBRARY = import.meta.env.VITE_BUNNY_LIBRARY_ID || ''

export function mediaUrl(path) {
  if (!path || /^https?:\/\//.test(path) || !BASE) return path
  return `${BASE}/${path.replace(/^\/+/, '')}`
}

export function bunnyEmbed(movie) {
  if (!movie.bunnyId || !BUNNY_LIBRARY) return null
  return `https://iframe.mediadelivery.net/embed/${BUNNY_LIBRARY}/${movie.bunnyId}?autoplay=false&preload=true`
}
