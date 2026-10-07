"use client";

import { PlaylistCard } from "./ui/playlist-card";
import { useSpotify } from "./player/spotify-provider";
import { useHydrated } from "./ui/use-hydrated";

/**
 * The user's own stations and playlists.
 *
 * Sits on the same near-white as the history block, separated by rules top and
 * bottom rather than a colour field — matching Superlike_V1.1.
 */
/** One empty array, so a blank render costs no re-render. */
const NOTHING: never[] = [];

export function MyPlaylist() {
  const {
    connected: session,
    playlists: mine,
    playlistTotal: total,
    playlistsLoaded: loaded,
    playlistError,
    play,
  } = useSpotify();

  /**
   * Browser-only knowledge, held back until React has finished comparing this
   * subtree against the server HTML. Gated here rather than in the provider,
   * which sits outside the Suspense boundary and opens before this is hydrated.
   */
  const hydrated = useHydrated();
  const connected = hydrated && session;
  const playlists = hydrated ? mine : NOTHING;
  const playlistTotal = hydrated ? total : 0;
  const playlistsLoaded = hydrated && loaded;

  const error = hydrated ? playlistError : null;

  const status = error
    ? error
    : !connected
      ? "Spotify를 연결해 주세요"
      : !playlistsLoaded
        ? "불러오는 중…"
        : `SEE ALL ${playlistTotal} PLAYLISTS`;

  return (
    <section className="flex h-[252px] shrink-0 flex-col gap-[12px] overflow-hidden bg-chart p-[16px] rule-y">
      <div className="flex w-full shrink-0 items-center justify-between gap-[10px]">
        <div className="flex shrink-0 items-center gap-[10px]">
          <h2 className="whitespace-nowrap text-[19px] font-black tracking-[-0.4px] text-on-bright">
            MY PLAYLIST
          </h2>
          {playlistsLoaded && playlists.length > 0 && (
            <span className="shrink-0 rounded-pill bg-pink px-[9px] py-[4px] text-[8px] tracking-[0.7px] text-on-bright">
              {playlists.length} SAVED
            </span>
          )}
        </div>

        <span className="flex shrink-0 items-center gap-[8px] whitespace-nowrap">
          <span className="text-[8px] tracking-[0.7px] text-on-bright-muted">
            {status}
          </span>
          {playlistsLoaded && (
            <span aria-hidden className="text-[12px] text-on-bright">
              →
            </span>
          )}
        </span>
      </div>

      <div
        className="scroll-x flex w-full shrink-0 gap-[10px]"
        role="region"
        aria-label="내 플레이리스트"
        tabIndex={0}
      >
        {playlists.map((playlist, i) => (
          <PlaylistCard
            key={playlist.id}
            playlist={playlist}
            index={i}
            onPlay={(uri) => void play({ contextUri: uri })}
          />
        ))}
      </div>
    </section>
  );
}
