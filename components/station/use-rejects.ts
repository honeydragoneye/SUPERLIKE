"use client";

import { useSyncExternalStore } from "react";
import { countFor, subscribe } from "@/lib/station/rejects";

/**
 * How many tracks the listener has rejected under a tag.
 *
 * Zero on the server and through hydration: the list lives in this browser,
 * and React uses the server snapshot until the first render has matched.
 */
export function useRejectCount(mood: string | null): number {
  return useSyncExternalStore(
    subscribe,
    () => countFor(mood),
    () => 0,
  );
}
