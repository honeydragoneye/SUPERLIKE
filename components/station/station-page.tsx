"use client";

import Image from "next/image";
import type { StationCandidate } from "@/lib/station/types";
import { useSpotify } from "@/components/player/spotify-provider";
import { Icon } from "@/components/ui/icon";
import { clock } from "@/lib/time";
import { useStationView } from "./station-view";

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
    <li className="rule-b">
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
export function StationPage() {
  const {
    stationQueue,
    stationSeedTrack,
    stationBusy,
    stationActive,
    stopStation,
    playFromStation,
    shuffle,
    toggleShuffle,
    now,
  } = useSpotify();
  const { hide } = useStationView();

  const seed = stationSeedTrack;

  const status = stationBusy
    ? stationBusy
    : stationQueue.length
      ? `${stationQueue.length} TRACKS 대기 중`
      : "유사곡을 더 찾지 못했습니다";

  return (
    <section className="flex min-h-[492px] flex-1 flex-col gap-[10px] overflow-hidden bg-chart p-[16px]">
      <div className="flex w-full shrink-0 items-start justify-between gap-[10px]">
        {/* "<곡>의 Station" over the artist line, as the Figma frame titles it */}
        <div className="flex min-w-0 shrink flex-col gap-px">
          <h2 className="truncate text-[26px] font-black tracking-[-1px]">
            {seed ? `${seed.name}의 Station` : "STATION"}
          </h2>
          <p className="truncate text-[8px] tracking-[0.7px]">
            {seed?.artist ?? "재생 중인 스테이션 없음"}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-[6px]">
          <button
            type="button"
            onClick={() => void toggleShuffle()}
            aria-pressed={shuffle}
            title={shuffle ? "셔플 끄기" : "대기열 섞기"}
            className={`shrink-0 whitespace-nowrap rounded-pill px-[12px] py-[6px] text-[8px] tracking-[0.7px] transition-colors rule ${
              shuffle ? "bg-ink text-paper" : "bg-gold text-ink"
            }`}
          >
            SHUFFLE {shuffle ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => {
              stopStation();
              hide();
            }}
            title="스테이션 종료"
            className="shrink-0 whitespace-nowrap rounded-pill bg-pink px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-paper-solid transition-colors hover:bg-ink rule"
          >
            STOP
          </button>
          <button
            type="button"
            onClick={hide}
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

      <ul className="scroll-y flex min-h-px w-full flex-1 flex-col">
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
