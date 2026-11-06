# CLAUDE.md

KinoTube-ийг хөгжүүлэхдээ энэ файлыг дагана. Энд бичсэн дүрэм бусад бүх зөвлөмжөөс давуу.

## Төсөл

- **KinoTube**: YouTube загвартай кино үзэх сайт. Брэнд нэр латинаар "KinoTube".
- Стек: React 19 + Vite 6, цэвэр JavaScript (`.jsx`), TypeScript ашиглахгүй.
- Router сан ашиглахгүй: hash хаяг (`#cat-<ангилал>`, `#watch-<id>[/<анги>]`, `#pay-rent-<id>`, `#pay-month[-<id>]`, `#shorts`, `#shorts-<id>[/<анги>]`, `#history`, `#later`, `#profile`, `#admin`, `#admin-<таб>`, `#login`). Хуучин `#register`, `#forgot` нь `#login` руу очно. Шинэ хуудас нэмэхдээ `src/App.jsx`-ийн `readRoute()`-д нэмнэ. Хуваалцах линк нь path: `/m/<id>[/<анги>]` (`functions/m/`, Open Graph tag өгөөд hash руу шилжүүлнэ).
- Хэрэглэгч, эрх, төлбөр: Supabase (утасны дугаар + 4 оронтой кодоор нэвтрэх, имэйлгүй: сервер `functions/api/auth/` далд имэйлтэй хэрэглэгч үүсгэж session гаргана; кодоо мартвал админ шинэ код өгнө; `supabase/migrations/`). Эрх олгох, үнэ, админ шалгалт бүгд серверт (RLS, SQL функц); клиентийн шалгалт зөвхөн UI-д. Төлбөр: банкны шилжүүлэг → Telegram ботоор админ батална. Үзсэн түүх, "Дараа үзэх" localStorage-д, хэрэглэгч бүрт тусдаа.
- Сервер: Cloudflare Pages Functions (`functions/api/`), хуваалцсан код `server/`. Нууц түлхүүрүүд (service role, бот token, R2) зөвхөн Cloudflare-ийн Secret-д, клиент код болон git-д хэзээ ч орохгүй.
- Кино 2 хэлбэр: хэвтээ, босоо (`orientation`). Төрөл: нэг ангитай кино (`movie`) эсвэл олон ангитай цуврал (`series`, ангиуд `episodes` хүснэгтэд). **Shorts = босоо цуврал**: доош гүйлгэвэл өөр кино, хөндлөн гүйлгэвэл дараагийн анги. Хэвтээ цуврал үзэх хуудсанд ангийн жагсаалттай (zoye, 2026-10-31; хуучин "киноноос тасалсан Shorts" ойлголт байхгүй).
- Үнэгүй үзэх (`server/free.js`, клиент сервер хоёул): кино эхний 10 минут (zoye, 2026-11-06), цуврал эхний 2 анги, Shorts (босоо) эхний 10 минут ангиудын нийт хугацаагаар (zoye, 2026-11-05), хүн бүрт (нэвтрээгүй ч). Цааш нь төлбөр (нэг кино/цуврал 3 хоног эсвэл сарын эрх). Сервер шалгана: `functions/api/video/[id].js`, эрхгүй үед киноны зөвхөн эхний хэсгийн байтыг `functions/api/preview/[id].js` дамжуулна (`server/preview.js`).
- Кино өгөгдөл: Supabase `catalog` (кино, цуврал) ба `episodes` хүснэгт, админ сайтаас тус бүрээр нэмнэ (JSON засахгүй). Видео, зураг Cloudflare R2-д (`movies/<id>.mp4`, `episodes/<id>/<дугаар>.mp4`, `thumbnails/...`), админ хөтчөөс шууд хуулна (`src/uploads.js`, `functions/api/admin/upload.js`), дуусахад Telegram группт мэдэгдэнэ. Сайт видеог `/api/video/<id>`, зургийг `/img/<key>`-ээс авна. `public/movies.json`, `shorts.json` нь зөвхөн Supabase-гүй локал хөгжүүлэлтэд. Зураг байхгүй бол өнгөт fallback.
- Байршуулалт: Cloudflare Pages, `main` салбар руу push хийхэд автоматаар https://kinotube.pages.dev дээр гарна (`functions/` хамт). Supabase migration `main`-д ороход GitHub интеграцаар хэрэгжинэ. Vercel ашиглахгүй (төслийг устгасан, 2026-11-06). GitHub Actions (`.github/workflows/ci.yml`) push болон PR бүрт `npm ci && npm run build` ажиллуулж шалгана.

## Команд

```bash
npm install
npm run dev      # http://localhost:5173 (зөвхөн сайт, .env-д VITE_SUPABASE_*)
npm run build    # dist/ — өөрчлөлт бүрийн дараа заавал ажиллуулж шалгана
npm run preview  # build-ийг шалгах
npm test         # R2 линкийн тест
npx wrangler pages dev dist   # сайт + functions/ (.dev.vars-аас)
```

Өгөгдлийн сангийн тест: `supabase/tests/` (pgTAP, `npx supabase test db`). Migration өөрчилбөл тест нэмнэ. Linter байхгүй. Build амжилттай болж, хөтөч дээр харж шалгасан байх ёстой.

## Бүтэц

