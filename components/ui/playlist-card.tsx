"use client";

import Image from "next/image";
import Link from "next/link";
import { SLEEVE_TONES, type Playlist } from "@/lib/data";
import { Icon } from "./icon";

const sleeve: Record<string, string> = {
  mint: "bg-mint",
  gold: "bg-soft",
  pink: "bg-accent",
  violet: "bg-violet",
};

/**
 * One playlist tile. Square sleeve at the design's 140px, fixed width so the
 * rail scrolls rather than stretching covers on a wide screen.
 *
 * Playlists without cover art fall back to the vinyl mark on a tinted sleeve,
 * cycling through the palette so a row of them still reads as a set.
 */
export function PlaylistCard({
  playlist,
  index,
  onPlay,
}: {
  playlist: Playlist;
  index: number;
  onPlay?: (uri: string) => void;
}) {
  const tone = SLEEVE_TONES[index % SLEEVE_TONES.length];

  return (
    <article className="group relative flex w-[140px] shrink-0 snap-start flex-col gap-[8px]">
      {/* the sleeve opens the playlist; the knob on it plays, which is the
          split every other player uses and keeps both within one tile */}
      <Link
        href={`/playlist/${playlist.id}`}
        aria-label={`${playlist.name} 열기`}
        className={`relative aspect-square w-full shrink-0 overflow-hidden rounded-[4px] ${sleeve[tone]}`}
      >
        {playlist.cover ? (
          <Image
            src={playlist.cover}
            alt=""
            fill
            sizes="140px"
            className="object-cover"
            unoptimized
          />
        ) : (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Icon name="release-disc" size={72} />
            <Icon
              name="release-ring"
              size={30}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            />
            <Icon
              name="release-hole"
              size={8}
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            />
          </span>
        )}
      </Link>

      {onPlay && (
        <button
          type="button"
          onClick={() => onPlay(playlist.uri)}
          aria-label={`${playlist.name} 재생`}
          title="재생"
          className="absolute right-[8px] top-[8px] flex size-[30px] items-center justify-center rounded-pill bg-accent opacity-0 transition-opacity group-hover:opacity-100 rule"
        >
          <Icon name="play-sm" size={12} />
        </button>
      )}

      <div className="flex flex-col gap-[2px] text-on-bright">
        <Link href={`/playlist/${playlist.id}`} className="truncate text-[12px]">
          {playlist.name}
        </Link>
        <p className="truncate text-[9px] tracking-[0.4px] text-on-bright-muted">
          {playlist.trackCount}곡
          {playlist.owner ? ` · ${playlist.owner}` : ""}
          {playlist.collaborative ? " · 협업" : ""}
        </p>
      </div>
    </article>
  );
}
