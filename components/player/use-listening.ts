"use client";

import { useEffect, useRef, useSyncExternalStore } from "react";
import { record, serverSnapshot, subscribe, weekSnapshot } from "@/lib/listening";
import {
  PLAY_THRESHOLD_MS,
  countPlay,
  serverSnapshot as noPlays,
  subscribe as subscribePlays,
  todaySnapshot,
  totalSnapshot,
  weekSnapshot as weekPlays,
} from "@/lib/plays";
import { mirrorPlay } from "./account-sync";
import { useSpotify } from "./spotify-provider";

/** Often enough that closing the tab loses seconds, rarely enough to be free. */
const FLUSH_MS = 15_000;

/**
 * The most one flush may credit.
 *
 * Wall clock keeps running when the machine sleeps or the tab is suspended,
 * and the SDK's state still says "playing" on the other side of it — without a
 * ceiling, a laptop closed mid-song would wake up and book eight hours. The
 * cap is four intervals because a backgrounded tab's timers are throttled to
 * about once a minute, which is legitimate playing time and should still count.
 */
const MAX_CREDIT_MS = FLUSH_MS * 4;

/**
 * Accumulates listening time while something is playing. Call once.
 *
 * Wall clock rather than `positionMs` deltas: the position jumps on a seek,
 * and crediting that jump would turn dragging the scrubber to the end of a
 * song into having listened to it.
 */
export function useRecordListening(): void {
  const { now } = useSpotify();
  const uri = now?.uri ?? null;
  const playing = Boolean(uri) && now?.paused === false;
  /** the track's name for the account's copy of the tally, read when a play is counted */
  const meta = useRef({ title: "", artist: "" });
  useEffect(() => {
    meta.current = { title: now?.title ?? "", artist: now?.artist ?? "" };
  }, [now?.title, now?.artist]);

  /**
   * The uri is a dependency, so a track change tears this down and sets it up
   * again — which both banks the time played and starts the next track's own
   * tally from zero. Carrying one counter across tracks would let three songs
   * skipped at eight seconds each add up to a play that never happened.
   */
  useEffect(() => {
    if (!playing || !uri) return;

    const id = uri.startsWith("spotify:track:") ? uri.slice(14) : uri;
    let since = Date.now();
    /** this track's own total, so the 20s threshold is per play, not per flush */
    let heard = 0;
    let counted = false;

    const flush = () => {
      const at = Date.now();
      const delta = Math.min(at - since, MAX_CREDIT_MS);
      since = at;
      record(delta);
      heard += delta;
      if (!counted && heard >= PLAY_THRESHOLD_MS) {
        counted = true;
        countPlay(id);
        const { title, artist } = meta.current;
        if (title && artist) void mirrorPlay({ trackId: id, title, artist });
      }
    };

    /**
     * Checked more often than the time is flushed, so a track crossing the
     * threshold is counted around when it happens rather than up to fifteen
     * seconds later — a song skipped at twenty-two seconds still counts, and
     * the panel showing the count does not lag behind the song.
     */
    const tick = setInterval(flush, Math.min(FLUSH_MS, PLAY_THRESHOLD_MS / 4));
    /** a tab going away is the last chance to bank the partial interval */
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHidden);

    return () => {
      clearInterval(tick);
      document.removeEventListener("visibilitychange", onHidden);
      // pause, track change or navigation away: credit what was played
      flush();
    };
  }, [playing, uri]);
}

/**
 * Milliseconds played since Monday, kept current as it accumulates.
 *
 * `useSyncExternalStore` rather than state loaded in an effect: localStorage
 * is exactly the external store it exists for, and its server snapshot gives
 * the markup a figure to render before the browser has one, so hydration has
 * nothing to disagree about.
 */
export function useWeeklyListening(): number {
  return useSyncExternalStore(subscribe, weekSnapshot, serverSnapshot);
}

/**
 * How many times each track has been played today, by Spotify track id.
 *
 * A snapshot of the whole day rather than one track's count: the store
 * notifies on any change, so a per-track subscription would re-read just as
 * often and buy nothing, and a list of rows wants the lot anyway.
 */
export function usePlaysToday(): Record<string, number> {
  return useSyncExternalStore(subscribePlays, todaySnapshot, noPlays);
}

/** The same, since Monday. */
export function usePlaysThisWeek(): Record<string, number> {
  return useSyncExternalStore(subscribePlays, weekPlays, noPlays);
}

/** The same, across every day the store keeps. */
export function usePlaysTotal(): Record<string, number> {
  return useSyncExternalStore(subscribePlays, totalSnapshot, noPlays);
}
