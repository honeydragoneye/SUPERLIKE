import type { Track } from "@/lib/data";

/**
 * Up-next row in the Now Playing panel: index, title, artist, duration.
 * Hairline rule on the bottom edge.
 *
 * Sits on the near-black panel, so it uses the on-dark ramp rather than
 * the file's `ink` (which renders at ~1.4:1 there).
 */
export function QueueItem({ track }: { track: Track }) {
  return (
    <li className="flex h-[46px] shrink-0 items-center gap-[10px] border-b border-white/15 px-[2px]">
      <span className="tnum w-[18px] shrink-0 text-[10px] text-on-dark-muted">
        {track.index}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
        <span className="truncate text-[12px] text-on-dark">{track.title}</span>
        <span className="truncate text-[9px] tracking-[0.4px] text-on-dark-muted">
          {track.artist}
        </span>
      </span>
      <span className="tnum shrink-0 text-[10px] text-on-dark-muted">
        {track.time}
      </span>
    </li>
  );
}
