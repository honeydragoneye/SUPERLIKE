"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Issue } from "@/lib/db/issues";
import { DEFAULT_THEME_COLORS, THEME_COLORS } from "@/lib/week-theme";
import { DetailShell, DetailStatus } from "./detail-shell";
import { useDetail } from "./use-detail";

type Data = { issues: Issue[] };

const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

/** "2026.10.16 금": the day the mail went out, in Seoul; the Friday of its week when that was not kept. */
function sentOn(issue: Issue): string {
  const when = issue.sentAt ? new Date(issue.sentAt.replace(" ", "T")) : new Date(`${issue.week}T00:00:00+09:00`);
  if (!issue.sentAt) when.setUTCDate(when.getUTCDate() + 4);
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(when);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "";
  const day = new Date(`${get("year")}-${get("month")}-${get("day")}T00:00:00+09:00`).getDay();
  return `${get("year")}.${get("month")}.${get("day")} ${WEEKDAY[day]}`;
}

const no = (n: number) => `NO.${String(n).padStart(2, "0")}`;

/** The week's colour, as the mail wore it. */
function ThemeChip({ theme, small }: { theme: string | null; small?: boolean }) {
  if (!theme) return null;
  const c = THEME_COLORS[theme] ?? DEFAULT_THEME_COLORS;
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-pill font-bold ${small ? "px-[6px] py-[2px] text-[6px] tracking-[0.4px]" : "gap-[6px] px-[8px] py-[3px] text-[8px] tracking-[0.6px]"}`}
      style={{ backgroundColor: c.bg, color: c.ink }}
    >
      {theme}
    </span>
  );
}

/** The sleeve, or a record on the album's dark colour when the mail has none. */
function Sleeve({ src, size, className = "" }: { src: string | null; size: number; className?: string }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-[4px] bg-artwork ${className}`} style={{ width: size, aspectRatio: "1 / 1" }}>
      {src ? (
        <Image src={src} alt="" fill sizes={`${size}px`} className="object-cover" unoptimized />
      ) : (
        <>
          <span className="absolute inset-[11%] rounded-full bg-artwork" />
          <span className="absolute inset-[35%] rounded-full bg-accent-bright" />
        </>
      )}
    </span>
  );
}

function Latest({ issue }: { issue: Issue }) {
  const router = useRouter();
  const a = issue.album;
  return (
    <section className="rule flex w-full shrink-0 items-start gap-[20px] rounded-[8px] bg-card p-[16px]">
      <Sleeve src={a?.artwork ?? null} size={176} />
      <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
        <div className="flex flex-wrap items-center gap-[8px]">
          <span className="rounded-pill bg-accent-bright px-[8px] py-[3px] text-[8px] tracking-[0.6px] text-paper-solid">NEW · 이번 호</span>
          <span className="text-[8px] font-bold tracking-[0.6px]">
            {no(issue.no)} · {sentOn(issue)}
          </span>
          <ThemeChip theme={issue.theme} />
        </div>
        <h3 className="text-[22px] font-black leading-[26px] tracking-[-0.3px]">{a?.name ?? issue.week}</h3>
        {a && (
          <p className="text-[9px] font-bold">
            {[a.artist, a.releaseDate?.slice(0, 4), a.trackCount && issue.heard ? `${a.trackCount}곡 중 ${issue.heard}곡을 이번 주에 들었어요` : null].filter(Boolean).join(" · ")}
          </p>
        )}
        {a?.intro && <p className="line-clamp-2 text-[9px] leading-[15px] text-on-bright-muted">{a.intro}</p>}
        {a?.spotifyAlbumId && (
          <div className="mt-[2px] flex gap-[8px]">
            <button
              type="button"
              onClick={() => router.push(`/album/${a.spotifyAlbumId}`)}
              className="whitespace-nowrap rounded-pill bg-ink px-[14px] py-[8px] text-[9px] tracking-[0.6px] text-on-ink transition-colors hover:bg-accent-bright hover:text-paper-solid"
            >
              앨범 페이지 →
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

function PastCard({ issue }: { issue: Issue }) {
  const a = issue.album;
  const inner = (
    <>
      <Sleeve src={a?.artwork ?? null} size={170} className="!w-full" />
      <span className="flex items-center gap-[6px]">
        <span className="min-w-0 flex-1 truncate text-[7px] font-bold tracking-[0.5px] text-on-bright-muted">
          {no(issue.no)} · {sentOn(issue).slice(0, 10)}
        </span>
        <ThemeChip theme={issue.theme} small />
      </span>
      <span className="truncate text-[12px] font-black" title={a?.name}>
        {a?.name ?? issue.week}
      </span>
      <span className="truncate text-[8px] font-bold text-on-bright-muted">{a?.artist}</span>
    </>
  );
  const style = "rule flex min-w-0 flex-col gap-[8px] rounded-[6px] bg-card p-[10px] text-left";
  return a?.spotifyAlbumId ? (
    <Link href={`/album/${a.spotifyAlbumId}`} className={`${style} transition-colors hover:bg-soft`}>
      {inner}
    </Link>
  ) : (
    <div className={style}>{inner}</div>
  );
}

/**
 * Every weekly mail that has gone out: the latest one big, the earlier ones as
 * a shelf of sleeves. Public like the mail's own subscribe form; the issues come
 * from the database, so a visitor who has not connected Spotify sees them too.
 */
export function IssuesPage() {
  const { data, loading, error } = useDetail<Data>("/api/issues");
  const issues = data?.issues ?? [];
  const [latest, ...past] = issues;

  return (
    <DetailShell
      eyebrow="ISSUES · 지난 호 모아 보기"
      title="금요일의 앨범 편지"
      subtitle={`용눈이가 한 주 동안 가장 많이 들은 앨범 한 장을 매주 금요일 메일로 보내요${issues.length ? ` · 지금까지 ${issues.length}통` : ""}`}
    >
      <DetailStatus loading={loading} error={error ? "지난 호를 불러오지 못했어요" : null} />
      {!loading && !error && issues.length === 0 && (
        <p className="rule rounded-[8px] bg-card p-[16px] text-[10px] leading-[16px]">
          아직 보낸 편지가 없어요. 첫 편지가 나가면 여기에 쌓여요.
        </p>
      )}
      {latest && <Latest issue={latest} />}
      {past.length > 0 && (
        <>
          <div className="flex shrink-0 items-baseline gap-[8px] pt-[4px]">
            <h3 className="text-[13px] font-black">지난 호</h3>
            <span className="text-[8px] font-bold tracking-[0.6px] text-on-bright-muted">{past.length}통</span>
          </div>
          <div className="grid grid-cols-5 gap-[14px]">
            {past.map((i) => (
              <PastCard key={i.week} issue={i} />
            ))}
          </div>
        </>
      )}
    </DetailShell>
  );
}
