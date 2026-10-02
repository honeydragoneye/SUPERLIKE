"use client";

import { Icon } from "./ui/icon";
import { useSpotify } from "./player/spotify-provider";
import { SearchField } from "./search/search-field";
import { useWeeklyListening } from "./player/use-listening";
import { formatSpan } from "@/lib/listening";

export function ActionBar() {
  const { recent, ready, now, isPlaying, play, toggle } = useSpotify();
  const weekMs = useWeeklyListening();
  const playable = recent.filter((t) => t.uri);
  const uris = playable.map((t) => t.uri);
  // pressing this while something is loaded pauses/resumes it, exactly like the
  // Now Playing button — it only starts the list when nothing is playing yet
  const canPlayAll = ready && (now !== null || uris.length > 0);

  return (
    /* no overflow-hidden: the search field hangs its suggestion panel below
       the bar, and clipping here would cut it off at 76px */
    <div className="flex h-[76px] shrink-0 items-center gap-[12px] bg-lime pl-[16px] pr-[12px]">
      <SearchField />

      <div className="min-w-px flex-1" />

      {/* measured by this app since it was first run — see lib/listening.ts */}
      <div
        className="flex shrink-0 flex-col items-end whitespace-nowrap"
        title="이번 주 Superlike에서 재생한 시간"
      >
        <span className="text-[8px] tracking-[0.7px] text-muted">THIS WEEK</span>
        <span className="tnum text-[19px] tracking-[-0.5px]">{formatSpan(weekMs)}</span>
      </div>

      <button
        type="button"
        disabled={!canPlayAll}
        onClick={() =>
          void (now
            ? toggle()
            : play({
                uris,
                tracks: playable.map((t) => ({
                  uri: t.uri,
                  title: t.title,
                  artist: t.artist,
                  artwork: t.artwork,
                  durationMs: t.durationMs,
                })),
              }))
        }
        title={
          isPlaying
            ? "일시정지"
            : now
              ? "이어서 재생"
              : canPlayAll
                ? `${uris.length}곡 이어 재생`
                : "Spotify 연결 후 사용할 수 있습니다"
        }
        className="flex shrink-0 items-center gap-[14px] rounded-pill bg-ink py-[6px] pl-[20px] pr-[6px] disabled:opacity-50"
      >
        <span className="whitespace-nowrap text-[13px] tracking-[0.6px] text-paper-solid">
          {isPlaying ? "PLAYING" : "PLAY ALL"}
        </span>
        <span className="flex size-[34px] items-center justify-center rounded-pill bg-pink">
          <Icon name={isPlaying ? "pause-lg" : "play-sm"} size={14} />
        </span>
      </button>
    </div>
  );
}
