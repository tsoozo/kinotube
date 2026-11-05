// Үнэгүй үзэх дүрэм. Клиент (src/data.js) ба сервер (functions/api/video) хоёул эндээс авна.
//  Хэвтээ: кино эхний 5 минут, цуврал эхний 2 анги.
//  Shorts (босоо): эхний 10 минут. Олон ангитай бол 1-р ангиас эхлэн ангиудын нийт хугацаагаар тоолно.
export const FREE_SECONDS = 5 * 60
export const SHORTS_FREE_SECONDS = 10 * 60
export const FREE_EPISODES = 2

const secs = (d) => String(d || '').split(':').reduce((s, p) => s * 60 + (Number(p) || 0), 0)

// item: { orientation }, episodes: цувралын бүх анги [{ number, duration }] (кинонд хоосон), n: ангийн дугаар.
// Буцаана: Infinity — бүтэн үнэгүй, 0 — эрх хэрэгтэй, бусад — эхний хэдэн секунд үнэгүй.
export function freeLimit(item, episodes, n) {
  const vertical = item?.orientation === 'vertical'
  // Кино эсвэл ганц ангитай цуврал (= бүтэн кино).
  if (!episodes || episodes.length <= 1) return vertical ? SHORTS_FREE_SECONDS : FREE_SECONDS
  if (!vertical) return n <= FREE_EPISODES ? Infinity : 0
  const ep = episodes.find((e) => e.number === n)
  if (!ep) return 0
  const start = episodes.filter((e) => e.number < n).reduce((s, e) => s + secs(e.duration), 0)
  if (start >= SHORTS_FREE_SECONDS) return 0
  const len = secs(ep.duration)
  return len && start + len <= SHORTS_FREE_SECONDS ? Infinity : SHORTS_FREE_SECONDS - start
}

// Хаягт харуулах текст: "Эхний 10 минут" / "Эхний 2 анги".
export const freeLabel = (item, epCount) =>
  item?.kind === 'series' && epCount !== 1 && item?.orientation !== 'vertical'
    ? `Эхний ${FREE_EPISODES} анги`
    : `Эхний ${(item?.orientation === 'vertical' ? SHORTS_FREE_SECONDS : FREE_SECONDS) / 60} минут`
