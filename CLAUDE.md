# CLAUDE.md

KinoTube-ийг хөгжүүлэхдээ энэ файлыг дагана. Энд бичсэн дүрэм бусад бүх зөвлөмжөөс давуу.

## Төсөл

- **KinoTube**: YouTube загвартай кино үзэх сайт. Брэнд нэр латинаар "KinoTube".
- Стек: React 19 + Vite 6, цэвэр JavaScript (`.jsx`), TypeScript ашиглахгүй.
- Router сан ашиглахгүй: hash хаяг (`#watch-<id>`, `#pay-rent-<id>`, `#pay-month[-<id>]`, `#shorts`, `#shorts-<id>`, `#history`, `#later`, `#profile`, `#admin`, `#admin-<таб>`, `#login`). Хуучин `#register`, `#forgot` нь `#login` руу очно. Шинэ хуудас нэмэхдээ `src/App.jsx`-ийн `readRoute()`-д нэмнэ.
- Хэрэглэгч, эрх, төлбөр: Supabase (имэйл кодоор нэвтрэх, `supabase/migrations/`). Эрх олгох, үнэ, админ шалгалт бүгд серверт (RLS, SQL функц); клиентийн шалгалт зөвхөн UI-д. Төлбөр: банкны шилжүүлэг → Telegram ботоор админ батална. Үзсэн түүх, "Дараа үзэх" localStorage-д, хэрэглэгч бүрт тусдаа.
- Сервер: Cloudflare Pages Functions (`functions/api/`), хуваалцсан код `server/`. Нууц түлхүүрүүд (service role, бот token, R2) зөвхөн Cloudflare-ийн Secret-д, клиент код болон git-д хэзээ ч орохгүй.
- Кино өгөгдөл: `public/movies.json`. Видео Cloudflare R2-д (`movies/<id>.mp4`, `shorts/<id>.mp4`), сайт `/api/video/<id>`-ээс хугацаатай линк авч тоглуулна. Зураг `public/thumbnails/` (git-д ороогүй, зураг байхгүй бол өнгөт fallback).
- Байршуулалт: Cloudflare Pages, `main` салбар руу push хийхэд автоматаар https://kinotube.pages.dev дээр гарна (`functions/` хамт). Supabase migration `main`-д ороход GitHub интеграцаар хэрэгжинэ. GitHub Actions (`.github/workflows/ci.yml`) push болон PR бүрт `npm ci && npm run build` ажиллуулж шалгана.

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
src/data.js            movies.json унших, хайлт, жанр, санал болгох
src/auth.js            Supabase client, нэвтрэх, эрх, төлбөр, видео линк, данс `BANK`, үзсэн түүх (localStorage)
src/admin.js           админы үйлдэл (admin_* RPC: хэрэглэгч, төлбөр, статистик; кино/Shorts json засвар)
src/components/        нэг файлд нэг компонент (PascalCase.jsx)
src/components/Icons.jsx   бүх айкон эндээс
src/styles.css         бүх CSS нэг файлд
public/movies.json     киноны жагсаалт
public/shorts.json     Shorts (босоо, ≤20 мин) жагсаалт
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

- `movies.json` мөр бүр: `id` (латин, зураас), `title`, `year`, `genres[]`, `duration` ("Ц:ММ:СС"), `description`, `video`, `thumbnail`, `added` ("YYYY-MM-DD"), `subtitles` (заавал биш, `.vtt` зам эсвэл `[{src, lang, label}]`).
- Нүүрний жанрын чип `genres`-ээс автоматаар үүснэ, гараар жагсаалт бичихгүй. Хажуу цэс байхгүй: үндсэн цэс нь доод талын тогтмол bottom nav (`BottomNav.jsx`: Нүүр, Shorts, Түүх, Профайл), бүх дэлгэцийн хэмжээнд (zoye, 2026-10-21).
- localStorage түлхүүрүүд `kino-` угтвартай. `auth.js`-ийн `read`/`write`-ээр дамжуулна (try/catch хамгаалалттай).

## Git

- `main` руу шууд push хийж болно (zoye зөвшөөрсөн). `main` = live сайт тул push хийхээс өмнө `npm run build` амжилттай болсон, хөтөч дээр шалгасан байх ёстой.
- Commit мессеж монголоор, юу өөрчилснийг товч бичнэ.
- `node_modules`, `dist`, видео файлуудыг commit хийхгүй.
- Том өөрчлөлтийн дараа `README.md`-г шинэчилнэ.
