"use client";

import { useEffect, useState } from "react";
import { useSpotify } from "@/components/player/spotify-provider";
import { LoadingDots } from "@/components/ui/loading-dots";
import { EXPLICIT_NOTE, LOCKED_LOOK, useExplicitLock } from "@/components/ui/explicit";
import { useHydrated } from "@/components/ui/use-hydrated";
import { nameMatch, sameTitle } from "@/lib/names";

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
  /** what Spotify says the song belongs to: the album, and the first artist, by id and name */
  album: string;
  albumId: string | null;
  artistId: string | null;
  artistName: string;
  /** Spotify marks the song 19금 */
  explicit: boolean;
};

const lookups = new Map<string, Promise<Found | null>>();
/** The songs that have been found, so the pages around them can be linked from what Spotify already said. */
const resolved = new Set<Found>();

/** Waits for every song being looked up right now, and hands back all the songs found so far. */
export async function foundSongs(): Promise<Found[]> {
  await Promise.allSettled([...lookups.values()]);
  return [...resolved];
}

export function lookUp(track: TrackCardTrack): Promise<Found | null> {
  const key = `${track.title}|${track.artist}`.toLowerCase();
  const known = lookups.get(key);
  if (known) return known;

  const pending = (async (): Promise<Found | null> => {
    type Raw = Seed & {
      artwork: string | null;
      artworkLarge?: string | null;
      album?: string;
      albumId?: string | null;
      artistId?: string | null;
      artistName?: string;
      explicit?: boolean;
    };
    const search = async (q: string, limit: number): Promise<Raw[]> => {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(q)}&type=track&limit=${limit}`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return ((await res.json()) as { tracks?: Raw[] }).tracks ?? [];
    };
    /*
      Spotify files Korean artists under romanised names (아이유 is IU), so a Hangul artist is asked about first:
      the name Spotify ranks first for it is accepted, and searched, as well as the one the agent gave.
    */
    const artistNames = [track.artist];
    if (/[\u3131-\u318e\uac00-\ud7a3]/.test(track.artist)) {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(track.artist)}&type=artist&limit=3`, { cache: "no-store" });
      if (res.ok) {
        const top = ((await res.json()) as { artists?: { name: string }[] }).artists?.[0];
        if (top && !artistNames.includes(top.name)) artistNames.push(top.name);
      }
    }
    const sameArtist = (t: Raw) => artistNames.some((n) => nameMatch([n], t.artistName ?? t.artist) !== null || nameMatch([n], t.artist) !== null);
    const isSong = (t: Raw) => sameTitle(track.title, t.name);

    /*
      A song the agent names is a song that exists, so a miss here is a failure
      of the search and not of the song. The name is tried several ways before
      giving up, from the exact one outward: with Spotify's own title and artist
      fields; as plain words; by title alone, keeping the ones by this artist;
      and by artist alone, keeping the ones with this title. The first try that
      finds a song whose title says the same thing wins.
    */
    const tries: { q: string; limit: number; keep: (t: Raw) => boolean }[] = artistNames.flatMap((name) => [
      { q: `track:"${track.title}" artist:"${name}"`, limit: 5, keep: (t: Raw) => isSong(t) && (name === track.artist || sameArtist(t)) },
      { q: `${track.title} ${name}`, limit: 5, keep: (t: Raw) => isSong(t) && sameArtist(t) },
    ]);
    tries.push(
      { q: track.title, limit: 10, keep: (t) => isSong(t) && sameArtist(t) },
      ...artistNames.map((name) => ({ q: `artist:"${name}"`, limit: 10, keep: isSong })),
    );
    /*
      Last resort, for a Hangul title: Spotify often lists the song under an English title (밤편지 is "Through the
      Night"), so no title can be compared. It still finds the song by the Hangul, so the first result by this artist wins.
    */
    if (/[\u3131-\u318e\uac00-\ud7a3]/.test(track.title)) {
      tries.push(...artistNames.map((name) => ({ q: `${track.title} ${name}`, limit: 5, keep: sameArtist })));
    }
    let first: Raw | undefined;
    for (const t of tries) {
      const found = (await search(t.q, t.limit)).find(t.keep);
      if (found) {
        first = found;
        break;
      }
    }
    if (!first) return null;
    const song: Found = {
      id: first.id,
      uri: first.uri,
      name: first.name,
      artist: first.artist,
      artwork: first.artwork,
      artworkLarge: first.artworkLarge ?? first.artwork,
      durationMs: first.durationMs,
      album: first.album ?? "",
      albumId: first.albumId ?? null,
      artistId: first.artistId ?? null,
      artistName: first.artistName ?? first.artist,
      explicit: first.explicit === true,
    };
    resolved.add(song);
    return song;
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
    <span className="relative flex size-[34px] shrink-0 items-center justify-center rounded-[4px] bg-artwork">
      <span className="size-[18px] rounded-full bg-accent-bright" />
      <span className="absolute size-[5px] rounded-full bg-artwork" />
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
  const [explicit, setExplicit] = useState(false);
  const locked = useExplicitLock()(explicit);

  useEffect(() => {
    if (!connected) return;
    let live = true;
    lookUp(track)
      .then((s) => live && (setSeed(s), setExplicit(s?.explicit === true), setLooked(true)))
      .catch(() => live && setLooked(true));
    return () => {
      live = false;
    };
  }, [connected, track]);

  const ready = hydrated && connected && seed !== null && !locked;
  // one station at a time: the others look as they did and ignore the press
  const blocked = hydrated && stationBusy !== null && !starting;

  return (
    <li
      title={locked ? EXPLICIT_NOTE : undefined}
      className={`flex items-center gap-[8px] rounded-[8px] bg-chart py-[6px] pl-[6px] pr-[8px] ${locked ? LOCKED_LOOK : ""}`}
    >
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
        className="flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-pill bg-ink text-on-ink transition-colors enabled:hover:bg-accent-bright enabled:hover:text-paper-solid disabled:cursor-default disabled:opacity-40"
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

