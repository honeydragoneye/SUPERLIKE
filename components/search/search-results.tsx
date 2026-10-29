"use client";

import { FollowButton } from "@/components/follow/follow-button";
import Image from "next/image";
import { clock } from "@/lib/time";
import { useSpotify } from "@/components/player/spotify-provider";
import { StationButton, seedFrom } from "@/components/ui/station-button";
import { LoadingDots } from "@/components/ui/loading-dots";
import { EXPLICIT_NOTE, LOCKED_LOOK, useExplicitLock } from "@/components/ui/explicit";
import Link from "next/link";
import { inText, whenText } from "@/lib/spotify/limit";
import { useSearch, type SearchTab } from "./search-provider";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const TABS: { key: SearchTab; label: string }[] = [
  { key: "track", label: "곡" },
  { key: "album", label: "앨범" },
  { key: "artist", label: "아티스트" },
  { key: "playlist", label: "플레이리스트" },
];

function Thumb({ src, size = 32 }: { src: string | null; size?: number }) {
  return (
    <span
      className="relative shrink-0 overflow-hidden rounded-[4px] bg-artwork"
      style={{ width: size, height: size }}
    >
      {src && (
        <Image src={src} alt="" fill sizes={`${size}px`} className="object-cover" unoptimized />
      )}
    </span>
  );
}

/**
 * Replaces the history and playlist blocks while a query is active, taking the
 * whole Discover column — the arrangement from Superlike_V1.2 — search.
 */
