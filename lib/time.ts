/** "방금 · 12분 전 · 3시간 전 · 어제 · 09.28" — compact enough for a table cell. */
export function playedAgo(iso: string, now = Date.now()): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const mins = Math.floor((now - then) / 60_000);

  if (mins < 1) return "방금";
  if (mins < 60) return `${mins}분 전`;

  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}시간 전`;
  if (hours < 48) return "어제";

  const d = new Date(then);
  return `${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/** 3:58 */
export function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** "2024-10-28" at day precision, "2024" when that is all Spotify stored. */
export function releaseLabel(date: string, precision: string): string {
  if (precision === "year") return `${date.slice(0, 4)}년`;
  if (precision === "month") return `${date.slice(0, 4)}년 ${Number(date.slice(5, 7))}월`;
  return `${date.slice(0, 4)}년 ${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
}
