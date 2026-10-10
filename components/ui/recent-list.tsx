"use client";

import { RecentRow } from "./recent-row";
import { useSpotify } from "@/components/player/spotify-provider";
import { useHydrated } from "./use-hydrated";
import type { RecentTrack } from "@/lib/data";

/**
 * The listening history as rows, with play and station wired in.
 *
 * Shared by the home block, which shows the first ten, and the history screen,
 * which shows them all — the handlers are identical, so they live here rather
 * than being written twice and drifting.
 */
export function RecentList({
  tracks,
  plays,
  onPlay,
}: {
  tracks: RecentTrack[];
  /** track id → times played; given only by the view that ranks them */
  plays?: Record<string, number>;
  /** for a list that plays on into its next row; a lone track otherwise */
  onPlay?: (uri: string) => void;
}) {
  const { play, startStation, stationBusy } = useSpotify();
  const hydrated = useHydrated();

  return (
    <ul className="flex w-full flex-col">
      {tracks.map((track) => (
        <RecentRow
          key={track.index}
          track={track}
          stationBusy={hydrated && stationBusy !== null}
          plays={plays ? (plays[track.uri.split(":").pop() ?? ""] ?? 0) : undefined}
          onPlay={onPlay ?? ((uri) => void play({ uris: [uri] }))}
          onStation={(t) =>
            void startStation({
              id: t.uri.split(":").pop() ?? t.uri,
              uri: t.uri,
              name: t.title,
              artist: t.artist,
              artwork: t.artwork,
              durationMs: t.durationMs,
            })
          }
        />
      ))}
    </ul>
  );
}
