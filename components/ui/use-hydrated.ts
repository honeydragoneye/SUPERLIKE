"use client";

import { useSyncExternalStore } from "react";

/** Nothing to subscribe to: the value flips once, at hydration, and stays. */
const never = () => () => {};
const onClient = () => true;
const onServer = () => false;

/**
 * False for the server render and the hydration that matches it, true after.
 *
 * Lets a component render exactly what the server wrote while React is
 * comparing the two, then switch to what the browser actually knows. Markup
 * that depends on a session, on localStorage or on playback has no honest
 * server value, and writing one anyway is what tears the tree down: React
 * finds the attribute or the text it did not expect, throws the subtree away
 * and re-renders it, reporting every client-only value below as a further
 * fault. Gating the source removes the mismatch instead of silencing it.
 *
 * `useSyncExternalStore` rather than a flag set in an effect, for two reasons:
 * React is specified to use `getServerSnapshot` for the hydration pass, so the
 * match is guaranteed rather than merely likely — and `set-state-in-effect`
 * rules out the effect spelling anyway.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(never, onClient, onServer);
}