```
src/App.jsx            hash route, төлөв, хуудас сонголт
src/data.js            кино жагсаалт унших (Supabase catalog), хайлт, жанр, санал болгох
src/uploads.js         видео хуулах арын дараалал (R2 multipart)
src/auth.js            Supabase client, нэвтрэх, эрх, төлбөр, видео линк, данс `BANK`, үзсэн түүх (localStorage)
src/admin.js           админы үйлдэл (admin_* RPC: хэрэглэгч, төлбөр, статистик; кино, цуврал, анги)
src/components/        нэг файлд нэг компонент (PascalCase.jsx)
src/components/Icons.jsx   бүх айкон эндээс
src/styles.css         бүх CSS нэг файлд
public/movies.json     жишээ жагсаалт (Supabase-гүй үед)
public/shorts.json     жишээ босоо цуврал (Shorts, ангиудтай)
functions/api/         Cloudflare Pages Functions: төлбөр илгээх, Telegram webhook, видео линк
server/                functions-ийн хуваалцсан код (Supabase, Telegram, R2 гарын үсэг)
supabase/migrations/   хүснэгт, RLS, төлбөр ба админы функцууд, үнэ (products)
scripts/               Telegram webhook тохируулах, видео бэлтгэх (ffmpeg)
```

## Код бичих дүрэм

- Функц компонент, hooks. Class компонент бичихгүй.
- 2 зай догол, `'` нэг хашилт, цэг таслалгүй (одоогийн кодтой адил).
- Тайлбар (comment) **монголоор**, богино, зөвхөн шаардлагатай газар.
- Шинэ сан (dependency) нэмэхээс өмнө хэрэгтэй эсэхийг бод. Хувилбарыг яг тогтооно (`^` биш).
- Импортдоо `.jsx` / `.js` өргөтгөлийг бичнэ.

## UI ба дизайн

- Сайтад мэдэгдэл (notification, хонх) хийхгүй (zoye, 2026-10-21).
- Сайтын бүх бичвэр **монгол хэлээр** (кирилл). Брэнд нэр л латин.
- YouTube маягийн, минимал, цэвэрхэн загвар.
- **Айкон**: [Lucide](https://lucide.dev) (`lucide-react`), Claude апп шиг нимгэн (strokeWidth 1.5), бөөрөнхий зураастай outline загвар (zoye, 2026-10-21). Дүүргэлттэй (filled) айкон хэрэглэхгүй. Ямар ч сан ашигласан бүх айкон `src/components/Icons.jsx`-д `icon(...)`-ээр нэмэгдэж, тэндээс импортлогдоно. Компонент дотор шууд `<svg>` бичихгүй. Ингэснээр сан солиход зөвхөн энэ файл өөрчлөгдөнө.
- Өнгө: `src/styles.css`-ийн `:root` дээрх CSS хувьсагч (`--bg`, `--fg`, `--accent` ...) ашиглана. Hex өнгө шууд бичихгүй. Шинэ өнгө нэмбэл dark mode (`prefers-color-scheme: dark`) хэсэгт ч мөн нэмнэ.
- Фонт: Roboto (үндсэн), Poppins 600 (лого), Roboto Condensed (зурган дээрх гарчиг).
- Утас (≈360px) болон desktop хоёулан дээр ажиллах ёстой. Хэвтээ scroll гарахгүй.
- Лого: `src/assets/logo-k.png` (улаан "K"). Favicon-ууд `public/`-д.

## Өгөгдөл

- `catalog` мөр: `id` (латин, зураас, өөрчлөгдөхгүй), `kind` (movie/series), `orientation` (horizontal/vertical), `title`, `year`, `genres[]`, `categories[]` (old/ai/mongolian/chinese/korean), `price_mnt` (кино/цувралын үнэ, хоосон бол products-ийн rent үнэ), `duration` ("Ц:ММ:СС", кинонд), `description`, `thumbnail` (R2 түлхүүр), `subtitles`, `added`, `published`, `video_ready`/`video_size` (зөвхөн сервер). Админ `admin_save_catalog`-оор хадгална. `episodes` мөр: `series_id`, `number`, `title`, `duration`, `video_key`/`video_ready`/`video_size` (зөвхөн сервер); админ `admin_save_episode`-оор.
- Нүүрний чип: эхэнд тогтсон ангилал (`CATEGORIES`, `src/data.js`; шинэ ангилал нэмбэл migration-ий check-д ч нэмнэ), дараа нь жанр `genres`-ээс автоматаар үүснэ, жанрын жагсаалт гараар бичихгүй. Хажуу цэс байхгүй: үндсэн цэс нь доод талын тогтмол bottom nav (`BottomNav.jsx`: Нүүр, Shorts, Түүх, Профайл), бүх дэлгэцийн хэмжээнд (zoye, 2026-10-21).
- localStorage түлхүүрүүд `kino-` угтвартай. `auth.js`-ийн `read`/`write`-ээр дамжуулна (try/catch хамгаалалттай).

## Git

- `main` руу шууд push хийж болно (zoye зөвшөөрсөн). `main` = live сайт тул push хийхээс өмнө `npm run build` амжилттай болсон, хөтөч дээр шалгасан байх ёстой.
- Commit мессеж монголоор, юу өөрчилснийг товч бичнэ.
- `node_modules`, `dist`, видео файлуудыг commit хийхгүй.
- Том өөрчлөлтийн дараа `README.md`-г шинэчилнэ.