export function SearchResults() {
  const { query, results, loading, error, limitedUntil, tab, setTab, total, loadMore, loadingMore, hasMore } =
    useSearch();
  const router = useRouter();
  const { play } = useSpotify();
  const lockedOf = useExplicitLock();

  /**
   * Fetches the next page when the foot of the list comes into view.
   *
   * `rootMargin` starts it a screen early so the rows are usually there before
   * the reader arrives. The guards live in the provider — one request at a
   * time, and none at all once Spotify has run out — so this only has to
   * report that the bottom was reached.
   */
  const moreRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = moreRef.current;
    if (!node || !hasMore) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) loadMore();
      },
      { rootMargin: "600px" },
    );
    io.observe(node);
    return () => io.disconnect();
  }, [hasMore, loadMore, tab, results]);

  const counts: Record<SearchTab, number> = {
    track: results.tracks.length,
    album: results.albums.length,
    artist: results.artists.length,
    playlist: results.playlists.length,
  };

  return (
    <section className="flex min-h-full flex-1 flex-col gap-[10px] bg-chart p-[16px]">
      <div className="flex w-full shrink-0 items-center justify-between gap-[10px]">
        <div className="flex shrink-0 flex-col gap-[3px]">
          <h2 className="text-[26px] font-black tracking-[-1px] text-on-bright">
            검색 결과
          </h2>
          <p
            className={`whitespace-nowrap tracking-[0.7px] text-on-bright-muted ${
              limitedUntil ? "text-[11px]" : "text-[8px]"
            }`}
          >
            {error
              ? error
              : loading
                ? `"${query}" 검색 중`
                : `"${query}" · 결과 ${total}건`}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-[6px]">
          {TABS.map(({ key, label }) => {
            const active = key === tab;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={active}
                onClick={() => setTab(key)}
                className={`shrink-0 whitespace-nowrap rounded-pill px-[14px] py-[7px] text-[9px] tracking-[0.7px] rule ${
                  active ? "bg-ink text-on-ink" : "bg-soft text-on-bright"
                }`}
              >
                {label}
                {counts[key] > 0 && ` ${counts[key]}`}
              </button>
            );
          })}
        </div>
      </div>

      {limitedUntil ? (
        <LimitNotice until={limitedUntil} />
      ) : (
        <>
        {tab === "track" && (
          <div className="flex w-full shrink-0 items-center gap-[12px] text-[8px] tracking-[0.8px] text-on-bright-muted">
            <span className="w-[32px] shrink-0">#</span>
            <span className="w-[32px] shrink-0" />
            <span className="min-w-px flex-1">TRACK</span>
            {/* one slot per column the rows actually have: a spare spacer here
                pushed ALBUM 74px left of the album text it labels */}
            <span className="w-[180px] shrink-0">ALBUM</span>
            <span className="w-[40px] shrink-0 text-right">TIME</span>
          </div>
        )}

        <div className="h-px w-full shrink-0 bg-rule" />

        <div className="w-full flex-1">
          {tab === "track" && (
            <ul className="flex w-full flex-col">
              {results.tracks.map((t, i) => {
                const locked = lockedOf(t.explicit);
                return (
                <li
                  key={t.id}
                  title={locked ? EXPLICIT_NOTE : undefined}
                  className={`group relative flex h-[52px] items-center gap-[12px] rule-b ${locked ? LOCKED_LOOK : ""}`}
                >
                  <span className="tnum w-[32px] shrink-0 text-[16px] font-black tracking-[-0.4px] text-on-bright">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <Thumb src={t.artwork} />
                  <button
                    type="button"
                    disabled={locked}
                    onClick={() => void play({ uris: [t.uri] })}
                    className="flex min-w-0 flex-1 flex-col items-start gap-px text-left disabled:cursor-default"
                  >
                    <span className="w-full truncate text-[13px] text-on-bright">{t.name}</span>
                    <span className="w-full truncate text-[9px] tracking-[0.4px] text-on-bright-muted">
                      {t.artist}
                      {t.explicit && " · E"}
                    </span>
                  </button>
                  {/* a narrower column starts further right; what no longer fits
                      ends in an ellipsis, and the full name is on the tooltip */}
                  <span
                    title={t.album}
                    className="w-[180px] shrink-0 truncate text-[10px] text-on-bright-muted"
                  >
                    {t.album}
                  </span>
                  <span className="tnum w-[40px] shrink-0 text-right text-[10px] text-on-bright">
                    {clock(t.durationMs)}
                  </span>
                  {/* sits left of the ALBUM column: 40 (TIME) + 12 + 180 (ALBUM) + 12,
                      so it ends where that column begins and covers neither */}
                  <StationButton
                    label={t.name}
                    className="right-[244px]"
                    locked={locked}
                    seed={async () => ({
                      id: t.id,
                      uri: t.uri,
                      name: t.name,
                      artist: t.artist,
                      artwork: t.artwork,
                      durationMs: t.durationMs,
                    })}
                  />
                </li>
                );
              })}
            </ul>
          )}

          {tab === "album" && (
            <ul className="flex w-full flex-col">
              {results.albums.map((a) => (
                <li key={a.id} className="group relative rule-b">
                  <button
                    type="button"
                    onClick={() => router.push(`/album/${a.id}`)}
                    className="flex h-[56px] w-full cursor-pointer items-center gap-[12px] text-left"
                  >
                  <Thumb src={a.artwork} size={40} />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[13px] text-on-bright">{a.name}</span>
                    <span className="truncate text-[9px] text-on-bright-muted">{a.artist}</span>
                  </span>
                  <span className="tnum w-[90px] shrink-0 text-[10px] text-on-bright-muted">
                    {a.releaseDate.slice(0, 4)} · {a.totalTracks}곡
                  </span>
                  <span className="w-[90px] shrink-0 text-right text-[9px] uppercase tracking-[0.6px] text-on-bright-muted">
                    {a.albumType}
                  </span>
                  </button>
                  {/* left of the 연도·곡 수 column: 90 (ALBUM) + 12 + 90 + 12.
                      190 landed inside it, so the button sat on the text */}
                  <StationButton
                    label={a.name}
                    className="right-[204px]"
                    seed={() => seedFrom("album", a.id)}
                  />
                </li>
              ))}
            </ul>
          )}

          {tab === "artist" && (
            <ul className="flex w-full flex-col">
              {results.artists.map((a) => (
                <li key={a.id} className="group relative rule-b">
                  <button
                    type="button"
                    onClick={() => router.push(`/artist/${a.id}`)}
                    className="flex h-[56px] w-full cursor-pointer items-center gap-[12px] text-left"
                  >
                  <span className="relative size-[40px] shrink-0 overflow-hidden rounded-pill bg-artwork">
                    {a.image && (
                      <Image src={a.image} alt="" fill sizes="40px" className="object-cover" unoptimized />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[13px] text-on-bright">{a.name}</span>
                    <span className="truncate text-[9px] text-on-bright-muted">
                      {a.genres.slice(0, 3).join(" · ") || "장르 정보 없음"}
                    </span>
                  </span>
                  <span className="tnum w-[140px] shrink-0 text-right text-[10px] text-on-bright-muted">
                    팔로워 {a.followers.toLocaleString("ko-KR")}
                  </span>
                  </button>
                  <StationButton
                    label={a.name}
                    className="right-[152px]"
                    seed={() => seedFrom("artist", a.id)}
                  />
                  <FollowButton
                    artist={{ id: a.id, name: a.name, image: a.image }}
                    className="absolute right-[236px] top-1/2 -translate-y-1/2"
                  />
                </li>
              ))}
            </ul>
          )}

          {tab === "playlist" && (
            <ul className="flex w-full flex-col">
              {results.playlists.map((p) => (
                <li key={p.id} className="group relative rule-b">
                  <button
                    type="button"
                    onClick={() => router.push(`/playlist/${p.id}`)}
                    className="flex h-[56px] w-full cursor-pointer items-center gap-[12px] text-left"
                  >
                    <Thumb src={p.cover} size={40} />
                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                      <span className="truncate text-[13px] text-on-bright">{p.name}</span>
                      <span className="truncate text-[9px] text-on-bright-muted">
                        {p.owner || "알 수 없음"}
                      </span>
                    </span>
                    <span className="tnum w-[90px] shrink-0 text-right text-[10px] text-on-bright-muted">
                      {p.trackCount}곡
                    </span>
                  </button>
                  <StationButton
                    label={p.name}
                    className="right-[102px]"
                    seed={() => seedFrom("playlist", p.id)}
                  />
                </li>
              ))}
            </ul>
          )}

          {/*
            The foot of the list, which is both the thing that asks for the next
            page and the thing that says it is coming. One sentinel rather than a
            button: the page already scrolls, and a reader who has reached the
            bottom has said what they want.
          */}
          <div ref={moreRef} aria-hidden className="h-px w-full" />

          {(loading || loadingMore) && (
            <p className="flex items-center justify-center gap-[8px] py-[20px] text-[10px] text-on-bright-muted">
              {loading ? "검색 중" : "더 불러오는 중"}
              <LoadingDots size={4} label={loading ? "검색 중" : "더 불러오는 중"} />
            </p>
          )}

          {!loading && !error && counts[tab] === 0 && (
            <p className="pt-[24px] text-center text-[10px] text-on-bright-muted">
              결과가 없습니다
            </p>
          )}
        </div>

        </>
      )}
    </section>
  );
}

