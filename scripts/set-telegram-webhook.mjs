// Ботын webhook-ийг сайт руу холбоно (нэг удаа, байршуулсны дараа):
// TELEGRAM_BOT_TOKEN=... TELEGRAM_WEBHOOK_SECRET=... APP_URL=https://kinotube.pages.dev npm run telegram:webhook
import { TelegramClient } from '../server/telegram.js'

const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret, APP_URL: appUrl = 'https://kinotube.pages.dev' } = process.env
if (!token || !secret) {
  console.error('TELEGRAM_BOT_TOKEN болон TELEGRAM_WEBHOOK_SECRET шаардлагатай.')
  process.exit(1)
}
const url = `${appUrl.replace(/\/+$/, '')}/api/telegram/webhook`
await new TelegramClient(token).setWebhook(url, secret)
console.log('Webhook:', url)
