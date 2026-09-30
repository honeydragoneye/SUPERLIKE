"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StationCandidate } from "@/app/api/station/similar/route";

/** Target length of the upcoming queue. */
export const QUEUE_TARGET = 10;
/** Refill once the queue drops to this. */
export const REFILL_WHEN = 2;

export type StationSeed = {
  id: string;
  uri: string;
  name: string;
  artist: string;
  artwork: string | null;
  durationMs: number;
};

export type StationState = {
  seed: StationSeed | null;
  /** what played most recently — later refills branch off this, not the seed */
  lastPlayed: StationSeed | null;
  /** Spotify ids already used, so a refill never repeats a track */
  seenIds: Set<string>;
  /** Last.fm "name|artist" keys, deduped before the Spotify lookup costs a call */
  seenLfm: Set<string>;
};

const emptyState = (): StationState => ({
  seed: null,
  lastPlayed: null,
  seenIds: new Set(),
  seenLfm: new Set(),
});

async function fetchCandidates(
  body: Record<string, unknown>,
): Promise<StationCandidate[]> {
  const res = await fetch("/api/station/similar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { candidates?: StationCandidate[] };
  return data.candidates ?? [];
}

/**
 * The station queue.
 *
 * Deliberately separate from Spotify's own queue: the upcoming list is ours to
 * rebuild when a filter changes, and the track playing right now must never be
 * disturbed by that. Playback is driven one track at a time so the app stays
 * the authority on what comes next.
 */
export function useStation({
  onPlay,
  currentUri,
  isPaused,
  positionMs,
  repeatOne,
  shuffled,
}: {
  onPlay: (uri: string) => Promise<void>;
  currentUri: string | null;
  isPaused: boolean;
  positionMs: number;
  /** 한 곡 반복: a finished track starts over instead of yielding to the queue */
  repeatOne: boolean;
  /** shuffle is on, so refills must be mixed in rather than appended in order */
  shuffled: boolean;
}) {
  const stationRef = useRef<StationState>(emptyState());
  /** tracks already played, newest last — powers the previous button */
  const historyRef = useRef<StationCandidate[]>([]);
  const [queue, setQueue] = useState<StationCandidate[]>([]);
  /** the seed track itself: the label is derived, the station view needs the rest */
  const [seed, setSeed] = useState<StationSeed | null>(null);
  const seedLabel = seed ? `${seed.name} — ${seed.artist}` : null;
  const [busy, setBusy] = useState<string | null>(null);

  // mirrored in an effect rather than during render: callbacks below run after
  // commit, so the committed value is the one they should act on
  const queueRef = useRef<StationCandidate[]>([]);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);
  const fillingRef = useRef(false);
  // read inside fillQueue, which is memoised and must not re-create on toggle
  const shuffledRef = useRef(shuffled);
  useEffect(() => {
    shuffledRef.current = shuffled;
  }, [shuffled]);

  /** Pull more candidates, branching off the last played track. */
  const fillQueue = useCallback(async (initial: boolean) => {
    const station = stationRef.current;
    if (!station.seed || fillingRef.current) return;
    fillingRef.current = true;
    setBusy(initial ? "스테이션 구성 중…" : "큐 리필 중…");

    try {
      const basis = initial ? station.seed : (station.lastPlayed ?? station.seed);
      const ask = (name: string, artist: string, limit: number) =>
        fetchCandidates({
          source: "similar",
          trackName: name,
          artistName: artist,
          limit,
          seenIds: [...station.seenIds],
          seenLfm: [...station.seenLfm],
        });

      let found = await ask(basis.name, basis.artist, QUEUE_TARGET);

      // a weak basis can come back short; the seed is the reliable fallback
      if (!initial && found.length < QUEUE_TARGET && station.seed.id !== basis.id) {
        found = found.concat(
          await ask(station.seed.name, station.seed.artist, QUEUE_TARGET - found.length),
        );
      }

      found.forEach((c) => {
        station.seenIds.add(c.id);
        station.seenLfm.add(c.lfmKey);
      });
      if (found.length) {
        setQueue((q) => {
          const merged = [...q, ...found];
          if (!shuffledRef.current) return merged;
          // appending in order would leave a sorted tail behind a shuffled head
          for (let i = merged.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [merged[i], merged[j]] = [merged[j], merged[i]];
          }
          return merged;
        });
      }
    } finally {
      fillingRef.current = false;
      setBusy(null);
    }
  }, []);

  /**
   * Reorders what is coming up.
   *
   * With an app-managed queue this is a plain array shuffle: nothing is sent to
   * Spotify, the current track keeps playing, and the new order is visible in
   * the list immediately. Spotify's own shuffle cannot do this — it never
   * reports the order it chose.
   */
  const shuffleQueue = useCallback(() => {
    setQueue((list) => {
      const next = list.slice();
      for (let i = next.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [next[i], next[j]] = [next[j], next[i]];
      }
      return next;
    });
  }, []);

  /**
   * Advance to a specific track, or the head of the queue.
   *
   * Jumping ahead consumes everything before the target too — picking the third
   * row means the first two were skipped, so up-next resumes from the fourth
   * rather than replaying what the user passed over.
   */
  const playFromQueue = useCallback(
    async (target?: StationCandidate) => {
      const list = queueRef.current;
      const next = target ?? list[0];
      if (!next) return;

      const at = list.findIndex((t) => t.id === next.id);
      setQueue(at >= 0 ? list.slice(at + 1) : list.filter((t) => t.id !== next.id));
      historyRef.current.push(next);
      stationRef.current.lastPlayed = {
        id: next.id,
        uri: next.uri,
        name: next.name,
        artist: next.artist,
        artwork: next.artwork,
        durationMs: next.durationMs,
      };
      await onPlay(next.uri);

      if (queueRef.current.length - 1 <= REFILL_WHEN) void fillQueue(false);
    },
    [onPlay, fillQueue],
  );

  /** Steps back through what has played, returning the current track to the queue. */
  const playPrevious = useCallback(async () => {
    const hist = historyRef.current;
    if (hist.length < 2) return false;
    const current = hist.pop()!;
    const target = hist[hist.length - 1];
    setQueue((list) => [current, ...list]);
    stationRef.current.lastPlayed = {
      id: target.id,
      uri: target.uri,
      name: target.name,
      artist: target.artist,
      artwork: target.artwork,
      durationMs: target.durationMs,
    };
    await onPlay(target.uri);
    return true;
  }, [onPlay]);

  const startStation = useCallback(
    async (seed: StationSeed) => {
      stationRef.current = {
        seed,
        lastPlayed: seed,
        seenIds: new Set([seed.id]),
        seenLfm: new Set(),
      };
      setQueue([]);
      historyRef.current = [
        {
          id: seed.id,
          uri: seed.uri,
          name: seed.name,
          artist: seed.artist,
          artwork: seed.artwork,
          durationMs: seed.durationMs,
          lfmKey: `${seed.name}|${seed.artist}`.toLowerCase(),
        },
      ];
      setSeed(seed);
      await onPlay(seed.uri);
      await fillQueue(true);
    },
    [onPlay, fillQueue],
  );

  const stopStation = useCallback(() => {
    stationRef.current = emptyState();
    historyRef.current = [];
    setQueue([]);
    setSeed(null);
  }, []);

  /**
   * Track-end detection.
   *
   * The SDK has no "ended" event; a finished track surfaces as the same track
   * flipping to paused at position 0. The 2s guard stops the repeated state
   * pushes around that moment from advancing the queue more than once.
   */
  const prev = useRef<{ uri: string | null; paused: boolean; position: number }>({
    uri: null,
    paused: true,
    position: 0,
  });
  const lastEndAt = useRef(0);

  useEffect(() => {
    const before = prev.current;
    prev.current = { uri: currentUri, paused: isPaused, position: positionMs };

    if (!stationRef.current.seed) return;
    if (!currentUri || before.uri !== currentUri) return;
    if (!(before.paused === false && isPaused && positionMs === 0)) return;

    const now = Date.now();
    if (now - lastEndAt.current < 2000) return;
    lastEndAt.current = now;

    // the queue drives playback here, so repeat-one has to be honoured by us
    if (repeatOne) {
      void onPlay(currentUri);
      return;
    }
    void playFromQueue();
  }, [currentUri, isPaused, positionMs, repeatOne, onPlay, playFromQueue]);

  return {
    queue,
    setQueue,
    seed,
    seedLabel,
    busy,
    isActive: seed !== null,
    station: stationRef,
    startStation,
    stopStation,
    playFromQueue,
    playPrevious,
    shuffleQueue,
    fillQueue,
  };
}
