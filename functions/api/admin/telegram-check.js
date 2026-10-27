// POST /api/admin/telegram-check — админ: Telegram-ийн тохиргоог алхам алхмаар шалгаж, тест мессеж илгээнэ.
// Амжилттай бол мессеж нь очоогүй "Шалгаж байна" төлбөрүүдийг дахин илгээнэ. Нууц утгыг хэзээ ч буцаахгүй.
import { json, notifyPaymentSubmitted, requireAdmin, serviceClient, telegram } from '../../../server/core.js'

const VARS = ['SUPABASE_SERVICE_ROLE_KEY', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_ADMIN_CHAT_ID', 'ADMIN_TELEGRAM_IDS', 'TELEGRAM_WEBHOOK_SECRET']

export async function onRequestPost({ request, env }) {
  const { user, error } = await requireAdmin(request, env)
  if (error) return error

  const steps = []
  const step = (name, ok, detail = '') => steps.push({ name, ok, detail })
  const missing = VARS.filter((k) => !env[k])
  step('Cloudflare-ийн утгууд', !missing.length, missing.length ? `Байхгүй: ${missing.join(', ')}` : 'Бүгд байна')

  // Service role түлхүүр: хэрэглэгчийн имэйлийг уншиж чадах уу.
  try {
    const { data, error } = await serviceClient(env).auth.admin.getUserById(user.id)
    if (error) throw error
    step('Supabase service role', Boolean(data?.user), data?.user ? 'Ажиллаж байна' : 'Хэрэглэгч олдсонгүй')
  } catch (e) {
    step('Supabase service role', false, e.message)
  }

  // Сервер хүснэгтийг шууд уншиж чадах уу (Telegram мессеж илгээхэд хэрэгтэй).
  const { error: tableError } = await serviceClient(env).from('payment_requests').select('id').limit(1)
  step('Supabase хүснэгт (service role)', !tableError, tableError ? tableError.message : 'Уншиж чадаж байна')

  const tg = telegram(env)
  if (!tg) return json({ steps })
  try {
    const bot = await tg.call('getMe', {})
    step('Бот', true, `@${bot.username}`)
  } catch (e) {
    step('Бот', false, `${e.message} (TELEGRAM_BOT_TOKEN буруу байж магадгүй)`)
    return json({ steps })
  }
  try {
    const wh = await tg.call('getWebhookInfo', {})
    const want = new URL('/api/telegram/webhook', request.url).href
    const detail = [wh.url || 'тохируулаагүй', wh.last_error_message && `сүүлийн алдаа: ${wh.last_error_message}`].filter(Boolean).join(' · ')
    step('Webhook', wh.url === want, wh.url === want ? detail : `${detail} (байх ёстой: ${want})`)
  } catch (e) {
    step('Webhook', false, e.message)
  }
  if (!env.TELEGRAM_ADMIN_CHAT_ID) return json({ steps })
  try {
    await tg.sendMessage(env.TELEGRAM_ADMIN_CHAT_ID, 'KinoTube: тест мессеж. Төлбөрийн мэдэгдэл энэ чат руу ирнэ.')
    step('Админы чат руу илгээх', true, `chat_id ${env.TELEGRAM_ADMIN_CHAT_ID}`)
  } catch (e) {
    // Бүлэг supergroup болсон бол шинэ дугаарыг хэлнэ.
    step('Админы чат руу илгээх', false, `${e.message} (chat_id ${env.TELEGRAM_ADMIN_CHAT_ID})`)
    return json({ steps })
  }

  // Мессеж нь очоогүй хүлээгдэж буй төлбөрүүд.
  const { data: pending, error: pendingError } = await serviceClient(env)
    .from('payment_requests')
    .select('id')
    .eq('status', 'submitted')
    .is('telegram_message_id', null)
    .limit(20)
  if (pendingError) step('Хүлээгдэж буй төлбөр', false, pendingError.message)
  let sent = 0
  for (const p of pending || []) {
    if (await notifyPaymentSubmitted(env, p.id).catch(() => false)) sent++
  }
  if (pending?.length) step('Хүлээгдэж буй төлбөр дахин илгээх', sent === pending.length, `${sent}/${pending.length} илгээв`)
  return json({ steps })
}
