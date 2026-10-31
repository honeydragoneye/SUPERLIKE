"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
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

/** What a card wears: the mail's own page colour and white, its small print in the mail's tint. Cards of an issue saved without colours keep the page's. */
function wear(issue: Issue) {
  const c = issue.colors;
  return {
    card: c ? { backgroundColor: c.bg, color: "#ffffff" } : undefined,
    muted: c ? { color: c.sub } : undefined,
  };
}

function IssueCard({ issue }: { issue: Issue }) {
  const router = useRouter();
  const a = issue.album;
  const w = wear(issue);
  return (
    <section className="rule flex w-full shrink-0 items-start gap-[20px] rounded-[8px] bg-card p-[16px]" style={w.card}>
      <Sleeve src={a?.artwork ?? null} size={176} />
      <div className="flex min-w-0 flex-1 flex-col gap-[8px]">
        <div className="flex flex-wrap items-center gap-[8px]">
          <span className="text-[8px] font-bold tracking-[0.6px]">
            {no(issue.no)} · {sentOn(issue)}
          </span>
          <ThemeChip theme={issue.theme} />
        </div>
        <h3 className="text-[22px] font-black leading-[26px] tracking-[-0.3px]">
          <Link href={`/issues?issue=${issue.week}`} className="transition-colors hover:text-accent-bright">
            {a?.name ?? issue.week}
          </Link>
        </h3>
        {a && (
          <p className="text-[9px] font-bold">
            {[a.artist, a.releaseDate?.slice(0, 4), a.trackCount && issue.heard ? `${a.trackCount}곡 중 ${issue.heard}곡을 이번 주에 들었어요` : null].filter(Boolean).join(" · ")}
          </p>
        )}
        {a?.intro && (
          <p className="line-clamp-2 text-[9px] leading-[15px] text-on-bright-muted" style={w.muted}>
            {a.intro}
          </p>
        )}
        <div className="mt-[2px] flex gap-[8px]">
          <Link
            href={`/issues?issue=${issue.week}`}
            className={`whitespace-nowrap rounded-pill px-[14px] py-[8px] text-[9px] tracking-[0.6px] transition-colors ${issue.colors ? "bg-white text-black hover:bg-accent-bright hover:text-white" : "bg-ink text-on-ink hover:bg-accent-bright hover:text-paper-solid"}`}
          >
            매거진 읽기 →
          </Link>
          {a?.spotifyAlbumId && (
            <button
              type="button"
              onClick={() => router.push(`/album/${a.spotifyAlbumId}`)}
              className="rule whitespace-nowrap rounded-pill bg-paper px-[14px] py-[8px] text-[9px] tracking-[0.6px] text-ink transition-colors hover:bg-soft"
            >
              앨범 페이지 →
            </button>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * One issue as it was mailed: the mail's own HTML in a frame (GET /api/issues/[week]),
 * as tall as the mail is. It is the same page as the list, switched by `?issue=`, so
 * the back button returns to the list.
 */
function MailFrame({ week }: { week: string }) {
  const [height, setHeight] = useState(900);
  return (
    <iframe
      title="매거진"
      src={`/api/issues/${week}`}
      height={height}
      onLoad={(e) => {
        const doc = e.currentTarget.contentDocument;
        if (doc) setHeight(Math.max(doc.documentElement.scrollHeight, 400));
      }}
      className="rule block w-full shrink-0 rounded-[8px] bg-card"
    />
  );
}

/**
 * Every weekly mail that has gone out, newest first, each a wide card in one
 * list that scrolls. Public like the mail's own subscribe form; the issues come
 * from the database, so a visitor who has not connected Spotify sees them too.
 */
export function IssuesPage() {
  const { data, loading, error } = useDetail<Data>("/api/issues");
  const issues = data?.issues ?? [];
  const open = useSearchParams().get("issue");
  const shown = open ? issues.find((i) => i.week === open) : undefined;

  if (open) {
    return (
      <DetailShell
        eyebrow={shown ? `ISSUES · ${no(shown.no)} · ${sentOn(shown)}` : "ISSUES · 지난 호 모아 보기"}
        title={shown?.title ?? "금요일의 앨범 편지"}
        aside={shown && <ThemeChip theme={shown.theme} />}
      >
        <DetailStatus loading={loading} error={error ? "지난 호를 불러오지 못했어요" : null} />
        {!loading && !error && !shown && (
          <p className="rule rounded-[8px] bg-card p-[16px] text-[10px] leading-[16px]">그 호를 찾지 못했어요. 지난 호 모음에서 다시 골라 주세요.</p>
        )}
        {shown && <MailFrame week={shown.week} />}
      </DetailShell>
    );
  }

  return (
    <DetailShell
      eyebrow="ISSUES · 지난 호 모아 보기"
      title="금요일의 앨범 편지"
    >
      <DetailStatus loading={loading} error={error ? "지난 호를 불러오지 못했어요" : null} />
      {!loading && !error && issues.length === 0 && (
        <p className="rule rounded-[8px] bg-card p-[16px] text-[10px] leading-[16px]">
          아직 보낸 편지가 없어요. 첫 편지가 나가면 여기에 쌓여요.
        </p>
      )}
      {issues.map((i) => (
        <IssueCard key={i.week} issue={i} />
      ))}
    </DetailShell>
  );
}
