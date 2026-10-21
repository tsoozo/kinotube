# KinoTube

YouTube загвартай, өөрийн кино файлуудаар ажилладаг React (Vite) сайт.

## Ажиллуулах

```bash
npm install
cp .env.example .env.local   # Supabase, Telegram-ын утгуудыг бөглөнө
npm run dev        # http://localhost:5173 (зөвхөн сайт)
npx vercel dev     # сайт + api/ (төлбөр, Telegram) хамт
npm run build      # dist/ хавтсанд бэлэн сайт гарна
```

## Кино нэмэх

1. Видео файлаа `public/videos/` хавтсанд хуулна (жишээ нь `public/videos/metropolis.mp4`).
2. Зургаа (16:9 харьцаатай) `public/thumbnails/` хавтсанд хуулна. Зураг байхгүй бол сайт киноны нэрээр өнгөт зураг өөрөө үүсгэнэ.
3. `public/movies.json` файлд нэг мөр нэмнэ:

```json
{
  "id": "metropolis",
  "title": "Метрополис",
  "year": 1927,
  "genres": ["Шинжлэх ухааны уран зөгнөлт", "Драм"],
  "duration": "2:33:00",
  "description": "Киноны товч агуулга",
  "video": "videos/metropolis.mp4",
  "thumbnail": "thumbnails/metropolis.jpg",
  "added": "2026-10-18"
}
```

- `id` нь давтагдахгүй, латин үсэг, зураасаас бүрдэнэ (хаягт `#watch-metropolis` гэж харагдана).
- `genres` дахь нэрүүдээр хажуугийн цэс болон шүүлтүүр автоматаар үүснэ.
- `video` нь `.mp4` (H.264) байвал бүх хөтөч дээр тоглоно.

Одоогийн `movies.json` дахь 10 кино нь жишээ өгөгдөл. Өөрийнхөөрөө солиорой.

## Нэвтрэх, профайл, төлбөр

- **Нэвтрэх** (`#login`): имэйл → 6 оронтой код. Бүртгэлгүй бол код оруулахад шинээр үүснэ.
- **Профайл** (`#profile`): нэр (засах), имэйл, үзэх эрх ("2026.11.20-нд дуусна", үлдсэн хоног), эрх авах/сунгах,
  үзсэн түүх, төлбөрийн түүх.
- **Төлбөр** (`#pay-<id>`) — банкны шилжүүлэг, Telegram ботоор батална:
  1. Эрх сонгоход `KT-1234` гүйлгээний утгатай хүсэлт үүснэ. Дүнг сервер `products` хүснэгтээс авна.
  2. Дүн, банк, дансны дугаар, хүлээн авагч, гүйлгээний утга "Хуулах" товчтой харагдана.
  3. Хэрэглэгч шилжүүлээд **"Гүйлгээ хийсэн"** дарна.
  4. **Telegram бот** админуудын группт `Шинэ төлбөр — KT-1234` мессежийг **✅ Батлах / ❌ Татгалзах** товчтой
     илгээнэ.
  5. Админ ✅ дармагц эрх нээгдэж, хэрэглэгчийн нээлттэй хуудас өөрөө "Эрх нээгдлээ" болно (Realtime, 10 секундын
     шалгалт нөөц). ❌ дарвал "Төлбөр баталгаажсангүй"; админ тэр мессежид хариу бичвэл шалтгаан болж харагдана.
  6. Хүсэлт 24 цагийн дотор "Гүйлгээ хийсэн" болоогүй бол хүчингүй болно.
- Төлбөр хүлээн авах данс: `src/auth.js` → `BANK`.
- Эрхийн үнэ, хугацаа: Supabase → Table Editor → `products`.
- Үзсэн түүх хөтөч дотор (localStorage), хэрэглэгч бүрт тусдаа хадгалагдана.

### Бүтэц

```
src/                     React сайт (Vite)
api/payments/[id]/submit.js   "Гүйлгээ хийсэн" → админд Telegram мессеж (Vercel Function)
api/telegram/webhook.js       ✅/❌ товч, татгалзсан шалтгаан (Vercel Function)
supabase/migrations/     Өгөгдлийн сан: хүснэгт, RLS, төлбөрийн функцууд, эрхийн багцууд
supabase/tests/          pgTAP тестүүд (npx supabase test db)
```

### Тохиргоо (нэг удаа, бүгд үнэгүй)

1. **Supabase** (supabase.com → New project, Free):
   - SQL Editor → `supabase/migrations/20261021000001_kinotube.sql`-ийн агуулгыг бүтнээр нь хуулж **Run**.
   - Authentication → Email: "Email OTP length" = 6. **Magic Link** загварт линкийн оронд кодыг явуулна:
     `Нэвтрэх код: {{ .Token }}`.
   - Project Settings → API: URL, `anon` түлхүүр, `service_role` түлхүүрийг хуулж авна.
2. **Telegram бот:**
   - @BotFather → `/newbot` → токен (`TELEGRAM_BOT_TOKEN`).
   - Админуудын хувийн групп үүсгэж ботыг нэмнэ, группт нэг мессеж бичнэ. Дараа нь
     `https://api.telegram.org/bot<TOKEN>/getUpdates` хаягийг нээж `chat.id`-г (хасах тоо) → `TELEGRAM_ADMIN_CHAT_ID`,
     батлах эрхтэй хүмүүсийн `from.id` → `ADMIN_TELEGRAM_IDS=111,222`.
   - Санамсаргүй нууц үг сонгоно (үсэг, тоо, `_`, `-`) → `TELEGRAM_WEBHOOK_SECRET`.
3. **Vercel** → kinotube → Settings → Environment Variables:

| Хувьсагч | Утга |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase URL |
| `VITE_SUPABASE_ANON_KEY` | `anon` түлхүүр |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` түлхүүр (нууц) |
| `TELEGRAM_BOT_TOKEN` | ботын токен (нууц) |
| `TELEGRAM_ADMIN_CHAT_ID` | админ группын id |
| `ADMIN_TELEGRAM_IDS` | батлах хүмүүсийн id, таслалаар |
| `TELEGRAM_WEBHOOK_SECRET` | сонгосон нууц үг |

   Хадгалаад **Redeploy**.
4. **Webhook холбох** (нэг удаа): хөтөч дээр дараах хаягийг нээнэ (`<…>`-г орлуулна):
   `https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://kinotube.vercel.app/api/telegram/webhook&secret_token=<НУУЦ ҮГ>`
   эсвэл `TELEGRAM_BOT_TOKEN=… TELEGRAM_WEBHOOK_SECRET=… npm run telegram:webhook`.

Тохируулаагүй үед кино жагсаалт ажиллана, нэвтрэх хуудас тохиргоо дутуу гэж анхааруулна. `main` руу push хийх бүрт
Vercel автоматаар байршуулна.

**Анхаар:** видео файлууд `public/videos/` дотор нийтэд нээлттэй байршдаг тул эрхийн шалгалт зөвхөн дэлгэц дээр
хийгдэнэ. Видеог жинхэнээр хамгаалахын тулд хугацаатай холбоос (signed URL) хэрэгтэй.
