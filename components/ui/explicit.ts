"use client";

import { useSpotify } from "@/components/player/spotify-provider";
import { useHydrated } from "./use-hydrated";

/** What a 19금 track says on hover when this account cannot play it. */
export const EXPLICIT_NOTE = "19금 곡이라 이 계정으로는 재생할 수 없어요";

/** How such a track looks: dimmed and a little soft, the same quiet no as a track Spotify could not find. */
export const LOCKED_LOOK = "opacity-55 blur-[0.8px] saturate-75";

/**
 * Whether a track is one this account will refuse.
 *
 * Read once at the top of a list and asked per row, so a row costs nothing.
 * Waits for hydration because the flag comes from the browser: the first
 * render has to match the server's.
 */
export function useExplicitLock(): (explicit?: boolean) => boolean {
  const { explicitBlocked } = useSpotify();
  const hydrated = useHydrated();
  return (explicit) => hydrated && explicitBlocked && explicit === true;
}
