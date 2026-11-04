"use client";

import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSpotify } from "@/components/player/spotify-provider";
import { lookUp } from "@/components/ui/track-card";
import type { WeeklyArtist } from "@/lib/db/weekly";
import { DetailStatus } from "./detail-shell";
import { useDetail } from "./use-detail";

/** what useDetail says for a 401: the listener has not connected Spotify */
const NOT_CONNECTED = "Spotify를 연결해 주세요";

function Section({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex w-full shrink-0 flex-col gap-[8px]">
      <div className="flex items-baseline justify-between gap-[12px]">
        <h3 className="text-[15px] font-black tracking-[-0.3px]">{title}</h3>
        {note && <p className="text-[8px] tracking-[0.5px] text-on-bright-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

const PILL = "shrink-0 whitespace-nowrap rounded-pill px-[14px] py-[8px] text-[9px] tracking-[0.7px]";

/**
 * One of the artist's best-known songs (Last.fm names it, with no Spotify id).
 *
 * The song is looked up on Spotify when it is pressed, not when the page opens:
 * eight lookups at once, each a few searches, is how Spotify's rate limit got
 * hit and the whole page started failing. One press costs one lookup, and the
 * answer is remembered for the next.
 */
function TopSong({ rank, title, artist }: { rank: number; title: string; artist: string }) {
  const { connected, play } = useSpotify();
  const [state, setState] = useState<"idle" | "busy" | "missing" | "failed">("idle");

  async function press() {
    if (!connected || state === "busy") return;
    setState("busy");
    try {
      const song = await lookUp({ title, artist });
      if (!song) return setState("missing");
      setState("idle");
      void play({ uris: [song.uri] });
    } catch {
      setState("failed");
    }
  }

  const note =
    state === "busy" ? "찾는 중…" : state === "missing" ? "Spotify에서 찾지 못했어요" : state === "failed" ? "잠시 뒤 다시 눌러 주세요" : null;

  return (
    <li className="rule-b track-row">
      <button
        type="button"
        onClick={() => void press()}
        title={connected ? `${title} 재생` : "Spotify를 연결하면 재생할 수 있어요"}
        className={`flex h-[40px] w-full items-center gap-[10px] text-left ${connected ? "cursor-pointer" : "cursor-default"}`}
      >
        <span className="tnum w-[18px] shrink-0 text-[10px] font-black text-on-bright-muted">{rank}</span>
        <span className="min-w-0 flex-1 truncate text-[12px]">{title}</span>
        {note && <span className="shrink-0 text-[9px] text-on-bright-muted">{note}</span>}
      </button>
    </li>
  );
}

/**
 * Artist of the Week.
 *
 * The artist and the songs are the listener's own: the artist they played most
 * this week, and which of that artist's songs they played. A visitor who has not
 * connected Spotify has no plays to count, so they see the developer's pick (from
 * the database) with a line saying so.
 * Playing a song still needs a connection, which the player asks for.
 */
export function WeeklyArtistPage() {
  const router = useRouter();
  const { play, startStation } = useSpotify();
  const mine = useDetail<WeeklyArtist>("/api/me/weekly-artist");
  // only a listener without a connection falls back to the developer's pick
  const visitor = mine.error === NOT_CONNECTED;
  const owner = useDetail<WeeklyArtist>(visitor ? "/api/weekly-artist" : null);

  const state = visitor ? owner : mine;
  const pick = state.data;
  const artist = pick?.artist;
  const when = pick?.previous ? "지난주" : "이번 주";
  const heard = pick?.heard ?? [];
  const cream = "text-paper-solid";

  const emptyText =
    state.error === "찾을 수 없습니다"
      ? visitor
        ? "아직 이번 주 아티스트가 없습니다"
        : "이번 주에 들은 기록이 아직 없어요. 곡을 들으면 가장 많이 들은 아티스트가 여기에 나와요."
      : state.error;

  const rows = heard.map((t) => ({
    uri: `spotify:track:${t.trackId}`,
    title: t.title,
    artist: artist?.name ?? "",
    artwork: t.artwork,
    durationMs: 0,
  }));

  return (
    <section className="flex min-h-full flex-1 flex-col gap-[16px] bg-chart p-[16px]">
      {artist ? (
        <>
          <div
            className="relative flex h-[260px] w-full shrink-0 items-stretch justify-between gap-[24px] overflow-hidden rounded-[8px] bg-artwork p-[28px]"
            style={artist.palette ? { backgroundColor: artist.palette.bg } : undefined}
          >
            <div className="flex min-w-0 flex-1 gap-[18px]">
              <button
                type="button"
                disabled={rows.length === 0}
                title={`${when} 들은 곡 재생`}
                onClick={() => void play({ uris: rows.map((r) => r.uri), tracks: rows })}
                className="flex size-[64px] shrink-0 items-center justify-center rounded-pill bg-black/45 text-[22px] text-paper-solid transition-colors enabled:hover:bg-black/70 disabled:opacity-40"
              >
                <span aria-hidden className="ml-[3px]">▶</span>
              </button>
              <div className="flex min-w-0 flex-col gap-[6px]">
                <p className={`text-[9px] tracking-[1.4px] opacity-80 ${cream}`}>
                  {pick.previous ? "ARTIST OF THE WEEK · 지난주" : "ARTIST OF THE WEEK"}
                </p>
                <h2 className={`truncate text-[46px] font-black leading-[1.05] tracking-[-1.5px] ${cream}`} title={artist.name}>
                  {artist.name}
                </h2>
                <p className={`truncate text-[12px] opacity-85 ${cream}`}>
                  {artist.genres.slice(0, 3).join(" · ")}
                </p>
                {visitor && <p className={`text-[10px] opacity-70 ${cream}`}>Spotify를 연결하면 내가 가장 많이 들은 아티스트가 여기에 나와요.</p>}
              </div>
            </div>
            <span className="relative size-[204px] shrink-0 self-center overflow-hidden rounded-[6px] bg-black/20">
              {artist.image && <Image src={artist.image} alt="" fill sizes="204px" className="object-cover" unoptimized />}
            </span>
          </div>

          <div className="flex w-full shrink-0 flex-wrap items-center gap-[8px]">
            <button
              type="button"
              disabled={rows.length === 0}
              onClick={() => void play({ uris: rows.map((r) => r.uri), tracks: rows })}
              className={`${PILL} bg-ink text-on-ink disabled:opacity-40`}
            >
              재생
            </button>
            <button
              type="button"
              disabled={rows.length === 0}
              title={`${artist.name} 기준으로 스테이션 시작`}
              onClick={() =>
                void startStation({
                  id: heard[0].trackId,
                  uri: rows[0].uri,
                  name: heard[0].title,
                  artist: artist.name,
                  artwork: heard[0].artwork,
                  durationMs: 0,
                })
              }
              className={`${PILL} bg-accent text-paper-solid transition-colors enabled:hover:bg-ink enabled:hover:text-on-ink disabled:opacity-40`}
            >
              스테이션 시작
            </button>
            <button
              type="button"
              onClick={() => router.push(`/artist/${artist.id}`)}
              className={`${PILL} bg-paper transition-colors hover:bg-soft rule`}
            >
              아티스트 페이지
            </button>
            <button
              type="button"
              onClick={() => router.back()}
              title="돌아가기"
              className={`${PILL} bg-paper transition-colors hover:bg-soft rule`}
            >
              <span aria-hidden>←</span> 뒤로
            </button>
          </div>

          <div className="grid w-full shrink-0 grid-cols-[minmax(0,1fr)_330px] gap-[32px]">
            <Section title={`${when} 들은 곡`}>
              <ul className="flex flex-col">
                {heard.map((t, i) => (
                  <li key={t.trackId} className="rule-b track-row">
                    <button
                      type="button"
                      onClick={() => void play({ uris: rows.map((r) => r.uri).slice(i), tracks: rows.slice(i) })}
                      className="flex h-[52px] w-full cursor-pointer items-center gap-[12px] text-left"
                    >
                      <span className="tnum w-[24px] shrink-0 text-[12px] font-black text-on-bright-muted">{String(i + 1).padStart(2, "0")}</span>
                      <span className="relative size-[40px] shrink-0 overflow-hidden rounded-[4px] bg-artwork">
                        {t.artwork && <Image src={t.artwork} alt="" fill sizes="40px" className="object-cover" unoptimized />}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col gap-px">
                        <span className="truncate text-[9px] text-on-bright-muted">{artist.name}</span>
                        <span className="truncate text-[13px]">{t.title}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
              {heard.length === 0 && <p className="text-[10px] text-on-bright-muted">{when}에 이 아티스트의 곡을 들은 기록이 없어요.</p>}
            </Section>

            <div className="flex flex-col gap-[20px]">
              {artist.genres.length > 0 && (
                <Section title="GENRES">
                  <div className="flex flex-wrap gap-[6px]">
                    {artist.genres.slice(0, 6).map((g) => (
                      <span key={g} className="shrink-0 rounded-pill bg-soft px-[10px] py-[4px] text-[8px] tracking-[0.6px] text-ink rule">
                        {g}
                      </span>
                    ))}
                  </div>
                </Section>
              )}
              {artist.topTracks.length > 0 && (
                <Section title="대표곡">
                  <ul className="flex flex-col">
                    {artist.topTracks.map((t, i) => (
                      <TopSong key={t.title} rank={i + 1} title={t.title} artist={artist.name} />
                    ))}
                  </ul>
                </Section>
              )}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="flex w-full shrink-0 items-center justify-between gap-[12px]">
            <div className="flex flex-col gap-px">
              <p className="text-[8px] tracking-[0.9px] text-on-bright-muted">ARTIST OF THE WEEK</p>
              <h2 className="text-[26px] font-black tracking-[-1px]">이번 주 아티스트</h2>
            </div>
            <button type="button" onClick={() => router.back()} className={`${PILL} bg-paper transition-colors hover:bg-soft rule`}>
              <span aria-hidden>←</span> 뒤로
            </button>
          </div>
          <DetailStatus loading={state.loading || (visitor && owner.loading)} error={state.loading ? null : emptyText} />
        </>
      )}
    </section>
  );
}
