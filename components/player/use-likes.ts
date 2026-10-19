"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  isLiked,
  snapshot,
  serverSnapshot,
  subscribe,
  toggle,
  type LikedTrack,
} from "@/lib/likes";
import { useSpotify } from "./spotify-provider";
import { mirrorLike } from "./account-sync";

/**
 * The liked list, newest first.
 *
 * `useSyncExternalStore` rather than state loaded in an effect: localStorage is
 * not readable on the server, and React is specified to use the server snapshot
 * for the hydration pass — so the first render provably matches the HTML
 * instead of merely tending to.
 */
export function useLikedTracks(): LikedTrack[] {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}

/**
 * Whether the track playing now is liked, and the switch for it.
 *
 * `null` for `track` means there is nothing to like — the header disables the
 * heart on it rather than offering a button that cannot do anything.
 */
export function useLikeNowPlaying(): {
  track: Omit<LikedTrack, "at"> | null;
  liked: boolean;
  toggleLike: () => void;
} {
  const { now } = useSpotify();

  /**
   * The id is carried on the uri — `spotify:track:<id>` — because that is what
   * the SDK reports. `now` has no separate id field, and the uri is the thing
   * every other part of the app already keys playback on.
   */
  const id = now?.uri?.startsWith("spotify:track:") ? now.uri.slice(14) : null;

  const track =
    id && now
      ? {
          id,
          uri: now.uri,
          title: now.title,
          artist: now.artist,
          artwork: now.artwork,
          durationMs: now.durationMs,
          albumId: now.albumId,
        }
      : null;

  /**
   * Subscribed to the whole list rather than one id: the store notifies on any
   * change, so a per-id snapshot would re-read just as often and buy nothing.
   */
  const liked = useSyncExternalStore(
    subscribe,
    () => isLiked(id),
    () => false,
  );

  const toggleLike = useCallback(() => {
    if (!track) return;
    const nowLiked = toggle(track);
    // mirrored to the account when there is one; the local heart does not wait for it
    void mirrorLike(track, nowLiked);
    // `track` is rebuilt each render; its fields are what matter, not identity
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track?.id, track?.uri, track?.title, track?.artist, track?.artwork, track?.durationMs, track?.albumId]);

  return { track, liked, toggleLike };
}
