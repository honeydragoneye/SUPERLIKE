"use client";

import { SectionHead } from "./section-head";

/**
 * The playlists this account keeps in Superlike, on the same rail as the liked
 * covers.
 *
 * Spotify's own playlists are no longer read here; this shelf waits for the
 * ones Superlike will store itself.
 */
export function PlaylistShelf() {
  return (
    <section className="flex min-h-[306px] w-full flex-1 flex-col gap-[16px] px-[24px] pb-[24px] pt-[20px]">
      <SectionHead title="내 플레이리스트" note="SUPERLIKE" />

      <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">
        아직 만든 플레이리스트가 없습니다.
      </p>
    </section>
  );
}
