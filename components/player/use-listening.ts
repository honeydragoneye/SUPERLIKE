"use client";

import { useEffect, useSyncExternalStore } from "react";
import { record, serverSnapshot, subscribe, weekSnapshot } from "@/lib/listening";
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
  const playing = Boolean(now?.uri) && now?.paused === false;

  useEffect(() => {
    if (!playing) return;

    let since = Date.now();
    const flush = () => {
      const at = Date.now();
      const delta = at - since;
      since = at;
      record(Math.min(delta, MAX_CREDIT_MS));
    };

    const id = setInterval(flush, FLUSH_MS);
    /** a tab going away is the last chance to bank the partial interval */
    const onHidden = () => {
      if (document.visibilityState === "hidden") flush();
    };
    document.addEventListener("visibilitychange", onHidden);

    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onHidden);
      // pause, track change or navigation away: credit what was played
      flush();
    };
  }, [playing]);
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
