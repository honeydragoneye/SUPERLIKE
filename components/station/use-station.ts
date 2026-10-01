"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StationCandidate } from "@/lib/station/types";
import { matchesFilter, type FilterKind } from "@/lib/station/filter";

/** Target length of the upcoming queue. */
export const QUEUE_TARGET = 10;
/** Refill once the queue drops to this. */
export const REFILL_WHEN = 2;

/**
 * What a play attempt did.
 *
 * Only `refused` means Spotify looked at the track and said no; `unavailable`
 * means the request never got that far (no device yet), which must not cost the
 * queue a track.
 */
export type PlayOutcome = "played" | "refused" | "unavailable";
/**
 * How many refusals in a row to ride out before giving up.
 *
 * Spotify answers 403 for anything the account may not play — an explicit track
 * on a filtered account, a release with no local licence. Its own apps skip
 * those silently; this queue has to do the same or it stops dead on one track.
 */
const MAX_SKIPS = 5;

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

async function fetchLadder(body: Record<string, unknown>): Promise<StationCandidate[]> {
  const res = await fetch("/api/station/queue", {
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
 * Applies a filter to tracks already in the queue.
 *
 * A verdict the ladder already paid for travels on the candidate, so only the
 * tracks that have never been judged cost a request. After the first pass every
 * track carries its verdict and switching filters again is free — which is the
 * difference between an 18 second round trip and none.
 */
async function keepMatching(
  tracks: StationCandidate[],
  filter: FilterKind,
): Promise<StationCandidate[]> {
  if (filter === null || tracks.length === 0) return tracks;

  const judged = tracks.filter((t) => t.instrumental !== undefined);
  const unjudged = tracks.filter((t) => t.instrumental === undefined);

  let verdicts = new Map<string, boolean | null>();
  if (unjudged.length) {
    const res = await fetch("/api/station/lyrics", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        tracks: unjudged.map((t) => ({
          id: t.id,
          name: t.name,
          artist: t.artist,
          durationMs: t.durationMs,
        })),
        filter,
      }),
      cache: "no-store",
    });
    if (!res.ok) return tracks; // a failed check must not empty the queue
    const data = (await res.json()) as {
      results?: { id: string; instrumental: boolean | null }[];
    };
    verdicts = new Map((data.results ?? []).map((r) => [r.id, r.instrumental]));
  }

  // remember every verdict on the candidate, so the next switch asks for nothing
  const scored = [
    ...judged,
    ...unjudged.map((t) => ({ ...t, instrumental: verdicts.get(t.id) ?? null })),
  ];
  const order = new Map(tracks.map((t, i) => [t.id, i]));
  return scored
    .filter((t) => matchesFilter(t.instrumental ?? null, filter))
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));
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
  onPlay: (uri: string) => Promise<PlayOutcome>;
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
  /** 전체 / 가사 없음 / 가사 있음 — rebuilds what is upcoming, never what plays */
  const [filter, setFilterState] = useState<FilterKind>(null);
  const filterRef = useRef<FilterKind>(null);
  /**
   * Supersedes in-flight builds.
   *
   * Flipping the filter twice in quick succession would otherwise let the first
   * build's answer land after the second's and repopulate the queue with tracks
   * the new filter excludes.
   */
  const buildRef = useRef(0);
  // read inside fillQueue, which is memoised and must not re-create on toggle
  const shuffledRef = useRef(shuffled);
  useEffect(() => {
    shuffledRef.current = shuffled;
  }, [shuffled]);

  /**
   * Pull more candidates, branching off the last played track.
   *
   * `have` is how long the queue is *now*, which only the caller knows: it has
   * just handed the new list to setQueue, and queueRef does not catch up until
   * React commits. Reading the ref here asked for one track too few.
   */
  const fillQueue = useCallback(
    async (initial: boolean, have: number): Promise<StationCandidate[]> => {
    const station = stationRef.current;
    if (!station.seed || fillingRef.current) return [];
    fillingRef.current = true;
    setBusy(initial ? "스테이션 구성 중…" : "큐 리필 중…");

    const run = ++buildRef.current;
    try {
      const basis = initial ? station.seed : (station.lastPlayed ?? station.seed);
      // the ladder lives on the server: one request walks similar -> seed ->
      // genre -> instrumental, stopping as soon as the queue is topped up
      const found = await fetchLadder({
        seed: { id: station.seed.id, name: station.seed.name, artist: station.seed.artist },
        basis: { name: basis.name, artist: basis.artist },
        need: Math.max(1, QUEUE_TARGET - have),
        filter: filterRef.current,
        seenIds: [...station.seenIds],
        seenLfm: [...station.seenLfm],
      });

      // a newer build (a filter change) started while this one was in flight
      if (run !== buildRef.current) return [];

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
      return found;
      } finally {
        fillingRef.current = false;
        setBusy(null);
      }
    },
    [],
  );

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
   *
   * A refused track is dropped and the one behind it tried instead, up to
   * MAX_SKIPS, so a run of unplayable candidates cannot stall the station. The
   * queue is only committed once a track actually starts — a refusal must not
   * look like it played. A player that is not ready yet is not a refusal and
   * stops the walk, so a missing device cannot eat the queue.
   *
   * `from` overrides the committed queue, for the one caller that has a fresher
   * list than React has rendered yet.
   */
  const playFromQueue = useCallback(
    async (target?: StationCandidate, from?: StationCandidate[]) => {
      let list = from ?? queueRef.current;
      let next: StationCandidate | undefined = target ?? list[0];
      if (!next) return;

      const refused: string[] = [];
      for (let tries = 0; next && tries < MAX_SKIPS; tries++) {
        const head: StationCandidate = next;
        const at = list.findIndex((t) => t.id === head.id);
        const rest = at >= 0 ? list.slice(at + 1) : list.filter((t) => t.id !== head.id);

        const outcome = await onPlay(head.uri);
        if (outcome === "unavailable") return;   // no device: nothing to skip to
        if (outcome === "played") {
          setQueue(rest);
          historyRef.current.push(head);
          stationRef.current.lastPlayed = {
            id: head.id,
            uri: head.uri,
            name: head.name,
            artist: head.artist,
            artwork: head.artwork,
            durationMs: head.durationMs,
          };
          if (rest.length <= REFILL_WHEN) void fillQueue(false, rest.length);
          return;
        }

        refused.push(`${head.name} — ${head.artist}`);
        list = rest;
        next = rest[0];
      }

      setQueue(list);
      if (refused.length) console.warn("[station] skipped unplayable", refused);
      if (list.length <= REFILL_WHEN) void fillQueue(false, list.length);
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
      const started = await onPlay(seed.uri);
      const candidates = await fillQueue(true, 0);
      // the seed itself can be refused — an explicit track on a filtered
      // account, say. Build the queue anyway and start at the first one that
      // will play, rather than leaving the station running but silent.
      if (started === "refused" && candidates.length) {
        await playFromQueue(candidates[0], candidates);
      }
    },
    [onPlay, fillQueue, playFromQueue],
  );

  /**
   * Change the lyrics filter and rebuild what is *upcoming*.
   *
   * The whole point of the station: the track playing right now is untouched.
   * That is enforced structurally — there is no call to `onPlay` anywhere in
   * this path — rather than by being careful.
   *
   * The queue already built is re-judged first, so tracks that still match are
   * kept rather than re-fetched, then the ladder tops it back up under the new
   * filter. A build already in flight is superseded by the generation counter.
   */
  const setFilter = useCallback(
    async (next: FilterKind) => {
      if (next === filterRef.current) return;
      filterRef.current = next;
      setFilterState(next);
      if (!stationRef.current.seed) return;

      const run = ++buildRef.current;
      setBusy(next === null ? "필터 해제 중…" : "필터 적용 중…");
      let kept: StationCandidate[] = [];
      try {
        kept = await keepMatching(queueRef.current, next);
        if (run !== buildRef.current) return;
        setQueue(kept);
        queueRef.current = kept;
      } finally {
        if (run === buildRef.current) setBusy(null);
      }
      if (run === buildRef.current) await fillQueue(false, kept.length);
    },
    [fillQueue],
  );

  const stopStation = useCallback(() => {
    stationRef.current = emptyState();
    historyRef.current = [];
    setQueue([]);
    setSeed(null);
    filterRef.current = null;
    setFilterState(null);
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
    filter,
    setFilter,
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
