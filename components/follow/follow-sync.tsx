"use client";

import { useEffect } from "react";
import { useSpotify } from "@/components/player/spotify-provider";
import { loadFollows, resetFollows } from "./follow-store";

/** Looking again after this long away from the tab is enough: the lookups are daily. */
const AGAIN_MS = 10 * 60 * 1000;

/**
 * Loads the follows and 소식 once there is an account, again when the tab comes
 * back after a while, and clears them when the account goes. Renders nothing.
 */
export function FollowSync() {
  const { connected } = useSpotify();

  useEffect(() => {
    if (!connected) {
      resetFollows();
      return;
    }
    void loadFollows(true);
    let last = Date.now();
    const onVisible = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < AGAIN_MS) return;
      last = Date.now();
      void loadFollows(true);
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [connected]);

  return null;
}
