"use client";

import Image from "next/image";
import { Icon, TintedIcon } from "./ui/icon";
import { QueueItem } from "./ui/queue-item";
import { usePlaybackPosition, useSpotify } from "./player/spotify-provider";
import { useStationView } from "./station/station-view";
import { clock } from "@/lib/time";
import type { Track } from "@/lib/data";

function RoundButton({
  name,
  label,
  size,
  icon,
  onClick,
}: {
  name: string;
  label: string;
  size: number;
  icon: number;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex shrink-0 items-center justify-center rounded-pill bg-[rgba(237,235,228,0.82)] rule"
      style={{ width: size, height: size }}
    >
      <Icon name={name} size={icon} />
    </button>
  );
}

/**
 * Shows live Spotify playback when connected.
 *
 * With nothing playing — after a reload, say — it falls back to the most recent
 * track from the listening history, stopped at 0:00. There is no invented
 * placeholder: with no history there is simply nothing to show.
 */
export function NowPlayingPanel() {
  const {
    connected,
    ready,
    now,
    nextUp,
    queue,
    stationQueue,
    stationActive,
    stationBusy,
    stationSeed,
    stopStation,
    playFromStation,
    recent,
    shuffle,
    repeatMode,
    toggleShuffle,
    cycleRepeat,
    error,
    play,
    toggle,
    next,
    previous,
    seek,
  } = useSpotify();

  const { show: showStation, hide: hideStation } = useStationView();
  // the only subscriber to the per-second position, so the ticker re-renders
  // this panel alone rather than the whole grid
  const positionMs = usePlaybackPosition();
  const live = now !== null;
  const last = recent[0] ?? null;

  const title = now?.title ?? last?.title ?? "재생 중인 곡 없음";
  const meta = now
    ? `${now.artist} · ${now.album}`
    : (last?.artist ??
      (connected ? "최근 재생 기록이 없습니다" : "Spotify를 연결해 주세요"));
  const artwork = now?.artwork ?? last?.artwork ?? null;
  const durationMs = now?.durationMs ?? last?.durationMs ?? 0;
  const elapsed = clock(positionMs);
  const duration = durationMs ? clock(durationMs) : "0:00";
  const progress = durationMs ? Math.min(100, (positionMs / durationMs) * 100) : 0;
  const isPlaying = live && !now.paused;

  const repeatLabel =
    repeatMode === 2 ? "한 곡 반복" : repeatMode === 1 ? "전체 반복" : "반복 없음";

  /**
   * The station queue wins whenever a station is running: it is the list the
   * app controls and rebuilds under a filter, and Spotify knows nothing of it.
   *
   * Otherwise, with shuffle on only Spotify knows the order and reports it
   * through the SDK window; off, our play queue holds the full list. The
   * history stands in before any of those exist.
   */
  const queueRest =
    queue.length > 0
      ? (() => {
          const at = queue.findIndex((t) => t.uri === now?.uri);
          return at >= 0 ? queue.slice(at + 1) : queue;
        })()
      : [];

  const upNextSource =
    stationActive && stationQueue.length > 0
      ? stationQueue.map((t) => ({
          uri: t.uri,
          title: t.name,
          artist: t.artist,
          artwork: t.artwork,
          durationMs: t.durationMs,
        }))
      : shuffle && nextUp.length > 0
        ? nextUp
          : queueRest.length > 0
          ? queueRest
          : nextUp.length > 0
            ? nextUp
            : recent
              .filter((t) => t.title !== title)
              .map((t) => ({
                uri: t.uri,
                title: t.title,
                artist: t.artist,
                artwork: t.artwork,
                durationMs: t.durationMs,
              }));

  const upNext = upNextSource.map((t, i) => ({
    uri: t.uri,
    track: {
      index: String(i + 1).padStart(2, "0"),
      title: t.title,
      artist: t.artist,
      time: clock(t.durationMs),
    } satisfies Track,
  }));

  /**
   * Picking a row jumps to it and consumes the rows above it, so what follows
   * the picked track becomes the top of UP NEXT. Every list in this panel
   * behaves this way, whatever filled it.
   *
   * A station's queue is ours, so it just reorders in place. Otherwise the
   * picked track *and everything after it* is handed over as the new queue:
   * playing the single uri would leave Spotify holding a one-track queue with
   * nothing to advance to, which is why the reorder never stuck before.
   */
  const playRow = (uri: string) => {
    if (!uri) return;
    const inStation = stationQueue.find((t) => t.uri === uri);
    if (stationActive && inStation) return void playFromStation(inStation);

    const at = upNextSource.findIndex((t) => t.uri === uri);
    const rest = at >= 0 ? upNextSource.slice(at).filter((t) => t.uri) : [];
    if (rest.length > 1) {
      void play({ uris: rest.map((t) => t.uri), tracks: rest });
      return;
    }
    void play({ uris: [uri] });
  };

  return (
    <section className="flex h-full min-h-0 flex-col gap-[12px] overflow-hidden bg-panel p-[16px]">
      <div className="relative aspect-square w-full shrink-0 overflow-hidden rounded-[4px] bg-artwork">
        {artwork && (
          <Image
            src={artwork}
            alt={`${title} 앨범 커버`}
            fill
            sizes="231px"
            className="object-cover"
            unoptimized
          />
        )}
      </div>

      <div className="flex w-full shrink-0 flex-col gap-[3px] text-on-dark">
        {/* the panel is 231px wide, so both lines clip — hover for the full text */}
        <p className="w-full truncate text-[26px] tracking-[-0.8px]" title={title}>
          {title}
        </p>
        <p
          className="w-full truncate text-[10px] tracking-[0.6px] text-on-dark-muted"
          title={meta}
        >
          {meta}
        </p>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-[6px]">
        <div
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="재생 진행률"
          onClick={(e) => {
            if (!live) return;
            const box = e.currentTarget.getBoundingClientRect();
            const pct = (e.clientX - box.left) / box.width;
            void seek(Math.round(pct * now.durationMs));
          }}
          className="h-[5px] w-full overflow-hidden rounded-[3px] bg-muted"
        >
          <div
            className="h-full rounded-[3px] bg-pink transition-[width] duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="tnum flex w-full items-start justify-between text-[9px]">
          <span className="text-on-dark">{elapsed}</span>
          <span className="text-on-dark-muted">{duration}</span>
        </div>
      </div>

      <div className="flex w-full shrink-0 items-center justify-center gap-[16px] py-[2px]">
        <button
          type="button"
          aria-label={shuffle ? "셔플 끄기" : "셔플 켜기"}
          aria-pressed={shuffle}
          title={
            stationActive
              ? shuffle
                ? "셔플 켜짐 — 다시 누르면 해제"
                : "셔플 — 대기열을 무작위로 재정렬"
              : shuffle
                ? "셔플 켜짐"
                : "셔플 꺼짐"
          }
          disabled={!live && !stationActive}
          onClick={() => void toggleShuffle()}
          className={`transition-colors disabled:opacity-30 ${
            shuffle ? "text-pink-bright" : "text-on-dark-muted"
          }`}
        >
          <TintedIcon name="shuffle" size={18} />
        </button>

        <button
          type="button"
          aria-label="이전 곡"
          disabled={!live && !stationActive}
          onClick={() => void previous()}
          className="text-on-dark disabled:opacity-30"
        >
          <TintedIcon name="prev" size={20} />
        </button>

        <button
          type="button"
          aria-label={isPlaying ? "일시정지" : "재생"}
          disabled={connected && !ready}
          onClick={() =>
            void (live ? toggle() : play(last?.uri ? { uris: [last.uri] } : {}))
          }
          className="flex size-[52px] shrink-0 items-center justify-center rounded-pill bg-pink rule disabled:opacity-60"
        >
          <Icon name={isPlaying ? "pause-lg" : "play-lg"} size={20} />
        </button>

        <button
          type="button"
          aria-label="다음 곡"
          disabled={!live && !stationActive}
          onClick={() => void next()}
          className="text-on-dark disabled:opacity-30"
        >
          <TintedIcon name="next" size={20} />
        </button>

        <button
          type="button"
          aria-label={repeatLabel}
          title={repeatLabel}
          disabled={!live}
          onClick={() => void cycleRepeat()}
          className={`relative transition-colors disabled:opacity-30 ${
            repeatMode > 0 ? "text-pink-bright" : "text-on-dark-muted"
          }`}
        >
          <TintedIcon name="repeat" size={18} />
          {repeatMode === 2 && (
            <span className="tnum absolute -right-[3px] -top-[3px] text-[8px] leading-none">
              1
            </span>
          )}
        </button>
      </div>

      {error && (
        <p className="shrink-0 text-[9px] leading-[12px] text-pink-bright">{error}</p>
      )}

      {/* the status itself opens the station screen; STOP stays a separate
          control beside it, since a button cannot be nested inside a button */}
      {stationActive && (
        <div className="flex w-full shrink-0 items-center gap-[8px] rounded-[4px] bg-white/10 px-[8px] py-[6px]">
          <button
            type="button"
            onClick={showStation}
            title="스테이션 화면 열기"
            className="flex min-w-0 flex-1 cursor-pointer items-center gap-[8px] text-left transition-opacity hover:opacity-70"
          >
            <span
              className={`size-[6px] shrink-0 rounded-pill ${
                stationBusy ? "animate-pulse bg-pink-bright" : "bg-mint"
              }`}
              aria-hidden
            />
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="text-[8px] tracking-[0.8px] text-on-dark-muted">
                {stationBusy ??
                  (stationQueue.length ? "STATION 재생 중" : "유사곡을 찾지 못했습니다")}
              </span>
              <span className="truncate text-[9px] text-on-dark">{stationSeed}</span>
            </span>
            <span
              aria-hidden
              className="shrink-0 text-[11px] leading-none text-on-dark-muted"
            >
              →
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              stopStation();
              hideStation();
            }}
            title="스테이션 종료"
            className="shrink-0 rounded-pill bg-on-dark-muted px-[8px] py-[4px] text-[8px] tracking-[0.6px] text-panel"
          >
            STOP
          </button>
        </div>
      )}

      <div className="h-[1.5px] w-full shrink-0 bg-on-dark-muted" />

      <div className="flex w-full shrink-0 items-center justify-between whitespace-nowrap">
        <p className="text-[10px] tracking-[1px] text-on-dark">UP NEXT</p>
        <p className="text-[8px] tracking-[0.5px] text-on-dark-muted">
          {upNext.length
            ? `${upNext.length} TRACKS · ${stationActive ? "STATION" : `SHUFFLE ${shuffle ? "ON" : "OFF"}`}`
            : stationBusy
              ? "채우는 중…"
              : "대기열 없음"}
        </p>
      </div>

      <ul className="scroll-y flex min-h-0 w-full flex-1 flex-col">
        {upNext.map(({ uri, track }) => (
          <QueueItem
            key={`${track.index}-${track.title}`}
            track={track}
            onPlay={uri ? () => playRow(uri) : undefined}
          />
        ))}
      </ul>

      <div className="flex w-full shrink-0 items-center justify-between">
        <RoundButton name="heart-filled" label="좋아요" size={36} icon={16} />
        <div className="flex shrink-0 items-center gap-[6px]">
          <RoundButton name="plus" label="보관함에 추가" size={30} icon={14} />
          <RoundButton name="share" label="공유" size={30} icon={14} />
          <RoundButton name="more" label="더 보기" size={30} icon={14} />
        </div>
      </div>
    </section>
  );
}
