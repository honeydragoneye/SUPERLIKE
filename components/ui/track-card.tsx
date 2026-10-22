"use client";

import { useEffect, useState } from "react";
import { useSpotify } from "@/components/player/spotify-provider";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useHydrated } from "@/components/ui/use-hydrated";

export type Seed = Parameters<ReturnType<typeof useSpotify>["startStation"]>[0];

/** A song as a list names it: by title and artist, with no Spotify id yet. */
export type TrackCardTrack = {
  title: string;
  artist: string;
  /** a cover to show until (or unless) Spotify's own is found */
  artwork?: string | null;
};

/**
 * The agent picks songs by Last.fm's spelling, which has no Spotify id. A card
 * looks the song up once through the search the rest of the app uses, so it can
 * be played and can seed a station.
 */
export type Found = Seed & {
  /** a cover sized for a card; `artwork` is the small one a list row uses */
  artworkLarge: string | null;
};

const lookups = new Map<string, Promise<Found | null>>();

export function lookUp(track: TrackCardTrack): Promise<Found | null> {
  const key = `${track.title}|${track.artist}`.toLowerCase();
  const known = lookups.get(key);
  if (known) return known;

  const pending = (async (): Promise<Found | null> => {
    const q = encodeURIComponent(`${track.title} ${track.artist}`);
    const res = await fetch(`/api/spotify/search?q=${q}&type=track&limit=1`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { tracks?: (Seed & { artwork: string | null; artworkLarge?: string | null })[] };
    const first = data.tracks?.[0];
    return first
      ? {
          id: first.id,
          uri: first.uri,
          name: first.name,
          artist: first.artist,
          artwork: first.artwork,
          artworkLarge: first.artworkLarge ?? first.artwork,
          durationMs: first.durationMs,
        }
      : null;
  })();
  // a failed lookup is not remembered, so the next card for the same song tries again
  pending.catch(() => lookups.delete(key));
  lookups.set(key, pending);
  return pending;
}

/** The dark sleeve with a pink disc the lists use for a track with no artwork. */
function Sleeve({ src }: { src: string | null }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="size-[34px] shrink-0 rounded-[4px] object-cover" />;
  }
  return (
    <span className="relative flex size-[34px] shrink-0 items-center justify-center rounded-[4px] bg-ink">
      <span className="size-[18px] rounded-full bg-accent-bright" />
      <span className="absolute size-[5px] rounded-full bg-ink" />
    </span>
  );
}

/**
 * One song as a card: its cover, a play button and a STATION button.
 *
 * Used wherever a list names songs without Spotify ids (the chatbot's picks, the
 * weekly chart); the card finds the song on Spotify once the listener is connected.
 */
export function TrackCard({ track, rank }: { track: TrackCardTrack; rank?: number }) {
  const { connected, play, startStation, stationBusy } = useSpotify();
  const hydrated = useHydrated();
  const [seed, setSeed] = useState<Seed | null>(null);
  const [looked, setLooked] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!connected) return;
    let live = true;
    lookUp(track)
      .then((s) => live && (setSeed(s), setLooked(true)))
      .catch(() => live && setLooked(true));
    return () => {
      live = false;
    };
  }, [connected, track]);

  const ready = hydrated && connected && seed !== null;
  // one station at a time: the others look as they did and ignore the press
  const blocked = hydrated && stationBusy !== null && !starting;

  return (
    <li className="flex items-center gap-[8px] rounded-[8px] bg-chart py-[6px] pl-[6px] pr-[8px]">
      {rank !== undefined && (
        <span className="tnum w-[18px] shrink-0 text-right text-[11px] font-black text-on-bright">{rank}</span>
      )}
      <Sleeve src={seed?.artwork ?? track.artwork ?? null} />
      <button
        type="button"
        disabled={!ready}
        title={
          !hydrated || !connected
            ? "Spotify를 연결하면 재생할 수 있어요"
            : looked && !seed
              ? "Spotify에서 이 곡을 찾지 못했어요"
              : "재생"
        }
        onClick={() => seed && void play({ uris: [seed.uri] })}
        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-px text-left disabled:cursor-default"
      >
        <span className="w-full truncate text-[10px] text-on-bright">{track.title}</span>
        <span className="w-full truncate text-[8px] tracking-[0.5px] text-on-bright-muted">{track.artist}</span>
      </button>
      <button
        type="button"
        disabled={!ready}
        aria-label={`${track.title} 재생`}
        title={
          !hydrated || !connected
            ? "Spotify를 연결하면 재생할 수 있어요"
            : looked && !seed
              ? "Spotify에서 이 곡을 찾지 못했어요"
              : "재생"
        }
        onClick={() => seed && void play({ uris: [seed.uri] })}
        className="flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-pill bg-ink text-paper-solid transition-colors enabled:hover:bg-accent-bright disabled:cursor-default disabled:opacity-40"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="ml-[1px]">
          <path d="M2 1 9 5 2 9Z" fill="currentColor" />
        </svg>
      </button>
      {ready && (
        <button
          type="button"
          disabled={starting}
          title={starting ? "스테이션 구성 중…" : `${track.title} 기준으로 스테이션 시작`}
          aria-disabled={blocked || undefined}
          onClick={async () => {
            if (blocked || !seed) return;
            setStarting(true);
            try {
              await startStation(seed);
            } finally {
              setStarting(false);
            }
          }}
          className={`flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-pill bg-accent px-[10px] py-[4px] text-[8px] tracking-[0.6px] text-paper-solid transition-colors rule disabled:opacity-100 ${
            blocked ? "cursor-default" : "cursor-pointer enabled:hover:bg-ink"
          }`}
        >
          {starting ? (
            <>
              구성 중
              <LoadingDots size={3} label="스테이션 구성 중" />
            </>
          ) : (
            "STATION"
          )}
        </button>
      )}
    </li>
  );
}

