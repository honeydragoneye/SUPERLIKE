"use client";

import { useEffect, useRef, useState } from "react";
import { useConnectDialog } from "@/components/player/connect-dialog";
import { useSpotify } from "@/components/player/spotify-provider";
import { onOpenRadioPopover } from "@/components/radio/open-popover";
import { RadioPopover } from "@/components/radio/radio-popover";
import { useRadio } from "@/components/radio/radio-provider";
import { Equalizer, HeartIcon, PlayPauseIcon } from "@/components/radio/station-parts";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useHydrated } from "@/components/ui/use-hydrated";

const NOTE = "whitespace-nowrap text-[9px] tracking-[0.4px] opacity-80";
const PILL =
  "shrink-0 cursor-pointer rounded-pill bg-[rgba(250,252,254,0.93)] px-[9px] py-[3px] text-[8px] leading-[10px] tracking-[0.6px] text-black transition-opacity hover:opacity-80";

/**
 * The strip above the header: a radio.
 *
 * It offers a station picked for what the listener plays lately (or the one
 * they hearted last), plays it on request, and opens a list of other stations
 * and the favourites. Without a Spotify session there is no taste to pick from,
 * so it says what connecting gives.
 */
export function Ticker() {
  const radio = useRadio();
  const { connected } = useSpotify();
  const hydrated = useHydrated();
  const { ask, dialog } = useConnectDialog();

  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (menu.current && !menu.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // the mypage's "다른 방송국 찾기" opens this same popup
  useEffect(() => onOpenRadioPopover(() => setOpen(true)), []);

  const live = hydrated && connected;
  const { current, status, picks } = radio;
  const playing = status === "playing";
  const loading = status === "loading";
  const faved = current ? radio.isFavorite(current.uuid) : false;

  const reason = current?.matched?.length
    ? `${current.matched[0]} 취향이라 골랐어요`
    : current && faved
      ? "즐겨찾기한 방송국"
      : null;

  return (
    <div className="relative z-40 flex h-[30px] shrink-0 items-center gap-[14px] bg-ticker px-[34px] text-paper-solid">
      <p className="flex shrink-0 items-center gap-[5px] whitespace-nowrap text-[9px] tracking-[0.6px]">
        <span
          aria-hidden
          title={live ? "Spotify 연결됨" : "Spotify 연결 안 됨"}
          className={`size-[6px] rounded-full ${live ? "bg-live" : "bg-offline"}`}
        />
        ON AIR
      </p>

      {!live ? (
        <>
          <p className={NOTE}>Spotify를 연결하면 요즘 취향에 맞는 라디오를 추천해요</p>
          <button type="button" onClick={ask} className={PILL}>
            Spotify 연결
          </button>
        </>
      ) : current ? (
        <>
          <button
            type="button"
            onClick={() => void radio.toggle()}
            aria-label={playing || loading ? "일시정지" : "재생"}
            className="flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-card text-ticker transition-opacity hover:opacity-80"
          >
            {loading ? <LoadingDots size={3} /> : <PlayPauseIcon playing={playing} size={8} />}
          </button>
          {/* the heavier, larger type reads lower than the 9px lines beside it at the same baseline */}
          <p className="relative -top-[0.5px] max-w-[260px] shrink-0 truncate text-[10px] font-black" title={current.name}>
            {current.name}
          </p>
          <button
            type="button"
            onClick={() => void radio.toggleFavorite(current)}
            aria-label={faved ? "즐겨찾기 해제" : "즐겨찾기"}
            aria-pressed={faved}
            className="flex size-[18px] shrink-0 cursor-pointer items-center justify-center rounded-full bg-white/20 text-heart transition-colors hover:bg-white/30"
          >
            <HeartIcon filled={faved} size={10} />
          </button>
          {status === "error" ? (
            <>
              <p className={NOTE}>방송이 끊겼어요 · 같은 취향의 다른 방송국으로 바꿔볼까요?</p>
              <button type="button" onClick={() => void radio.toggle()} className={PILL}>
                다시 시도
              </button>
            </>
          ) : loading ? (
            <p className={NOTE}>연결하는 중…</p>
          ) : (
            <>
              <p className={NOTE}>{[current.countryCode, current.tags[0]].filter(Boolean).join(" · ")}</p>
              {reason && <p className={`${NOTE} truncate`}>{reason}</p>}
              {playing && <Equalizer />}
            </>
          )}
        </>
      ) : (
        <p className={`${NOTE} flex items-center gap-[8px]`}>
          {picks.loading ? (
            <>
              취향에 맞는 라디오를 찾는 중
              <LoadingDots size={3} />
            </>
          ) : (
            "조금 더 들으면 취향에 맞는 라디오를 추천해요"
          )}
        </p>
      )}

      <div className="min-w-px flex-1" />

      {live && (
        <div ref={menu} className="relative flex shrink-0 items-center">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            aria-haspopup="dialog"
            className={PILL}
          >
            다른 방송국
          </button>
          {open && <RadioPopover />}
        </div>
      )}

      <p className={`shrink-0 ${NOTE}`}>© SUPERLIKE 2026</p>
      {dialog}
    </div>
  );
}
