"use client";

import { useState } from "react";
import { useSpotify } from "@/components/player/spotify-provider";

/**
 * The pink "start a station from this" control.
 *
 * Hidden until the row is hovered, because a list of fifty rows with fifty
 * standing buttons reads as noise — the row is the subject, this is what you
 * can do to it. It sits absolutely inside a `group relative` row so it can
 * overlay without being nested in the row's own button, which HTML forbids.
 *
 * `seed` may be async: an album or an artist has no track to start from until
 * one is fetched, and the button shows that work rather than appearing dead.
 */
export function StationButton({
  seed,
  label,
  className = "right-[12px]",
}: {
  seed: () => Promise<Parameters<ReturnType<typeof useSpotify>["startStation"]>[0] | null>;
  /** what the station would be built from, for the tooltip */
  label: string;
  /** where it sits in the row — rows with trailing columns push it left */
  className?: string;
}) {
  const { startStation, stationBusy } = useSpotify();
  const [resolving, setResolving] = useState(false);
  const busy = resolving || stationBusy !== null;

  return (
    <button
      type="button"
      disabled={busy}
      title={busy ? "스테이션 구성 중…" : `${label} 기준으로 스테이션 시작`}
      onClick={async (e) => {
        e.stopPropagation();
        setResolving(true);
        try {
          const track = await seed();
          if (track) await startStation(track);
        } finally {
          setResolving(false);
        }
      }}
      className={`absolute top-1/2 -translate-y-1/2 rounded-pill bg-pink px-[10px] py-[4px] text-[8px] tracking-[0.6px] text-paper-solid opacity-0 transition-[opacity,background-color] group-hover:opacity-100 enabled:hover:bg-ink disabled:opacity-40 disabled:group-hover:opacity-40 ${className}`}
    >
      {busy ? "구성 중" : "STATION"}
    </button>
  );
}

/**
 * Seeds a station from a screen that only knows an id.
 *
 * An album, an artist or a playlist is not a track, so the station needs one
 * fetched before it can start. Each of those screens already has a route that
 * returns its tracks, so this borrows them rather than adding more.
 */
export async function seedFrom(
  kind: "artist" | "album" | "playlist",
  id: string,
): Promise<Parameters<ReturnType<typeof useSpotify>["startStation"]>[0] | null> {
  try {
    const res = await fetch(`/api/spotify/${kind}/${id}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      name?: string;
      topTracks?: { id: string; uri: string; name: string; artwork: string | null; durationMs: number }[];
      tracks?: {
        id: string;
        uri: string;
        name: string;
        artist?: string;
        artwork?: string | null;
        durationMs: number;
      }[];
      artists?: { name: string }[];
    };

    const first = data.topTracks?.[0] ?? data.tracks?.[0];
    if (!first) return null;

    return {
      id: first.id,
      uri: first.uri,
      name: first.name,
      artist:
        ("artist" in first && first.artist) ||
        data.artists?.map((a) => a.name).join(", ") ||
        data.name ||
        "",
      artwork: ("artwork" in first ? first.artwork : null) ?? null,
      durationMs: first.durationMs,
    };
  } catch {
    return null;
  }
}
