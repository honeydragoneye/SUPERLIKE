import type { Track } from "@/lib/data";

/**
 * Up-next row in the Now Playing panel: index, title, artist, duration.
 * Hairline rule on the bottom edge.
 *
 * Sits on the near-black panel, so it uses the on-dark ramp rather than
 * the file's `ink` (which renders at ~1.4:1 there).
 */
export function QueueItem({
  track,
  onPlay,
}: {
  track: Track;
  onPlay?: () => void;
}) {
  const content = (
    <>
      <span className="tnum w-[18px] shrink-0 text-left text-[10px] text-on-dark-muted">
        {track.index}
      </span>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-[2px]">
        <span className="w-full truncate text-left text-[12px] text-on-dark">
          {track.title}
        </span>
        <span className="w-full truncate text-left text-[9px] tracking-[0.4px] text-on-dark-muted">
          {track.artist}
        </span>
      </span>
      <span className="tnum shrink-0 text-[10px] text-on-dark-muted">{track.time}</span>
    </>
  );

  return (
    <li className="shrink-0 border-b border-white/15">
      {onPlay ? (
        <button
          type="button"
          onClick={onPlay}
          title={`${track.title} 재생`}
          className="flex h-[46px] w-full items-center gap-[10px] px-[2px] text-left"
        >
          {content}
        </button>
      ) : (
        <span className="flex h-[46px] w-full items-center gap-[10px] px-[2px]">
          {content}
        </span>
      )}
    </li>
  );
}
