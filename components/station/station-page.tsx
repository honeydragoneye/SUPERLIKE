"use client";

import Image from "next/image";
import type { StationCandidate } from "@/lib/station/types";
import { useSpotify } from "@/components/player/spotify-provider";
import { useHydrated } from "@/components/ui/use-hydrated";
import { Icon } from "@/components/ui/icon";
import { clock } from "@/lib/time";
import { useRouter } from "next/navigation";

/** One upcoming track. Mirrors 최근 재생 목록's row so the two read as one family. */
function StationRow({
  track,
  index,
  playing,
  onPlay,
}: {
  track: StationCandidate;
  index: number;
  playing: boolean;
  onPlay: () => void;
}) {
  return (
    <li className="shrink-0 rule-b">
      <button
        type="button"
        onClick={onPlay}
        className="flex h-[46px] w-full cursor-pointer items-center gap-[12px] text-left"
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
    now: playing,
  } = useSpotify();
  const router = useRouter();

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
      </div>

      <ul className="flex w-full flex-1 flex-col">
        {stationQueue.map((track, i) => (
          <StationRow
            key={track.id}
            track={track}
            index={i}
            playing={now?.uri === track.uri}
            onPlay={() => void playFromStation(track)}
          />
        ))}
      </ul>

      {!stationActive && (
        <p className="shrink-0 text-[9px] tracking-[0.5px]">
          실행 중인 스테이션이 없습니다. 곡 위에 커서를 올리고 STATION을 눌러
          시작하세요.
        </p>
      )}
    </section>
  );
}