/**
 * What the results area says while Spotify is refusing searches.
 *
 * In place of the list rather than above it: an empty list under a notice would
 * read as "no results", which is the one thing it is not.
 */
function LimitNotice({ until }: { until: number }) {
  const router = useRouter();
  return (
    <div className="flex w-full shrink-0 flex-col items-start gap-[14px] rounded-[8px] border-[1.2px] border-dashed border-rule/45 p-[28px]">
      <p className="text-[20px] font-black tracking-[-0.4px] text-on-bright">Spotify 검색을 잠시 쉬어요</p>
      <p className="max-w-[760px] text-[13px] leading-[21px] text-on-bright-muted">
        짧은 시간에 요청이 너무 많이 가서 Spotify가 검색을 잠깐 막았어요. {inText(until)}인 {whenText(until)}부터 다시 검색할 수 있어요.
      </p>
      <p className="text-[13px] leading-[21px] text-on-bright-muted">
        그동안 홈, 좋아요한 곡, 플레이리스트는 그대로 볼 수 있어요.
      </p>
      <div className="flex items-center gap-[8px] pt-[4px]">
        <Link
          href="/"
          className="flex shrink-0 items-center whitespace-nowrap rounded-pill bg-ink px-[18px] py-[9px] text-[11px] tracking-[0.6px] text-on-ink rule"
        >
          홈으로
        </Link>
        <button
          type="button"
          onClick={() => router.back()}
          className="flex shrink-0 cursor-pointer items-center gap-[6px] whitespace-nowrap rounded-pill bg-card px-[18px] py-[9px] text-[11px] tracking-[0.6px] transition-colors rule hover:bg-soft"
        >
          <span aria-hidden>←</span>
          뒤로
        </button>
      </div>
    </div>
  );
}
