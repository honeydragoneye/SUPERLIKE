"use client";

import Image from "next/image";
import { useEffect, useRef, useState, type MouseEvent } from "react";
import { Icon, TintedIcon } from "./ui/icon";
import { QueueItem } from "./ui/queue-item";
import { usePlaybackPosition, useSpotify } from "./player/spotify-provider";
import { useLikeNowPlaying } from "./player/use-likes";
import { useHydrated } from "./ui/use-hydrated";
import { LoadingDots } from "./ui/loading-dots";
import { useRouter } from "next/navigation";
import { useLyricsView } from "./lyrics/lyrics-view";
import { VolumeControl } from "./player/volume-control";
import { LyricsPopover } from "./lyrics/lyrics-panel";
import { clock } from "@/lib/time";
import type { Track } from "@/lib/data";
import { moodLabel } from "@/lib/station/custom-tags";
import { PlayerMenu, type PlayerMenuItem } from "./player/player-menu";
import { AddToPlaylistModal } from "./playlists/add-to-playlist-modal";

/** One empty array for every list the panel holds back during hydration. */
const NOTHING: never[] = [];

function RoundButton({
  name,
  label,
  size,
  icon,
  onClick,
  pressed,
  disabled,
}: {
  name: string;
  label: string;
  size: number;
  icon: number;
  /** handed the click, so a menu can hang from the button that opened it */
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
  /** a toggle rather than an action: announced, and tinted while on */
  pressed?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      onClick={onClick}
      disabled={disabled}
      className={`flex shrink-0 items-center justify-center rounded-pill text-ink rule ${
        pressed ? "bg-accent" : "bg-glass"
      }${onClick && !disabled ? " cursor-pointer transition-colors" : ""}${
        disabled ? " opacity-40" : ""
      }`}
      style={{ width: size, height: size }}
    >
      <TintedIcon name={name} size={icon} />
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
    connected: session,
    ready: deviceReady,
    now: playing,
    nextUp: sdkNext,
    queue: handedOver,
    queueIndex: handedIndex,
    stationQueue: station,
    stationActive: stationOn,
    stationBusy: busy,
    stationSeed: seedLabel,
    deviceId,
    startStation,
    stopStation,
    playFromStation,
    stationFilter: filter,
    rejectFromStation,
    recent: history,
    shuffle: shuffled,
    repeatMode: repeat,
    toggleShuffle,
    cycleRepeat,
    error: playerError,
    play,
    toggle,
    next,
    previous,
    seek,
  } = useSpotify();

  const router = useRouter();
  const { open: lyricsOpen, toggle: toggleLyrics, close: closeLyrics } = useLyricsView();
  // the only subscriber to the per-second position, so the ticker re-renders
  // this panel alone rather than the whole grid
  const positionMs = usePlaybackPosition();
  const { track: likeTrack, liked, toggleLike } = useLikeNowPlaying();

  /**
   * Everything this panel displays is knowledge only the browser has — a
   * session, a device, a queue, what is playing — so until React has finished
   * comparing this subtree against the server HTML it renders what the server
   * rendered: nothing.
   *
   * Gated here rather than in the provider. The provider sits outside the
   * Suspense boundary this panel is inside, so its own gate opens before React
   * gets round to this subtree, and by then its token fetch has already
   * reported a session — which is how `meta` came to say "최근 재생 기록이
   * 없습니다" against an HTML that said "Spotify를 연결해 주세요".
   */
  const hydrated = useHydrated();
  const connected = hydrated && session;
  const ready = hydrated && deviceReady;
  const now = hydrated ? playing : null;
  const recent = hydrated ? history : NOTHING;
  const nextUp = hydrated ? sdkNext : NOTHING;
  const queue = hydrated ? handedOver : NOTHING;
  const queueIndex = hydrated ? handedIndex : -1;
  const stationQueue = hydrated ? station : NOTHING;
  const stationActive = hydrated && stationOn;
  const shuffle = hydrated && shuffled;
  const repeatMode = hydrated ? repeat : 0;
  const error = hydrated ? playerError : null;
  // used outside the stationActive guard too, so it needs its own gate
  const stationBusy = hydrated ? busy : null;
  const stationSeed = hydrated ? seedLabel : null;
  const mood = hydrated ? filter.mood : null;

  /**
   * ··· holds what can be done with the track playing. "이 곡은 <mood> 아님" is
   * among them only while a station runs under a mood tag; the rest need just
   * a track to exist.
   */
  const nowId = now?.uri?.startsWith("spotify:track:") ? now.uri.slice(14) : null;
  const rejectable = stationActive && mood !== null && nowId !== null && now !== null;
  const [moreOpen, setMoreOpen] = useState(false);
  /** the playlist picker, opened from the + and from the ··· menu */
  const [adding, setAdding] = useState(false);
  const closeAdding = () => setAdding(false);

  /**
   * The queue and the lyrics each live in a popover over the bar rather than a
   * column: the bar is the whole player now, and a list is only wanted when it
   * is asked for. They share the one place above the bar, so opening either
   * closes the other. Escape or a press anywhere outside closes it.
   */
  const [queueOpen, setQueueOpen] = useState(false);
  /** the volume slider is the smallest of them: it hangs from its own button, but opening one closes the rest */
  const [volumeOpen, setVolumeOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const popover = queueOpen || lyricsOpen || moreOpen || volumeOpen;
  useEffect(() => {
    if (!popover) return;
    const shut = () => {
      setQueueOpen(false);
      setMoreOpen(false);
      setVolumeOpen(false);
      closeLyrics();
    };
    const onDown = (e: globalThis.MouseEvent) => {
      const target = e.target as Element;
      if (popoverRef.current?.contains(target)) return;
      // the toggles handle their own press, or they would close and reopen at once
      if (target.closest?.("[data-popover-toggle]")) return;
      shut();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && shut();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [popover, closeLyrics]);

  const likeable = hydrated && likeTrack !== null;
  const likedNow = likeable && liked;
  const live = now !== null;
  const last = recent[0] ?? null;

  const title = now?.title ?? last?.title ?? "재생 중인 곡 없음";
  const meta = now
    ? `${now.artist} · ${now.album}`
    : (last?.artist ??
      (connected ? "최근 재생 기록이 없습니다" : "Spotify를 연결해 주세요"));
  // the cover is 48px, but the larger art stays sharp on a 2x screen
  const artwork = now?.artwork ?? last?.artworkLarge ?? last?.artwork ?? null;
  const durationMs = now?.durationMs ?? last?.durationMs ?? 0;
  const elapsed = clock(positionMs);
  const duration = durationMs ? clock(durationMs) : "0:00";
  const progress = durationMs ? Math.min(100, (positionMs / durationMs) * 100) : 0;
  const isPlaying = live && !now.paused;

  const repeatLabel =
    repeatMode === 2 ? "한 곡 반복" : repeatMode === 1 ? "전체 반복" : "반복 없음";

  /**
   * What is still ahead in the list we handed Spotify.
   *
   * Searching it for `now.uri` here was wrong twice over: a track appearing
   * twice in a playlist rewound the list to the first copy, and a track that
   * was not in the list at all — a different playlist, or playback run past
   * the part we loaded — listed the whole thing as though none of it had
   * played. The provider follows the cursor instead, and -1 before the first
   * track arrives correctly means "all of it is still ahead".
   */
  const queueRest = queue.slice(queueIndex + 1);

  /**
   * The station queue wins whenever a station is running: it is the list the
   * app controls and rebuilds under a filter, and Spotify knows nothing of it.
   *
   * Otherwise, with shuffle on only Spotify knows the order and reports it
   * through the SDK window; off, our play queue holds the full list. The
   * history stands in before any of those exist.
   */
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

  /**
   * What ··· offers for the track playing. A station keeps its own queue, which
   * Spotify's "next" would not reach, so 다음에 재생 is left out while one runs.
   */
  const menuItems: PlayerMenuItem[] = [];
  if (now && nowId) {
    const seed = {
      id: nowId,
      uri: now.uri,
      name: now.title,
      artist: now.artist,
      artwork: now.artwork,
      durationMs: now.durationMs,
    };
    if (rejectable && mood) {
      menuItems.push({
        key: "reject",
        mark: "⊘",
        label: `${moodLabel(mood)} 아님`,
        onSelect: () => rejectFromStation({ id: nowId, uri: now.uri, name: now.title, artist: now.artist }),
      });
    }
    menuItems.push(
      { key: "station", mark: "▶", label: "이 곡으로 스테이션 시작", onSelect: () => void startStation(seed) },
      { key: "add", mark: "+", label: "플레이리스트에 담기", onSelect: () => setAdding(true) },
    );
    if (!stationActive) {
      menuItems.push({
        key: "next",
        mark: "↳",
        label: "다음에 재생",
        confirm: "대기열에 넣었어요",
        onSelect: () =>
          void fetch("/api/spotify/player", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "queue", uri: now.uri, deviceId }),
          }),
      });
    }
    menuItems.push(
      {
        key: "artist",
        mark: "↗",
        label: "아티스트 페이지로 이동",
        dividerBefore: true,
        disabled: !now.artistId,
        onSelect: () => router.push(`/artist/${now.artistId}`),
      },
      {
        key: "album",
        mark: "↗",
        label: "앨범 페이지로 이동",
        disabled: !now.albumId,
        onSelect: () => router.push(`/album/${now.albumId}`),
      },
      {
        key: "link",
        mark: "⧉",
        label: "링크 복사",
        confirm: "복사했어요",
        dividerBefore: true,
        onSelect: () => void navigator.clipboard?.writeText(`https://open.spotify.com/track/${nowId}`),
      },
    );
  }

  return (
    <section className="relative flex h-full w-full items-center gap-[24px] bg-panel px-[16px] text-on-dark">
      <div className="flex w-[340px] shrink-0 items-center gap-[12px]">
        <div className="relative size-[48px] shrink-0 overflow-hidden rounded-[3px] bg-artwork">
          {artwork && (
            <Image
              src={artwork}
              alt={`${title} 앨범 커버`}
              fill
              sizes="48px"
              className="object-cover"
              unoptimized
            />
          )}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <p className="w-full truncate text-[15px] tracking-[-0.2px]" title={title}>
            {title}
          </p>
          {/* a failure replaces the artist line: the bar has no room for a third row */}
          <p
            className={`w-full truncate text-[9px] tracking-[0.6px] ${
              error ? "text-accent-bright" : "text-on-dark-muted"
            }`}
            title={error ?? meta}
          >
            {error ?? meta}
          </p>
        </div>
        {/* was pinned to heart-filled, so it read as liked whatever was playing */}
        <RoundButton
          name={likedNow ? "heart-filled" : "heart-outline"}
          label={
            !likeable ? "재생 중인 곡이 없습니다" : likedNow ? "좋아요 취소" : "좋아요"
          }
          size={30}
          icon={14}
          pressed={likedNow}
          disabled={!likeable}
          onClick={toggleLike}
        />
      </div>

      <div className="flex min-w-0 flex-1 items-center gap-[16px]">
        <div className="flex shrink-0 items-center gap-[14px]">
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
              shuffle ? "text-accent-bright" : "text-on-dark-muted"
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
            className="flex size-[40px] shrink-0 items-center justify-center rounded-pill bg-accent rule disabled:opacity-60"
          >
            <Icon name={isPlaying ? "pause-lg" : "play-lg"} size={16} />
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
              repeatMode > 0 ? "text-accent-bright" : "text-on-dark-muted"
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

        <span className="tnum w-[32px] shrink-0 text-right text-[9px]">{elapsed}</span>
        {/* the hit area is taller than the 5px line it draws, so it can be clicked */}
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
          className={`flex h-[20px] min-w-0 flex-1 items-center ${live ? "cursor-pointer" : ""}`}
        >
          <div className="h-[5px] w-full overflow-hidden rounded-[3px] bg-muted">
            <div
              className="h-full rounded-[3px] bg-accent transition-[width] duration-500"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
        <span className="tnum w-[32px] shrink-0 text-[9px] text-on-dark-muted">{duration}</span>
      </div>

      <div className="flex w-[330px] shrink-0 items-center justify-end gap-[6px]">
        <VolumeControl
          open={volumeOpen}
          onToggle={() => {
            setQueueOpen(false);
            setMoreOpen(false);
            closeLyrics();
            setVolumeOpen((v) => !v);
          }}
        />
        <button
          type="button"
          aria-label="다음에 재생할 곡"
          aria-expanded={queueOpen}
          title="다음에 재생할 곡"
          data-popover-toggle
          onClick={() => {
            closeLyrics();
            setMoreOpen(false);
            setVolumeOpen(false);
            setQueueOpen((v) => !v);
          }}
          className={`flex h-[30px] shrink-0 cursor-pointer items-center gap-[6px] rounded-pill px-[14px] text-[9px] tracking-[0.8px] transition-colors ${
            queueOpen ? "bg-accent text-paper-solid" : "bg-white/12 text-on-dark"
          }`}
        >
          {stationActive && (
            <span
              className={`size-[6px] shrink-0 rounded-pill ${
                stationBusy ? "animate-pulse bg-accent-bright" : "bg-mint"
              }`}
              aria-hidden
            />
          )}
          UP NEXT
          <span className={queueOpen ? "" : "text-on-dark-muted"}>{upNext.length}</span>
        </button>
        {/* a word rather than a glyph: there is no icon in the set for this,
            and "가사" is shorter to read than any mark would be to learn */}
        <button
          type="button"
          aria-label={lyricsOpen ? "가사 닫기" : "가사 보기"}
          aria-pressed={lyricsOpen}
          title={lyricsOpen ? "가사 닫기" : "가사 보기"}
          disabled={!live}
          data-popover-toggle
          onClick={() => {
            setQueueOpen(false);
            setMoreOpen(false);
            setVolumeOpen(false);
            toggleLyrics();
          }}
          className={`flex h-[30px] shrink-0 items-center rounded-pill px-[12px] text-[10px] leading-none transition-colors rule disabled:opacity-40 ${
            lyricsOpen
              ? "bg-accent-bright text-paper-solid"
              : "bg-glass text-ink"
          }`}
        >
          가사
        </button>
        <RoundButton
          name="plus"
          label="플레이리스트에 담기"
          size={30}
          icon={14}
          disabled={!likeable}
          onClick={() => {
            setQueueOpen(false);
            setMoreOpen(false);
            setVolumeOpen(false);
            closeLyrics();
            setAdding(true);
          }}
        />
        <span data-popover-toggle className="flex shrink-0">
          <RoundButton
            name="more"
            label="세부 기능"
            size={30}
            icon={14}
            disabled={!likeable}
            pressed={moreOpen}
            onClick={() => {
              setQueueOpen(false);
              setVolumeOpen(false);
              closeLyrics();
              setMoreOpen((v) => !v);
            }}
          />
        </span>
      </div>

      {queueOpen && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-label="다음에 재생할 곡"
          className="absolute bottom-[calc(100%+8px)] right-[16px] z-30 flex w-[380px] flex-col gap-[12px] rounded-[8px] bg-panel p-[16px] shadow-[0_-4px_20px_rgba(0,0,0,0.35)]"
        >
          {/* the status itself opens the station screen; STOP stays a separate
              control beside it, since a button cannot be nested inside a button */}
          {stationActive && (
            <div className="flex w-full shrink-0 items-center gap-[8px] rounded-[4px] bg-white/10 px-[8px] py-[6px]">
              <button
                type="button"
                onClick={() => {
                  setQueueOpen(false);
                  router.push("/station");
                }}
                title="스테이션 화면 열기"
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-[8px] text-left transition-opacity hover:opacity-70"
              >
                <span
                  className={`size-[6px] shrink-0 rounded-pill ${
                    stationBusy ? "animate-pulse bg-accent-bright" : "bg-mint"
                  }`}
                  aria-hidden
                />
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="flex items-center gap-[8px] text-[10px] tracking-[0.5px] text-on-dark-muted">
                    {stationBusy ? (
                      <>
                        {stationBusy}
                        <LoadingDots size={4} label={stationBusy} />
                      </>
                    ) : stationQueue.length ? (
                      "STATION 재생 중"
                    ) : (
                      "유사곡을 찾지 못했습니다"
                    )}
                  </span>
                  <span className="truncate text-[9px] text-on-dark">{stationSeed}</span>
                </span>
                <span aria-hidden className="shrink-0 text-[11px] leading-none text-on-dark-muted">
                  →
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  stopStation();
                  setQueueOpen(false);
                  router.push("/");
                }}
                title="스테이션 종료"
                className="shrink-0 rounded-pill bg-on-dark-muted px-[8px] py-[4px] text-[8px] tracking-[0.6px] text-panel"
              >
                STOP
              </button>
            </div>
          )}

          <div className="flex w-full shrink-0 items-center justify-between whitespace-nowrap">
            <p className="text-[10px] tracking-[1px] text-on-dark">UP NEXT</p>
            <p className="flex items-center gap-[8px] text-[10px] tracking-[0.5px] text-on-dark-muted">
              {upNext.length ? (
                `${upNext.length} TRACKS · ${stationActive ? "STATION" : `SHUFFLE ${shuffle ? "ON" : "OFF"}`}`
              ) : stationBusy ? (
                <>
                  채우는 중
                  <LoadingDots size={4} label="채우는 중" />
                </>
              ) : (
                "대기열 없음"
              )}
            </p>
          </div>

          <ul className="scroll-y flex max-h-[min(340px,50vh)] w-full flex-col">
            {upNext.map(({ uri, track }) => (
              <QueueItem
                key={`${track.index}-${track.title}`}
                track={track}
                onPlay={uri ? () => playRow(uri) : undefined}
              />
            ))}
          </ul>
        </div>
      )}

      {lyricsOpen && <LyricsPopover ref={popoverRef} />}

      {moreOpen && now && nowId && (
        <PlayerMenu ref={popoverRef} items={menuItems} onClose={() => setMoreOpen(false)} />
      )}

      {adding && likeTrack && (
        <AddToPlaylistModal track={{ ...likeTrack, albumId: likeTrack.albumId ?? null }} onClose={closeAdding} />
      )}
    </section>
  );
}
