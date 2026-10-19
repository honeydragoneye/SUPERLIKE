"use client";

import { useEffect } from "react";
import { replaceAll, snapshot, type LikedTrack } from "@/lib/likes";
import { mirrorLike } from "./account-sync";
import { useSpotify } from "./spotify-provider";

const SYNCED_KEY = "superlike:likes-synced:v1";

/**
 * Brings this browser's hearts and the account's together once per page load.
 *
 * The first time a browser meets the account (or when the account has no hearts
 * yet) the two lists are joined and what only this browser had is sent up, so
 * hearts made before the database existed are not lost. After that the account
 * is the truth: a heart removed on another device must not come back from this
 * one's copy.
 */
export function useAccountSync(): void {
  const { connected } = useSpotify();

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;

    void (async () => {
      try {
        const res = await fetch("/api/me/likes", { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const { tracks } = (await res.json()) as { tracks: LikedTrack[] };
        let synced = false;
        try {
          synced = localStorage.getItem(SYNCED_KEY) === "1";
        } catch {
          // private browsing: treat as not yet brought over
        }

        if (synced && tracks.length > 0) {
          replaceAll(tracks);
          return;
        }

        const onServer = new Set(tracks.map((t) => t.id));
        const local = snapshot();
        for (const t of local) {
          if (cancelled) return;
          if (!onServer.has(t.id)) await mirrorLike(t, true);
        }
        const localIds = new Set(local.map((t) => t.id));
        replaceAll([...local, ...tracks.filter((t) => !localIds.has(t.id))]);
        try {
          localStorage.setItem(SYNCED_KEY, "1");
        } catch {
          // it will be joined again next load, which is harmless
        }
      } catch {
        // not signed in, or the database is off: the browser's own copy stands
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connected]);
}
