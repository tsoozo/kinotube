# CLAUDE.md

KinoTube-ийг хөгжүүлэхдээ энэ файлыг дагана. Энд бичсэн дүрэм бусад бүх зөвлөмжөөс давуу.

## Төсөл

- **KinoTube**: YouTube загвартай кино үзэх сайт. Брэнд нэр латинаар "KinoTube".
- Стек: React 19 + Vite 6, цэвэр JavaScript (`.jsx`), TypeScript ашиглахгүй.
- Router сан ашиглахгүй: hash хаяг (`#watch-<id>`, `#shorts`, `#shorts-<id>`, `#history`, `#profile`, `#login`, `#register`, `#forgot`). Шинэ хуудас нэмэхдээ `src/App.jsx`-ийн `readRoute()`-д нэмнэ.
- Сервер байхгүй: хэрэглэгч, данс, эрх бүгд `src/auth.js` дотор localStorage-д (mock). SMS, төлбөр жинхэнэ биш.
- Кино өгөгдөл: `public/movies.json`. Видео `public/videos/`, зураг `public/thumbnails/` (git-д ороогүй, зураг байхгүй бол өнгөт fallback).
- Байршуулалт: Vercel, `main` салбар руу push хийхэд автоматаар https://kinotube.vercel.app дээр гарна. GitHub Actions (`.github/workflows/ci.yml`) push болон PR бүрт `npm ci && npm run build` ажиллуулж шалгана.

## Команд

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # dist/ — өөрчлөлт бүрийн дараа заавал ажиллуулж шалгана
npm run preview  # build-ийг шалгах
```

Тест, linter одоогоор байхгүй. Build амжилттай болж, хөтөч дээр харж шалгасан байх ёстой.

## Бүтэц

```
src/App.jsx            hash route, төлөв, хуудас сонголт
src/data.js            movies.json унших, хайлт, жанр, санал болгох
src/auth.js            нэвтрэх, бүртгэл, данс, эрх (localStorage mock)
src/components/        нэг файлд нэг компонент (PascalCase.jsx)
src/components/Icons.jsx   бүх айкон эндээс
src/styles.css         бүх CSS нэг файлд
public/movies.json     киноны жагсаалт
public/shorts.json     Shorts (босоо, ≤20 мин) жагсаалт
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

- `movies.json` мөр бүр: `id` (латин, зураас), `title`, `year`, `genres[]`, `duration` ("Ц:ММ:СС"), `description`, `video`, `thumbnail`, `added` ("YYYY-MM-DD").
- Нүүрний жанрын чип `genres`-ээс автоматаар үүснэ, гараар жагсаалт бичихгүй. Хажуу цэс байхгүй: үндсэн цэс нь доод талын тогтмол bottom nav (`BottomNav.jsx`: Нүүр, Shorts, Түүх, Профайл), бүх дэлгэцийн хэмжээнд (zoye, 2026-10-21).
- localStorage түлхүүрүүд `kino-` угтвартай. `auth.js`-ийн `read`/`write`-ээр дамжуулна (try/catch хамгаалалттай).

## Git

- `main` руу шууд push хийж болно (zoye зөвшөөрсөн). `main` = live сайт тул push хийхээс өмнө `npm run build` амжилттай болсон, хөтөч дээр шалгасан байх ёстой.
- Commit мессеж монголоор, юу өөрчилснийг товч бичнэ.
- `node_modules`, `dist`, видео файлуудыг commit хийхгүй.
- Том өөрчлөлтийн дараа `README.md`-г шинэчилнэ.
