"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useSyncExternalStore } from "react";
import { useSearch } from "@/components/search/search-provider";
import { useSpotify } from "@/components/player/spotify-provider";
import type { ArtistPage, SearchAlbum, SearchArtist } from "@/lib/data";
import {
  clearRecent,
  removeRecent,
  serverSnapshot,
  snapshot,
  subscribe,
} from "@/lib/recent-searches";
import { followersLabel, pickEntities } from "@/lib/suggest";
import { RailLabel, RailShell } from "./rail-shell";

const BUTTON =
  "cursor-pointer rounded-pill px-[12px] py-[7px] text-[9px] transition-opacity disabled:cursor-default disabled:opacity-50";

/**
 * Beside the results: the one artist or album the typed name belongs to, big
 * enough to play from, and what was searched before.
 *
 * "The one" is chosen by the same name rules as the suggestion panel — an exact
 * spelling, the best known of namesakes. A query that is a song title has no
 * top result and the block is simply not there.
 */
export function SearchRail() {
  const router = useRouter();
  const { query, results } = useSearch();
  const { play, startStation } = useSpotify();
  const recent = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const [busy, setBusy] = useState<string | null>(null);

  const { artist, albums } = pickEntities(query.trim(), results.artists, results.albums);
  const album = artist ? null : (albums[0] ?? null);

  /** An artist's top songs are not in the search results, so they are fetched when a button needs them. */
  const topTracks = async (a: SearchArtist): Promise<ArtistPage | null> => {
    const res = await fetch(`/api/spotify/artist/${a.id}`, { cache: "no-store" }).catch(() => null);
    return res?.ok ? ((await res.json()) as ArtistPage) : null;
  };

  const playArtist = async (a: SearchArtist, mode: "play" | "station") => {
    setBusy(mode);
    const page = await topTracks(a);
    setBusy(null);
    const tracks = page?.topTracks ?? [];
    if (!tracks.length) return router.push(`/artist/${a.id}`);
    if (mode === "station") {
      const t = tracks[0];
      return void startStation({ id: t.id, uri: t.uri, name: t.name, artist: a.name, artwork: t.artwork, durationMs: t.durationMs });
    }
    void play({
      uris: tracks.map((t) => t.uri),
      tracks: tracks.map((t) => ({ uri: t.uri, title: t.name, artist: a.name, artwork: t.artwork, durationMs: t.durationMs })),
    });
  };

  const playAlbum = (a: SearchAlbum) => void play({ contextUri: a.uri });

  return (
    <RailShell>
      {(artist || album) && (
        <div className="flex shrink-0 flex-col gap-[8px]">
          <RailLabel>TOP RESULT</RailLabel>
          <div className="flex flex-col gap-[10px] rounded-[8px] bg-panel p-[14px] text-on-dark">
            <span
              className={`relative block size-[120px] shrink-0 overflow-hidden bg-artwork ${artist ? "rounded-full" : "rounded-[4px]"}`}
            >
              {(artist?.image ?? album?.artwork) && (
                <Image
                  src={(artist?.image ?? album?.artwork) as string}
                  alt=""
                  fill
                  sizes="120px"
                  className="object-cover"
                  unoptimized
                />
              )}
            </span>
            <span className="text-[24px] font-black leading-[28px] tracking-[-0.6px]">{artist?.name ?? album?.name}</span>
            <span className="text-[9px] font-medium text-on-dark-muted">
              {artist
                ? ["아티스트", artist.genres[0], artist.followers > 0 ? `팔로워 ${followersLabel(artist.followers)}` : ""]
                    .filter(Boolean)
                    .join(" · ")
                : album
                  ? ["앨범", album.artist, album.releaseDate.slice(0, 4)].filter(Boolean).join(" · ")
                  : ""}
            </span>
            <span className="flex flex-wrap gap-[6px]">
              {artist ? (
                <>
                  <button type="button" disabled={busy !== null} onClick={() => void playArtist(artist, "play")} className={`${BUTTON} bg-paper-solid text-black`}>
                    {busy === "play" ? "불러오는 중…" : "인기곡 재생"}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => void playArtist(artist, "station")} className={`${BUTTON} bg-accent-bright text-black`}>
                    {busy === "station" ? "구성 중…" : "스테이션 시작"}
                  </button>
                </>
              ) : (
                album && (
                  <button type="button" onClick={() => playAlbum(album)} className={`${BUTTON} bg-paper-solid text-black`}>
                    앨범 재생
                  </button>
                )
              )}
              <button
                type="button"
                onClick={() => router.push(artist ? `/artist/${artist.id}` : `/album/${album?.id}`)}
                className={`${BUTTON} border border-on-dark/50 text-on-dark`}
              >
                페이지 →
              </button>
            </span>
          </div>
        </div>
      )}

      <div className="flex shrink-0 flex-col gap-[6px]">
        <RailLabel>RECENT SEARCHES</RailLabel>
        {recent.length === 0 ? (
          <p className="text-[10px] font-medium text-on-bright-muted">아직 검색한 말이 없습니다</p>
        ) : (
          <>
            <ul className="flex flex-col">
              {recent.map((q) => (
                <li key={q} className="group flex items-center gap-[8px] py-[5px]">
                  <span aria-hidden className="text-[10px] text-on-bright-muted">
                    ↺
                  </span>
                  <button
                    type="button"
                    onClick={() => router.push(`/search?q=${encodeURIComponent(q)}`)}
                    className="min-w-0 flex-1 cursor-pointer truncate text-left text-[11px] font-medium hover:underline"
                  >
                    {q}
                  </button>
                  <button
                    type="button"
                    aria-label={`${q} 지우기`}
                    onClick={() => removeRecent(q)}
                    className="cursor-pointer text-[9px] text-on-bright-muted transition-colors hover:text-on-bright"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={clearRecent}
              className="w-fit cursor-pointer text-[9px] text-on-bright-muted transition-colors hover:text-on-bright"
            >
              모두 지우기
            </button>
          </>
        )}
        <p className="text-[8px] font-medium text-on-bright-muted">이 기기에만 저장돼요</p>
      </div>
    </RailShell>
  );
}
