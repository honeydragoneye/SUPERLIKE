"use client";

import { useState } from "react";
import { useSpotify } from "@/components/player/spotify-provider";
import { LoadingDots } from "@/components/ui/loading-dots";
import { PlaylistCard } from "@/components/ui/playlist-card";
import { useHydrated } from "@/components/ui/use-hydrated";
import { SectionHead, ViewToggle } from "./section-head";

/** One empty array, so a blank render costs no re-render. */
const NOTHING: never[] = [];

/**
 * The playlists this account made, on the same rail as the liked covers.
 *
 * Read from the provider, which already fetched them for the home screen —
 * coming here asks Spotify for nothing new.
 */
export function PlaylistShelf() {
  const {
    connected: session,
    playlists: mine,
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
  const playlistsLoaded = hydrated && loaded;
  const error = hydrated ? playlistError : null;

  const [all, setAll] = useState(false);

  const note = error ? (
    error
  ) : !connected ? (
    "Spotify를 연결해 주세요"
  ) : !playlistsLoaded ? (
    <>
      불러오는 중
      <LoadingDots size={3} />
    </>
  ) : (
    `${playlists.length}개 · 내가 만든 목록`
  );

  return (
    <section className="flex min-h-[306px] w-full flex-1 flex-col gap-[16px] px-[24px] pb-[24px] pt-[20px]">
      <SectionHead title="내 플레이리스트" note={note}>
        {playlists.length > 0 && (
          <ViewToggle open={all} onToggle={() => setAll((v) => !v)} />
        )}
      </SectionHead>

      {playlistsLoaded && !error && playlists.length === 0 ? (
        <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">
          직접 만든 플레이리스트가 없습니다.
        </p>
      ) : (
        <div
          className={
            all
              ? "flex w-full flex-wrap gap-x-[10px] gap-y-[16px]"
              : "scroll-x flex w-full shrink-0 gap-[10px] pb-[8px]"
          }
          role="region"
          aria-label="내 플레이리스트"
          tabIndex={all ? undefined : 0}
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
      )}
    </section>
  );
}
