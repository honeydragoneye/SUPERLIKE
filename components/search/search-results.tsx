"use client";

import Image from "next/image";
import { clock } from "@/lib/time";
import { useSpotify } from "@/components/player/spotify-provider";
import { useSearch, type SearchTab } from "./search-provider";
import { useRouter } from "next/navigation";

const TABS: { key: SearchTab; label: string }[] = [
  { key: "track", label: "곡" },
  { key: "album", label: "앨범" },
  { key: "artist", label: "아티스트" },
  { key: "playlist", label: "플레이리스트" },
];

function Thumb({ src, size = 32 }: { src: string | null; size?: number }) {
  return (
    <span
      className="relative shrink-0 overflow-hidden rounded-[4px] bg-ink"
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
  const { query, results, loading, error, tab, setTab, total } = useSearch();
  const router = useRouter();
  const { play, startStation, stationBusy } = useSpotify();

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
          <p className="whitespace-nowrap text-[8px] tracking-[0.7px] text-on-bright-muted">
            {error
              ? error
              : loading
                ? `"${query}" 검색 중…`
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
                  active ? "bg-ink text-paper" : "bg-gold text-on-bright"
                }`}
              >
                {label}
                {counts[key] > 0 && ` ${counts[key]}`}
              </button>
            );
          })}
        </div>
      </div>

      {tab === "track" && (
        <div className="flex w-full shrink-0 items-center gap-[12px] text-[8px] tracking-[0.8px] text-on-bright-muted">
          <span className="w-[32px] shrink-0">#</span>
          <span className="w-[32px] shrink-0" />
          <span className="min-w-px flex-1">TRACK</span>
          <span className="w-[240px] shrink-0">ALBUM</span>
          <span className="w-[62px] shrink-0" />
          <span className="w-[40px] shrink-0 text-right">TIME</span>
        </div>
      )}

      <div className="h-px w-full shrink-0 bg-ink" />

      <div className="w-full flex-1">
        {tab === "track" && (
          <ul className="flex w-full flex-col">
            {results.tracks.map((t, i) => (
              <li key={t.id} className="flex h-[52px] items-center gap-[12px] rule-b">
                <span className="tnum w-[32px] shrink-0 text-[16px] font-black tracking-[-0.4px] text-on-bright">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <Thumb src={t.artwork} />
                <button
                  type="button"
                  onClick={() => void play({ uris: [t.uri] })}
                  className="flex min-w-0 flex-1 flex-col items-start gap-px text-left"
                >
                  <span className="w-full truncate text-[13px] text-on-bright">{t.name}</span>
                  <span className="w-full truncate text-[9px] tracking-[0.4px] text-on-bright-muted">
                    {t.artist}
                    {t.explicit && " · E"}
                  </span>
                </button>
                <span className="w-[240px] shrink-0 truncate text-[10px] text-on-bright-muted">
                  {t.album}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    void startStation({
                      id: t.id,
                      uri: t.uri,
                      name: t.name,
                      artist: t.artist,
                      artwork: t.artwork,
                      durationMs: t.durationMs,
                    })
                  }
                  disabled={stationBusy !== null}
                  title={
                    stationBusy
                      ? "스테이션 구성 중…"
                      : `${t.name} 기준으로 스테이션 시작`
                  }
                  className="w-[62px] shrink-0 rounded-pill bg-pink py-[6px] text-[8px] tracking-[0.7px] text-paper transition-colors enabled:hover:bg-ink disabled:opacity-40"
                >
                  {stationBusy ? "구성 중" : "STATION"}
                </button>
                <span className="tnum w-[40px] shrink-0 text-right text-[10px] text-on-bright">
                  {clock(t.durationMs)}
                </span>
              </li>
            ))}
          </ul>
        )}

        {tab === "album" && (
          <ul className="flex w-full flex-col">
            {results.albums.map((a) => (
              <li key={a.id} className="rule-b">
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
              </li>
            ))}
          </ul>
        )}

        {tab === "artist" && (
          <ul className="flex w-full flex-col">
            {results.artists.map((a) => (
              <li key={a.id} className="rule-b">
                <button
                  type="button"
                  onClick={() => router.push(`/artist/${a.id}`)}
                  className="flex h-[56px] w-full cursor-pointer items-center gap-[12px] text-left"
                >
                <span className="relative size-[40px] shrink-0 overflow-hidden rounded-pill bg-ink">
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
              </li>
            ))}
          </ul>
        )}

        {tab === "playlist" && (
          <ul className="flex w-full flex-col">
            {results.playlists.map((p) => (
              <li key={p.id} className="flex h-[56px] items-center gap-[12px] rule-b">
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
              </li>
            ))}
          </ul>
        )}

        {!loading && !error && counts[tab] === 0 && (
          <p className="pt-[24px] text-center text-[10px] text-on-bright-muted">
            결과가 없습니다
          </p>
        )}
      </div>

      <div className="flex w-full shrink-0 items-center justify-between whitespace-nowrap">
        <span className="rounded-pill bg-ink px-[14px] py-[7px] text-[8px] tracking-[0.8px] text-paper-solid">
          {counts[tab]}건 표시
        </span>
        <p className="text-[9px] tracking-[0.6px] text-on-bright-muted">
          10건씩 표시 · Spotify 검색 상한
        </p>
      </div>
    </section>
  );
}
