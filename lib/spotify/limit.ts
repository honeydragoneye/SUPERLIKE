/**
 * Words for a Spotify rate limit, so the search screen, the suggestion panel and
 * the player bar all say the same thing.
 *
 * The server hands over a duration (`Retry-After`, in seconds) rather than a
 * clock time: it is the one number that stays true however long the response
 * takes to arrive. Everything here turns it into what a listener can use.
 */

/** When the limit lifts, as a timestamp the client can compare against the clock. */
export function untilOf(retryAfterSec: number, now = Date.now()): number {
  return now + Math.max(0, retryAfterSec) * 1000;
}

/** "약 40분 뒤" under an hour, "약 16시간 뒤" above it. */
export function inText(until: number, now = Date.now()): string {
  const mins = Math.max(1, Math.round((until - now) / 60_000));
  if (mins < 60) return `약 ${mins}분 뒤`;
  return `약 ${Math.round(mins / 60)}시간 뒤`;
}

/** "오늘 오후 3:20쯤", "내일 오전 10:08쯤", or the date once it is further off. */
export function whenText(until: number, now = Date.now()): string {
  const at = new Date(until);
  const today = new Date(now);
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((midnight(at) - midnight(today)) / 86_400_000);
  const clock = at.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", hour12: true });
  const day = days <= 0 ? "오늘" : days === 1 ? "내일" : `${at.getMonth() + 1}월 ${at.getDate()}일`;
  return `${day} ${clock}쯤`;
}

/** The one line under the search title and in the suggestion panel. */
export function searchNotice(until: number, now = Date.now()): string {
  return `Spotify 검색 요청 한도에 걸렸어요 · ${whenText(until, now)} 다시 쓸 수 있어요`;
}

/** The line on the player bar, where a failed play already reports itself. */
export function playNotice(retryAfterSec: number): string {
  return `Spotify 요청 한도에 걸렸어요 · ${inText(untilOf(retryAfterSec))} 다시 시도해 주세요`;
}
