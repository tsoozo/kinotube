// GET /m/<id>[/<анги>] — хуваалцах хаяг. Facebook, Messenger, Telegram зэрэг нь hash (#watch-...) уншдаггүй тул
// кино бүрт тусдаа Open Graph tag-тай жижиг HTML буцааж, хүн бол JS-ээр апп руу (#watch-<id> / #shorts-<id>) шилжүүлнэ.
import { SLUG_RE, serviceClient } from '../../server/core.js'
import { FREE_EPISODES, FREE_SECONDS } from '../../server/preview.js'
import { r2Configured, r2Url } from '../../server/r2.js'

const SITE = 'KinoTube'
const SITE_TITLE = 'KinoTube — Кино, цуврал онлайн'
const SITE_DESC = 'Монгол, Солонгос, Хятад кино, цуврал, Shorts. Кино бүрийн эхний 5 минут, цувралын эхний 2 анги үнэгүй. Утсаараа хаанаас ч үзээрэй.'

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const cut = (s, n) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s)
const clock = (d) => (d || '').replace(/^0:/, '')

// Хуваалцах зураг (админд үүссэн 1200×630 карт) байгаа эсэх. ETag-аар хувилбар: шинэчлэхэд Facebook дахин татна.
async function ogCard(env, id) {
  if (!r2Configured(env)) return null
  const key = `thumbnails/og/${id}.jpg`
  try {
    const res = await fetch(await r2Url(env, key, 300, { method: 'HEAD' }), { method: 'HEAD' })
    if (!res.ok) return null
    const v = (res.headers.get('etag') || '').replace(/\W/g, '').slice(0, 10)
    return `/img/${key}${v ? `?v=${v}` : ''}`
  } catch {
    return null
  }
}

function describe(m, epCount, ep) {
  const series = m.kind === 'series'
  const free = series ? `🎁 Эхний ${FREE_EPISODES} анги ҮНЭГҮЙ` : `🎁 Эхний ${FREE_SECONDS / 60} минут ҮНЭГҮЙ`
  const meta = [
    m.year,
    (m.genres || []).slice(0, 2).join(', '),
    series ? (epCount ? `${epCount} анги` : '') : clock(m.duration),
  ].filter(Boolean).join(' · ')
  const about = m.description ? cut(m.description.replace(/\s+/g, ' ').trim(), 160) : ''
  return [ep ? `${ep}-р анги.` : '', `${free} — одоо үзээрэй ▶️`, meta && `${meta}.`, about].filter(Boolean).join(' ')
}

function page({ title, desc, image, url, app, type = 'video.movie', large = true }) {
  return `<!doctype html>
<html lang="mn">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(url)}">
<link rel="icon" type="image/png" href="/favicon.png">
<meta property="og:site_name" content="${SITE}">
<meta property="og:locale" content="mn_MN">
<meta property="og:type" content="${type}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(url)}">
<meta property="og:image" content="${esc(image)}">
<meta property="og:image:alt" content="${esc(title)}">
${large ? '<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n' : ''}<meta name="twitter:card" content="${large ? 'summary_large_image' : 'summary'}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(image)}">
<meta name="theme-color" content="#0f0f0f">
<style>body{margin:0;background:#0f0f0f;color:#f1f1f1;font:16px system-ui,sans-serif;display:grid;place-items:center;min-height:100vh}a{color:inherit}</style>
<script>location.replace(${JSON.stringify(app)})</script>
</head>
<body><a href="${esc(app)}">${esc(title)} — ${SITE} дээр үзэх</a></body>
</html>`
}

export async function onRequestGet({ request, env, params }) {
  const origin = new URL(request.url).origin
  const [rawId = '', rawEp] = [].concat(params.path ?? [])
  const id = decodeURIComponent(rawId)
  const ep = /^\d{1,3}$/.test(rawEp || '') ? Number(rawEp) : 0
  const site = page({ title: SITE_TITLE, desc: SITE_DESC, image: `${origin}/og.png`, url: `${origin}/`, app: '/', type: 'website' })
  const html = (body, maxAge = 600) =>
    new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': `public, max-age=${maxAge}` } })

  if (!SLUG_RE.test(id) || id.length > 100) return html(site)
  let m = null
  let epCount = 0
  try {
    const db = serviceClient(env)
    const [{ data }, { count }] = await Promise.all([
      db.from('catalog').select('id, kind, orientation, title, year, genres, duration, description, thumbnail').eq('id', id).eq('published', true).maybeSingle(),
      db.from('episodes').select('number', { count: 'exact', head: true }).eq('series_id', id).eq('video_ready', true),
    ])
    m = data
    epCount = count || 0
  } catch (e) {
    console.error('share page', id, e.message)
  }
  if (!m) return html(site, 60)

  const suffix = ep ? `/${ep}` : ''
  const app = `/#${m.orientation === 'vertical' ? 'shorts' : 'watch'}-${m.id}${suffix}`
  const card = await ogCard(env, m.id)
  const image = card ? `${origin}${card}` : m.thumbnail ? `${origin}/img/${m.thumbnail}` : `${origin}/og.png`
  const title = `${m.title}${ep ? ` · ${ep}-р анги` : ''}${m.year ? ` (${m.year})` : ''} | ${SITE}`
  return html(page({
    title,
    desc: describe(m, epCount, ep),
    image,
    url: `${origin}/m/${m.id}${suffix}`,
    app,
    type: m.kind === 'series' ? 'video.tv_show' : 'video.movie',
    // Картгүй босоо нүүр зураг томоор харагдвал хэт тайрагдана.
    large: Boolean(card) || m.orientation !== 'vertical',
  }))
}
