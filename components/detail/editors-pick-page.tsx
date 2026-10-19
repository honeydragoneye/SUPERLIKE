"use client";

import type { AlbumPage as Album } from "@/lib/data";
import type { Palette } from "@/lib/palette";
import { AlbumView } from "./album-page";
import { useDetail } from "./use-detail";

export type EditorsPickData = {
  track: { title: string; artist: string; likedAt: number };
  album: Album;
  /** colours of the cover, for the block on the home screen; null when none could be taken */
  palette: Palette | null;
};

/**
 * Editor's Pick: the album of the song the developer hearted last.
 *
 * The data comes from the database, not from Spotify, so it shows for visitors
 * who have not connected an account. Playing it still needs a connection, which
 * the album's own buttons ask for.
 */
export function EditorsPickPage() {
  const { data, loading, error } = useDetail<EditorsPickData>("/api/editors-pick");
  return (
    <AlbumView
      data={data?.album ?? null}
      loading={loading}
      // the shared message for 404 reads "not found"; here it means nothing has been picked
      error={error === "찾을 수 없습니다" ? "아직 고른 앨범이 없습니다" : error}
      eyebrow="EDITOR'S PICK"
      note={data ? `개발자(honeydragoneye)가 가장 최근에 좋아요한 곡: ${data.track.title} — ${data.track.artist}` : undefined}
    />
  );
}
