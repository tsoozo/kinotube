// Cloudflare R2 (S3 API)-ын хугацаатай GET линк: AWS Signature V4, query string хэлбэр.
// Web Crypto ашиглана, нэмэлт сан хэрэггүй (Cloudflare Functions, Node 20+ хоёуланд ажиллана).

const enc = new TextEncoder()
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

async function hmac(key, data) {
  const k = await crypto.subtle.importKey('raw', typeof key === 'string' ? enc.encode(key) : key, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  return crypto.subtle.sign('HMAC', k, enc.encode(data))
}

const sha256 = async (data) => hex(await crypto.subtle.digest('SHA-256', enc.encode(data)))

// RFC 3986: encodeURIComponent-оос гадна !'()* -г кодлоно.
const encode = (s) => encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)

const amzDate = (d) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

// host, path ("/bucket/key"), credentials → бүтэн https линк.
export async function presign({ host, path, accessKeyId, secretAccessKey, region = 'auto', expires = 3600, now = new Date() }) {
  const date = amzDate(now)
  const day = date.slice(0, 8)
  const scope = `${day}/${region}/s3/aws4_request`
  const canonicalPath = path.split('/').map(encode).join('/')
  const params = {
    'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
    'X-Amz-Credential': `${accessKeyId}/${scope}`,
    'X-Amz-Date': date,
    'X-Amz-Expires': String(expires),
    'X-Amz-SignedHeaders': 'host',
  }
  const query = Object.keys(params).sort().map((k) => `${encode(k)}=${encode(params[k])}`).join('&')
  const canonical = ['GET', canonicalPath, query, `host:${host}`, '', 'host', 'UNSIGNED-PAYLOAD'].join('\n')
  const toSign = ['AWS4-HMAC-SHA256', date, scope, await sha256(canonical)].join('\n')
  let key = await hmac(`AWS4${secretAccessKey}`, day)
  key = await hmac(key, region)
  key = await hmac(key, 's3')
  key = await hmac(key, 'aws4_request')
  const signature = hex(await hmac(key, toSign))
  return `https://${host}${canonicalPath}?${query}&X-Amz-Signature=${signature}`
}

// R2 bucket доторх файлын линк.
export function r2Url(env, key, expires) {
  return presign({
    host: `${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    path: `/${env.R2_BUCKET}/${key}`,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    expires,
  })
}
