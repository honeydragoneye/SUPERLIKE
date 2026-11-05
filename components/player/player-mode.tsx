"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Icon, TintedIcon } from "@/components/ui/icon";
import { TrackMore } from "@/components/ui/more-menu";
import { clock } from "@/lib/time";
import { usePlaybackPosition, useSpotify } from "./spotify-provider";
import { useLikeNowPlaying } from "./use-likes";
import { Speaker, wavesOf } from "./volume-control";

export type PlayerModeRow = {
  uri: string;
  title: string;
  artist: string;
  artwork: string | null;
  durationMs: number;
};

/** How far the page is scrolled before the player shrinks to a strip at the top. */
const STRIP_AT = 120;

/** the player's column: as wide as the cover, which is as big as the window's height allows */
const COVER = "min(480px, 34vh)";
/** the rest of the column is never narrower than the buttons need, even where the window is short */
const COL = "max(min(480px, 34vh), 400px)";

/**
 * 플레이어 모드: the song playing, big and in the middle of the window.
 *
 * Scrolling a little reveals the list that plays next; the player then stays at
 * the top as a strip so it can still be worked. It hangs over the whole page
 * (a portal), so nothing behind it needs to know it is there. The cover of the
 * player bar opens it; ✕ or Escape closes it.
 */
export function PlayerMode({
  upNext,
  onPlay,
  onClose,
}: {
  upNext: PlayerModeRow[];
  /** a row of the list was pressed */
  onPlay: (uri: string) => void;
  onClose: () => void;
}) {
  const sp = useSpotify();
  const position = usePlaybackPosition();
  const { liked, track: likeTrack, toggleLike } = useLikeNowPlaying();
  const [scrolled, setScrolled] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const now = sp.now;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = overflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  const durationMs = now?.durationMs ?? 0;
  const progress = durationMs ? Math.min(100, (position / durationMs) * 100) : 0;
  const playing = now !== null && !now.paused;
  const repeatLabel = sp.repeatMode === 2 ? "한 곡 반복" : sp.repeatMode === 1 ? "전체 반복" : "반복 없음";
  const nowId = now?.uri.startsWith("spotify:track:") ? now.uri.slice(14) : null;

  const seekTo = (e: React.MouseEvent<HTMLElement>) => {
    if (!now) return;
    const box = e.currentTarget.getBoundingClientRect();
    void sp.seek(Math.round(((e.clientX - box.left) / box.width) * now.durationMs));
  };

  const prev = (
    <button type="button" aria-label="이전 곡" onClick={() => void sp.previous()} className="cursor-pointer text-paper-solid transition-opacity hover:opacity-70">
      <TintedIcon name="prev" size={30} />
    </button>
  );
  const nextBtn = (
    <button type="button" aria-label="다음 곡" onClick={() => void sp.next()} className="cursor-pointer text-paper-solid transition-opacity hover:opacity-70">
      <TintedIcon name="next" size={30} />
    </button>
  );
  const playBtn = (size: number) => (
    <button
      type="button"
      aria-label={playing ? "일시정지" : "재생"}
      onClick={() => void sp.toggle()}
      style={{ width: size, height: size }}
      className="flex shrink-0 cursor-pointer items-center justify-center rounded-pill bg-accent-bright transition-colors hover:bg-accent"
    >
      <Icon name={playing ? "pause-lg" : "play-lg"} size={Math.round(size * 0.38)} />
    </button>
  );

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="플레이어 모드"
      ref={box}
      onScroll={(e) => setScrolled(e.currentTarget.scrollTop > STRIP_AT)}
      className="scroll-y fixed inset-0 z-[70] snap-y snap-mandatory overflow-y-auto scroll-smooth bg-[#17191e] text-paper-solid"
    >
      {/* the cover, blurred, as the colour of the room */}
      {now?.artwork && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={now.artwork} alt="" aria-hidden className="pointer-events-none fixed inset-0 size-full scale-125 object-cover opacity-45 blur-[70px]" />
      )}
      <div className="pointer-events-none fixed inset-0 bg-gradient-to-b from-black/10 via-black/30 to-black/70" />

      {/* close, the strip that appears once the list is in view, and the volume */}
      <div className="fixed inset-x-0 top-0 z-10 flex items-center justify-between gap-[16px] p-[20px]">
        <button
          type="button"
          aria-label="닫기"
          title="닫기 (Esc)"
          onClick={onClose}
          className="flex size-[52px] shrink-0 cursor-pointer items-center justify-center rounded-pill bg-white/15 text-[22px] font-black transition-colors hover:bg-white/25"
        >
          ✕
        </button>

        <div
          aria-hidden={!scrolled}
          className={`flex h-[64px] w-full max-w-[640px] items-center gap-[12px] rounded-[10px] bg-white/12 px-[12px] backdrop-blur-md transition-all duration-300 ${
            scrolled ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-[12px] opacity-0"
          }`}
        >
          <span className="relative size-[44px] shrink-0 overflow-hidden rounded-[4px] bg-artwork">
            {now?.artwork && <Image src={now.artwork} alt="" fill sizes="44px" className="object-cover" unoptimized />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-[14px] font-black">{now?.title}</span>
            <span className="truncate text-[11px] text-on-dark-muted">{now?.artist}</span>
          </span>
          {prev}
          {playBtn(40)}
          {nextBtn}
        </div>

        <div className="flex h-[40px] shrink-0 items-center gap-[10px] rounded-pill bg-white/15 pl-[14px] pr-[16px]">
          <button
            type="button"
            aria-label={sp.muted ? "음소거 해제" : "음소거"}
            title={sp.muted ? "음소거 해제" : "음소거"}
            onClick={sp.toggleMute}
            className="flex shrink-0 cursor-pointer items-center transition-opacity hover:opacity-70"
          >
            <Speaker waves={wavesOf(sp.volume)} muted={sp.muted || sp.volume === 0} size={18} />
          </button>
          <input
            type="range"
            aria-label="음량"
            min={0}
            max={100}
            step={1}
            value={Math.round((sp.muted ? 0 : sp.volume) * 100)}
            onChange={(e) => sp.setVolume(Number(e.target.value) / 100)}
            className="h-[4px] w-[110px] cursor-pointer accent-accent-bright"
          />
          <span className="tnum w-[26px] shrink-0 text-right text-[10px] tracking-[0.5px]">{sp.muted ? "0" : Math.round(sp.volume * 100)}</span>
        </div>
      </div>

      {/* the player, in the middle: a whole window high, so the list is not in sight until it is asked for */}
      <section className="relative flex h-screen snap-start flex-col items-center justify-center gap-[clamp(18px,4.2vh,48px)] px-[24px] pb-[20px] pt-[76px]">
        <div className="flex w-full flex-col items-center gap-[clamp(10px,2.2vh,26px)]">
          <span className="relative aspect-square w-full overflow-hidden rounded-[10px] bg-artwork mb-[clamp(8px,2.6vh,30px)] shadow-[0_24px_60px_rgba(0,0,0,0.5)]" style={{ width: COVER, alignSelf: "center" }}>
            {now?.artwork && <Image src={now.artwork} alt={`${now.title} 앨범 커버`} fill sizes="460px" className="object-cover" unoptimized priority />}
          </span>

          <div className="flex items-end gap-[12px]" style={{ width: COL, alignSelf: "center" }}>
            <div className="flex min-w-0 flex-1 flex-col gap-[6px]">
              <h2 className="truncate text-[clamp(24px,3.8vh,40px)] font-black leading-[1.1] tracking-[-0.8px]" title={now?.title}>
                {now?.title ?? "재생 중인 곡 없음"}
              </h2>
              <p className="truncate text-[clamp(11px,1.7vh,15px)] font-bold uppercase tracking-[1.6px] text-on-dark-muted" title={now ? `${now.artist} · ${now.album}` : undefined}>
                {now ? `${now.artist} · ${now.album}` : ""}
              </p>
            </div>
            <button
              type="button"
              aria-label={liked ? "좋아요 취소" : "좋아요"}
              disabled={!likeTrack}
              onClick={toggleLike}
              className="flex size-[42px] shrink-0 cursor-pointer items-center justify-center rounded-pill bg-white/15 transition-colors hover:bg-white/25 disabled:opacity-40"
            >
              <Icon name={liked ? "heart-filled" : "heart-outline"} size={20} />
            </button>
            {now && nowId && (
              <span className="group flex shrink-0">
                <TrackMore
                  className="size-[42px]! rounded-pill bg-white/15 text-[20px]! text-on-dark! opacity-100! hover:bg-white/25"
                  track={{ id: nowId, uri: now.uri, title: now.title, artist: now.artist, artwork: now.artwork, durationMs: now.durationMs, albumId: now.albumId, artistId: now.artistId }}
                />
              </span>
            )}
          </div>

          <div className="flex flex-col gap-[6px]" style={{ width: COL, alignSelf: "center" }}>
            <div role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100} aria-label="재생 진행률" onClick={seekTo} className="flex h-[22px] cursor-pointer items-center">
              <div className="h-[8px] w-full overflow-hidden rounded-[4px] bg-white/25">
                <div className="h-full rounded-[4px] bg-accent-bright transition-[width] duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>
            <div className="tnum flex justify-between text-[clamp(11px,1.7vh,15px)] font-bold text-on-dark-muted">
              <span>{clock(position)}</span>
              <span>{durationMs ? clock(durationMs) : "0:00"}</span>
            </div>
          </div>

          <div className="flex items-center justify-between" style={{ width: COL, alignSelf: "center" }}>
            <button
              type="button"
              aria-label={sp.shuffle ? "셔플 끄기" : "셔플 켜기"}
              aria-pressed={sp.shuffle}
              onClick={() => void sp.toggleShuffle()}
              className={`cursor-pointer transition-colors ${sp.shuffle ? "text-accent-bright" : "text-on-dark-muted hover:text-paper-solid"}`}
            >
              <TintedIcon name="shuffle" size={26} />
            </button>
            {prev}
            {playBtn(80)}
            {nextBtn}
            <button
              type="button"
              aria-label={repeatLabel}
              title={repeatLabel}
              onClick={() => void sp.cycleRepeat()}
              className={`relative cursor-pointer transition-colors ${sp.repeatMode > 0 ? "text-accent-bright" : "text-on-dark-muted hover:text-paper-solid"}`}
            >
              <TintedIcon name="repeat" size={26} />
              {sp.repeatMode === 2 && <span className="tnum absolute -right-[4px] -top-[4px] text-[9px] font-black leading-none">1</span>}
            </button>
          </div>
        </div>

        <button
          type="button"
          aria-label="다음 재생 목록 보기"
          title="다음 재생 목록"
          onClick={() => box.current?.scrollTo({ top: box.current.clientHeight, behavior: "smooth" })}
          className="flex size-[44px] shrink-0 cursor-pointer items-center justify-center rounded-pill bg-white/15 transition-colors hover:bg-white/25"
        >
          <svg width="22" height="14" viewBox="0 0 22 14" fill="none" aria-hidden>
            <path d="M2 2l9 9 9-9" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </section>

      {/* what plays next */}
      <section className="relative mx-auto flex min-h-screen w-[min(900px,100%)] snap-start flex-col gap-[4px] px-[24px] pb-[96px] pt-[104px]">
        <div className="flex items-end justify-between gap-[12px] pb-[12px]">
          <div className="flex flex-col gap-[2px]">
            <h3 className="text-[22px] font-black tracking-[-0.4px]">다음 재생 목록</h3>
            <p className="text-[12px] text-on-dark-muted">{sp.stationActive ? "스테이션 큐" : sp.shuffle ? "셔플 켜짐" : "재생 순서대로"}</p>
          </div>
          <p className="text-[11px] tracking-[0.5px] text-on-dark-muted">{upNext.length ? `${upNext.length} TRACKS` : "대기열 없음"}</p>
        </div>
        <ul className="flex flex-col border-t border-white/15">
          {upNext.map((t, i) => (
            <li key={`${t.uri}-${i}`} className="group relative border-b border-white/10 transition-colors hover:bg-white/10">
              <button type="button" onClick={() => t.uri && onPlay(t.uri)} className="flex h-[68px] w-full cursor-pointer items-center gap-[14px] pr-[56px] text-left">
                <span className="tnum w-[36px] shrink-0 text-center text-[13px] font-bold text-on-dark-muted">{String(i + 1).padStart(2, "0")}</span>
                <span className="relative size-[48px] shrink-0 overflow-hidden rounded-[4px] bg-artwork">
                  {t.artwork && <Image src={t.artwork} alt="" fill sizes="48px" className="object-cover" unoptimized />}
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-px">
                  <span className="truncate text-[15px] font-bold">{t.title}</span>
                  <span className="truncate text-[12px] text-on-dark-muted">{t.artist}</span>
                </span>
                <span className="tnum shrink-0 text-[12px] text-on-dark-muted">{clock(t.durationMs)}</span>
              </button>
              {t.uri.startsWith("spotify:track:") && (
                <TrackMore
                  className="absolute right-[12px] top-1/2 -translate-y-1/2 text-on-dark!"
                  track={{ id: t.uri.slice(14), uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork, durationMs: t.durationMs }}
                />
              )}
            </li>
          ))}
        </ul>
      </section>
    </div>,
    document.body,
  );
}
