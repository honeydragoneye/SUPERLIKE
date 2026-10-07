"use client";

import { useSpotify } from "./player/spotify-provider";
import { useHydrated } from "./ui/use-hydrated";
import { DetailShell } from "./detail/detail-shell";
import { RecentList } from "./ui/recent-list";

/**
 * The whole listening history, on its own screen.
 *
 * Home keeps the first ten so the page stays short; everything Spotify returns
 * — up to fifty, once repeats are collapsed — lives here.
 */
export function HistoryPage() {
  const { connected: session, recent, recentLive: live, recentError, play } = useSpotify();
  /**
   * The session is the browser's to know, so this screen renders what the
   * server rendered until React has finished comparing the two. Gated here
   * rather than in the provider, which sits outside the Suspense boundary and
   * opens before this subtree is hydrated.
   */
  const hydrated = useHydrated();
  const connected = hydrated && session;
  const tracks = hydrated && live ? recent : [];
  const playable = tracks.filter((t) => t.uri);

  return (
    <DetailShell
      eyebrow="HISTORY"
      title="최근 재생 목록"
      subtitle={
        recentError
          ? recentError
          : !connected
            ? "Spotify를 연결해 주세요"
            : tracks.length
              ? `${tracks.length} TRACKS · MY LIBRARY · SPOTIFY`
              : "불러오는 중…"
      }
      aside={
        playable.length ? (
          <button
            type="button"
            onClick={() =>
              void play({
                uris: playable.map((t) => t.uri),
                tracks: playable.map((t) => ({
                  uri: t.uri,
                  title: t.title,
                  artist: t.artist,
                  artwork: t.artwork,
                  durationMs: t.durationMs,
                })),
              })
            }
            className="shrink-0 whitespace-nowrap rounded-pill bg-ink px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-paper-solid"
          >
            전체 재생
          </button>
        ) : null
      }
    >
      <div className="flex w-full shrink-0 items-center gap-[12px] overflow-hidden pb-[2px] text-[8px] tracking-[0.8px]">
        <span className="w-[32px] shrink-0">#</span>
        <span className="w-[32px] shrink-0" />
        <span className="min-w-px flex-1">TRACK</span>
        <span className="w-[72px] shrink-0 text-right">PLAYED</span>
        <span className="w-[40px] shrink-0 text-right">TIME</span>
      </div>

      <RecentList tracks={tracks} />
    </DetailShell>
  );
}
