"use client";

import Image from "next/image";
import { useState } from "react";
import { useLikedTracks } from "@/components/player/use-likes";
import { usePlaysTotal } from "@/components/player/use-listening";
import { useSpotify, type QueueTrack } from "@/components/player/spotify-provider";
import { Icon } from "@/components/ui/icon";
import { RecentList } from "@/components/ui/recent-list";
import { SLEEVE_TONES, type RecentTrack } from "@/lib/data";
import type { LikedTrack } from "@/lib/likes";
import { SectionHead, ViewToggle } from "./section-head";

/**
 * The most rows one play request carries.
 *
 * A hundred is the longest list this app has handed Spotify and seen accepted;
 * past that is unmeasured, and a refused request plays nothing at all. Starting
 * from the pressed row, a hundred is also several hours of music.
 */
const MAX_URIS = 100;

const sleeve: Record<string, string> = {
  mint: "bg-mint",
  gold: "bg-soft",
  pink: "bg-accent",
  violet: "bg-violet",
};

/**
 * Everything marked with the heart, newest first.
 *
 * Covers on a rail by default — a shelf to glance along — and the full table
 * on request, where the play counts show which of them were liked and then
 * left alone.
 *
 * No hydration gate of its own: both stores hand React an empty server
 * snapshot, so the first render matches the HTML by construction.
 */
export function LikedTracks() {
  const liked = useLikedTracks();
  const totals = usePlaysTotal();
  const { play } = useSpotify();
  const [listed, setListed] = useState(false);

  const queue: QueueTrack[] = liked.map((t) => ({
    uri: t.uri,
    title: t.title,
    artist: t.artist,
    artwork: t.artwork,
    durationMs: t.durationMs,
  }));

  /** Plays on down the list from the pressed row, the way an album would. */
  const playFrom = (uri: string) => {
    const at = Math.max(
      queue.findIndex((t) => t.uri === uri),
      0,
    );
    const rest = queue.slice(at, at + MAX_URIS);
    if (rest.length) void play({ uris: rest.map((t) => t.uri), tracks: rest });
  };

  const rows: RecentTrack[] = liked.map((t, i) => ({
    index: String(i + 1).padStart(2, "0"),
    title: t.title,
    artist: t.artist,
    artwork: t.artwork,
    artworkLarge: t.artwork,
    playedAt: new Date(t.at).toISOString(),
    durationMs: t.durationMs,
    uri: t.uri,
  }));

  return (
    <section
      className={`flex w-full shrink-0 flex-col gap-[16px] px-[24px] pb-[24px] pt-[20px] ${
        listed ? "" : "min-h-[306px]"
      }`}
    >
      <SectionHead title="좋아요한 곡" note={`${liked.length}곡 · 최근 누른 순`}>
        {listed && liked.length > 0 && (
          <button
            type="button"
            onClick={() => playFrom(liked[0].uri)}
            className="flex h-[26px] cursor-pointer items-center whitespace-nowrap rounded-pill bg-ink px-[12px] text-[9px] tracking-[0.6px] text-on-ink transition-colors hover:bg-accent hover:text-on-bright rule"
          >
            전체 재생
          </button>
        )}
        {liked.length > 0 && (
          <ViewToggle open={listed} onToggle={() => setListed((v) => !v)} />
        )}
      </SectionHead>

      {liked.length === 0 ? (
        <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">
          아직 좋아요한 곡이 없습니다. 재생 중인 곡의 하트를 누르면 여기에 모입니다.
        </p>
      ) : listed ? (
        <div className="flex w-full flex-col gap-[6px]">
          <div className="flex w-full shrink-0 items-center gap-[12px] text-[8px] tracking-[0.8px] text-on-bright-muted">
            <span className="w-[32px] shrink-0">#</span>
            <span className="w-[32px] shrink-0" />
            <span className="min-w-px flex-1">TRACK</span>
            <span className="w-[72px] shrink-0 text-right">PLAYS</span>
            <span className="w-[40px] shrink-0 text-right">TIME</span>
          </div>
          <RecentList tracks={rows} plays={totals} onPlay={playFrom} />
        </div>
      ) : (
        <div
          className="scroll-x flex w-full shrink-0 gap-[10px] pb-[8px]"
          role="region"
          aria-label="좋아요한 곡"
          tabIndex={0}
        >
          {liked.map((track, i) => (
            <LikedCard key={track.id} track={track} index={i} onPlay={playFrom} />
          ))}
        </div>
      )}
    </section>
  );
}

/**
 * One liked track as a sleeve, the same tile the playlist rail uses.
 *
 * The whole sleeve plays: a track has no screen of its own to open, so there
 * is only the one thing for a press to mean.
 */
function LikedCard({
  track,
  index,
  onPlay,
}: {
  track: LikedTrack;
  index: number;
  onPlay: (uri: string) => void;
}) {
  const tone = SLEEVE_TONES[index % SLEEVE_TONES.length];

  return (
    <article className="flex w-[140px] shrink-0 snap-start flex-col gap-[8px]">
      <button
        type="button"
        onClick={() => onPlay(track.uri)}
        aria-label={`${track.title} 재생`}
        title="재생"
        className={`group relative aspect-square w-full shrink-0 cursor-pointer overflow-hidden rounded-[4px] ${sleeve[tone]}`}
      >
        {track.artwork ? (
          <Image
            src={track.artwork}
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
        <span className="absolute right-[8px] top-[100px] flex size-[32px] items-center justify-center rounded-full bg-accent-bright text-paper-solid transition-transform group-hover:scale-105">
          <svg width="11" height="11" viewBox="0 0 10 11" aria-hidden fill="currentColor" className="ml-[2px]">
            <path d="M0 0 10 5.5 0 11z" />
          </svg>
        </span>
      </button>

      <div className="flex flex-col gap-[2px]">
        <p className="truncate text-[12px]" title={track.title}>
          {track.title}
        </p>
        <p
          className="truncate text-[9px] tracking-[0.4px] text-on-bright-muted"
          title={track.artist}
        >
          {track.artist}
        </p>
      </div>
    </article>
  );
}
