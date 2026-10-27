// Cloudflare R2 (S3 API): AWS Signature V4-ээр гарын үсэг зурна. Web Crypto ашиглана, нэмэлт сан хэрэггүй
// (Cloudflare Functions, Node 20+ хоёуланд ажиллана).
//  - presign: хугацаатай линк (видео үзэх GET, хөтчөөс шууд хуулах PUT)
//  - r2Fetch: серверээс шууд дуудах (multipart эхлүүлэх/дуусгах, устгах)

const enc = new TextEncoder()
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(data))
}

const sha256 = async (data) => hex(await crypto.subtle.digest('SHA-256', typeof data === 'string' ? enc.encode(data) : data))

// RFC 3986: encodeURIComponent-оос гадна !'()* -г кодлоно.
const encode = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

const amzDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
const canonicalPathOf = (path) => path.split('/').map(encode).join('/')
const canonicalQueryOf = (q) => Object.keys(q).sort().map((k) => `${encode(k)}=${encode(String(q[k]))}`).join('&')

async function signature(secretAccessKey, day, region, toSign) {
  let key = await hmac(`AWS4${secretAccessKey}`, day)
  key = await hmac(key, region)
  key = await hmac(key, 's3')
  key = await hmac(key, 'aws4_request')
  return hex(await hmac(key, toSign))
}

// Хугацаатай линк (query string гарын үсэг). origin өгөхгүй бол https://host.
export async function presign({
  host, path, accessKeyId, secretAccessKey, region = 'auto', expires = 3600, now = new Date(), method = 'GET', query = {}, origin,
}) {
  const date = amzDate(now)
  const day = date.slice(0, 8)
  const scope = `${day}/${region}/s3/aws4_request`
  const canonicalPath = canonicalPathOf(path)
  const q = canonicalQueryOf({
    ...query,
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${scope}`,
    'X-Amz-Date': date,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  })
  const canonical = [method, canonicalPath, q, `host:${host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const toSign = ['AWS4-HMAC-SHA256', date, scope, await sha256(canonical)].join('\n')
  return `${origin ?? `https://${host}`}${canonicalPath}?${q}&X-Amz-Signature=${await signature(secretAccessKey, day, region, toSign)}`
}

// Authorization header-тэй хүсэлтийн толгойнууд (host-оос бусад, fetch өөрөө тавина).
export async function signHeaders({
  method, host, path, query = {}, headers = {}, body = '', accessKeyId, secretAccessKey, region = 'auto', now = new Date(),
}) {
  const date = amzDate(now)
  const day = date.slice(0, 8)
  const scope = `${day}/${region}/s3/aws4_request`
  const payloadHash = await sha256(body)
  const all = { host, 'x-amz-content-sha256': payloadHash, 'x-amz-date': date }
  for (const [k, v] of Object.entries(headers)) all[k.toLowerCase()] = String(v).trim()
  const names = Object.keys(all).sort()
  const signed = names.join(';')
  const canonical = [
    method, canonicalPathOf(path), canonicalQueryOf(query), names.map((k) => `${k}:${all[k]}\n`).join(''), signed, payloadHash,
  ].join('\n')
  const toSign = ['AWS4-HMAC-SHA256', date, scope, await sha256(canonical)].join('\n')
  const { host: _, ...rest } = all
  return {
    ...rest,
    authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signed}, Signature=${await signature(secretAccessKey, day, region, toSign)}`,
  }
}

/* KinoTube-ийн bucket */

// R2_ENDPOINT нь зөвхөн локал тестэд (S3 mock); production-д R2_ACCOUNT_ID-аас гарна.
function conf(env) {
  const origin = (env.R2_ENDPOINT || `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`).replace(/\/+$/, '')
  return { origin, host: new URL(origin).host, bucket: env.R2_BUCKET, accessKeyId: env.R2_ACCESS_KEY_ID, secretAccessKey: env.R2_SECRET_ACCESS_KEY }
}

export const r2Configured = (env) => Boolean(env.R2_BUCKET && env.R2_ACCESS_KEY_ID && env.R2_SECRET_ACCESS_KEY && (env.R2_ACCOUNT_ID || env.R2_ENDPOINT))

// R2 bucket доторх файлын хугацаатай линк.
export function r2Url(env, key, expires, { method = 'GET', query, now } = {}) {
  const c = conf(env)
  return presign({ ...c, path: `/${c.bucket}/${key}`, expires, method, query, now })
}

export async function r2Fetch(env, method, key, { query = {}, body = '', headers = {} } = {}) {
  const c = conf(env)
  const path = `/${c.bucket}/${key}`
  const signed = await signHeaders({ ...c, method, path, query, headers, body })
  const qs = canonicalQueryOf(query)
  const res = await fetch(`${c.origin}${canonicalPathOf(path)}${qs ? `?${qs}` : ''}`, { method, headers: signed, body: body || undefined })
  const text = await res.text()
  // CompleteMultipartUpload алдааг 200-тай буцааж болно.
  if (!res.ok || /<Error>/.test(text)) throw new Error(`R2 ${method} ${key}: ${res.status} ${/<Message>([^<]*)/.exec(text)?.[1] ?? text.slice(0, 200)}`)
  return text
}

const xmlEscape = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export async function createMultipart(env, key, contentType) {
  const xml = await r2Fetch(env, 'POST', key, { query: { uploads: '' }, headers: { 'content-type': contentType } })
  const id = /<UploadId>([^<]+)<\/UploadId>/.exec(xml)?.[1]
  if (!id) throw new Error('R2: UploadId алга')
  return id
}

// Хэсэг бүрийн PUT линк (хөтөч шууд хуулна).
export function partUrls(env, key, uploadId, count, expires) {
  return Promise.all(
    Array.from({ length: count }, (_, i) => r2Url(env, key, expires, { method: 'PUT', query: { partNumber: String(i + 1), uploadId } })),
  )
}

export function completeMultipart(env, key, uploadId, parts) {
  const body = `<CompleteMultipartUpload>${parts
    .map((p) => `<Part><PartNumber>${p.partNumber}</PartNumber><ETag>${xmlEscape(p.etag)}</ETag></Part>`)
    .join('')}</CompleteMultipartUpload>`
  return r2Fetch(env, 'POST', key, { query: { uploadId }, body, headers: { 'content-type': 'application/xml' } })
}

export const abortMultipart = (env, key, uploadId) => r2Fetch(env, 'DELETE', key, { query: { uploadId } })
export const deleteObject = (env, key) => r2Fetch(env, 'DELETE', key)
