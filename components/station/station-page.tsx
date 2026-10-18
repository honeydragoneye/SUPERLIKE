"use client";

import Image from "next/image";
import type { StationCandidate } from "@/lib/station/types";
import { useSpotify } from "@/components/player/spotify-provider";
import { useHydrated } from "@/components/ui/use-hydrated";
import { LoadingDots } from "@/components/ui/loading-dots";
import { Icon } from "@/components/ui/icon";
import { clock } from "@/lib/time";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { TrackMenu, type TrackMenuTarget } from "./track-menu";
import { moodLabel } from "@/lib/station/custom-tags";

/** One upcoming track. Mirrors 최근 재생 목록's row so the two read as one family. */
function StationRow({
  track,
  index,
  playing,
  onPlay,
  menuOpen,
  onMore,
}: {
  track: StationCandidate;
  index: number;
  playing: boolean;
  onPlay: () => void;
  menuOpen: boolean;
  onMore: (anchor: HTMLElement) => void;
}) {
  return (
    // two buttons side by side: one inside the other is not valid, and a click
    // on ··· must not also start the track
    <li className="flex shrink-0 items-center gap-[12px] rule-b">
      <button
        type="button"
        onClick={onPlay}
        className="flex h-[46px] min-w-0 flex-1 cursor-pointer items-center gap-[12px] text-left"
      >
        <span className="tnum w-[32px] shrink-0 text-[18px] font-black tracking-[-0.5px]">
          {playing ? (
            <Icon name="play-sm" size={14} />
          ) : (
            String(index + 1).padStart(2, "0")
          )}
        </span>

        <span className="relative size-[32px] shrink-0 overflow-hidden rounded-[4px]">
          {track.artwork ? (
            <Image
              src={track.artwork}
              alt=""
              fill
              sizes="32px"
              className="object-cover"
              unoptimized
            />
          ) : (
            <Icon name="chart-art" size={32} />
          )}
        </span>

        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate text-[13px]">{track.name}</span>
          <span className="truncate text-[9px] tracking-[0.5px]">{track.artist}</span>
        </span>

        <span className="tnum w-[40px] shrink-0 text-right text-[10px]">
          {clock(track.durationMs)}
        </span>
      </button>

      <button
        type="button"
        onClick={(e) => onMore(e.currentTarget)}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label={`${track.name} 세부 기능`}
        title="세부 기능"
        className="flex h-[24px] w-[24px] shrink-0 cursor-pointer items-center justify-center rounded-pill hover:bg-gold aria-expanded:bg-gold"
      >
        <Icon name="more" size={14} />
      </button>
    </li>
  );
}

/**
 * The station screen.
 *
 * Takes over the middle column only — the action bar above it and the Now
 * Playing column beside it stay exactly where they are, matching
 * Superlike_V1.2 — station.
 *
 * What it shows is the app's own queue, not Spotify's: the seed it branched
 * from, and every track lined up behind the one playing. Picking a row jumps
 * there and drops what it skipped, the same rule UP NEXT follows.
 */
/** One empty array, so a blank render costs no re-render. */
const NOTHING: never[] = [];

