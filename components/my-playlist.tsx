"use client";

/**
 * The user's own playlists, kept inside Superlike.
 *
 * Sits on the same near-white as the history block, separated by rules top and
 * bottom rather than a colour field — matching Superlike_V1.1.
 *
 * Spotify's playlists are no longer read here; this block waits for the ones
 * Superlike will keep itself.
 */
export function MyPlaylist() {
  return (
    <section className="flex h-[252px] shrink-0 flex-col gap-[12px] overflow-hidden bg-chart p-[16px] rule-y">
      <div className="flex w-full shrink-0 items-center justify-between gap-[10px]">
        <h2 className="whitespace-nowrap text-[19px] font-black tracking-[-0.4px] text-on-bright">
          MY PLAYLIST
        </h2>
      </div>

      <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">
        아직 만든 플레이리스트가 없습니다.
      </p>
    </section>
  );
}