export function StationPage() {
  const {
    stationQueue: upcoming,
    stationSeedTrack,
    stationBusy: busy,
    stationActive: running,
    playFromStation,
    removeFromStation,
    rejectFromStation,
    stationFilter,
    now: playing,
  } = useSpotify();
  const router = useRouter();
  /** the row whose ··· was pressed; null while the menu is closed */
  const [menu, setMenu] = useState<TrackMenuTarget | null>(null);
  // stable, because the menu's listeners are re-attached whenever it changes
  const closeMenu = useCallback(() => setMenu(null), []);

  /**
   * The session, the device and what is playing are the browser's to know, so
   * this renders what the server rendered until React has finished comparing
   * the two. Gated here rather than in the provider, which sits outside the
   * Suspense boundary and opens before this subtree is hydrated.
   */
  const hydrated = useHydrated();
  const stationQueue = hydrated ? upcoming : NOTHING;
  const stationBusy = hydrated ? busy : null;
  const stationActive = hydrated && running;
  const now = hydrated ? playing : null;
  const seed = hydrated ? stationSeedTrack : null;

  const status = stationBusy
    ? stationBusy
    : stationQueue.length
      ? `${stationQueue.length} TRACKS 대기 중`
      : "유사곡을 더 찾지 못했습니다";

  return (
    <section className="flex min-h-full flex-1 flex-col gap-[10px] bg-chart p-[16px]">
      <div className="flex w-full shrink-0 items-start justify-between gap-[10px]">
        {/* "<곡>의 스테이션" over the artist line, as the Figma frame titles it */}
        <div className="flex min-w-0 shrink flex-col gap-px">
          <h2 className="truncate text-[26px] font-black tracking-[-1px]">
            {seed ? `${seed.name}의 스테이션` : "스테이션"}
          </h2>
          <p className="truncate text-[8px] tracking-[0.7px]">
            {seed?.artist ?? "재생 중인 스테이션 없음"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-[6px]">
          {/* shuffle and stop live on the Now Playing panel, which is mounted on
              every screen — a second copy here only asked the same question twice */}
          <button
            type="button"
            onClick={() => router.back()}
            title="홈으로 돌아가기"
            className="shrink-0 whitespace-nowrap rounded-pill bg-paper px-[12px] py-[6px] text-[8px] tracking-[0.7px] rule"
          >
            CLOSE
          </button>
        </div>
      </div>

      {seed && (
        <div className="flex w-full shrink-0 items-center gap-[12px] overflow-hidden rounded-[4px] bg-ink p-[12px]">
          <span className="relative size-[56px] shrink-0 overflow-hidden rounded-[4px]">
            {seed.artwork ? (
              <Image
                src={seed.artwork}
                alt=""
                fill
                sizes="56px"
                className="object-cover"
                unoptimized
              />
            ) : (
              <Icon name="chart-art" size={56} />
            )}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
            <span className="text-[8px] tracking-[0.9px] text-pink-bright">
              STATION SEED
            </span>
            <span className="truncate text-[17px] tracking-[-0.4px] text-on-dark">
              {seed.name}
            </span>
            <span className="truncate text-[9px] tracking-[0.5px] text-on-dark-muted">
              {seed.artist}
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-[6px] whitespace-nowrap">
            <span
              className={`size-[6px] shrink-0 rounded-pill ${
                stationBusy ? "animate-pulse bg-pink-bright" : "bg-mint"
              }`}
              aria-hidden
            />
            <span className="text-[8px] tracking-[0.7px] text-on-dark-muted">
              {status}
            </span>
          </span>
        </div>
      )}

      <div className="flex w-full shrink-0 items-center gap-[12px] overflow-hidden pb-[2px] text-[8px] tracking-[0.8px]">
        <span className="w-[32px] shrink-0">#</span>
        <span className="w-[32px] shrink-0" />
        <span className="min-w-px flex-1">UP NEXT</span>
        <span className="w-[40px] shrink-0 text-right">TIME</span>
        {/* the width of a row's ··· button, so TIME stays over its column */}
        <span className="w-[24px] shrink-0" />
      </div>

      {/* hugs its rows: with `flex-1` an empty queue swallowed the rest of the
          column and pushed the line below it to the foot of the screen, which
          is exactly where it is not wanted while the queue is being built */}
      <ul className="flex w-full shrink-0 flex-col">
        {stationQueue.map((track, i) => (
          <StationRow
            key={track.id}
            track={track}
            index={i}
            playing={now?.uri === track.uri}
            onPlay={() => void playFromStation(track)}
            menuOpen={menu?.track.id === track.id}
            // pressing the same ··· again puts the menu away
            onMore={(anchor) =>
              setMenu((open) => (open?.track.id === track.id ? null : { track, anchor }))
            }
          />
        ))}
      </ul>

      <TrackMenu
        target={menu}
        onClose={closeMenu}
        onRemove={(track) => removeFromStation(track.id)}
        reject={
          stationFilter.mood
            ? { label: moodLabel(stationFilter.mood), onReject: rejectFromStation }
            : null
        }
      />

      {/* directly under the rows it is about to add, in the same line the
          detail screens use while they wait */}
      {stationBusy && (
        <p className="flex shrink-0 items-center gap-[8px] py-[14px] text-[10px] tracking-[0.5px] text-on-bright-muted">
          {stationBusy}
          <LoadingDots size={4} label={stationBusy} />
        </p>
      )}

      {!stationActive && (
        <p className="mt-auto shrink-0 text-[9px] tracking-[0.5px]">
          실행 중인 스테이션이 없습니다. 곡 위에 커서를 올리고 STATION을 눌러
          시작하세요.
        </p>
      )}
    </section>
  );
}
