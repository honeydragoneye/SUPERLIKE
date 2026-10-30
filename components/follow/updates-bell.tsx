"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSpotify } from "@/components/player/spotify-provider";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useHydrated } from "@/components/ui/use-hydrated";
import { loadFollows, markRead, useFollowState } from "./follow-store";
import { UpdateRow } from "./update-row";

/** How many releases the popup lists; the rest are on the mypage. */
const SHOWN = 4;

function BellIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M8 1.5C5.2 1.5 3.5 3.6 3.5 6.2V9L2 11.5h12L12.5 9V6.2C12.5 3.6 10.8 1.5 8 1.5ZM6.3 13.2c.3 1 .9 1.5 1.7 1.5s1.4-.5 1.7-1.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The bell in the header: how many releases of followed artists have not been
 * seen, and the latest ones in a popup.
 *
 * Shown only with an account, since there is nothing to follow without one.
 * What was on show when the popup closes counts as seen. The popup is drawn
 * outside the header (a portal) because the header clips what overflows it.
 */
export function UpdatesBell() {
  const { connected: session } = useSpotify();
  const hydrated = useHydrated();
  const connected = hydrated && session;
  const { items, unread, artists, status, checkError } = useFollowState();
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [at, setAt] = useState<{ top: number; right: number } | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  /** the unread ones that were on show, which closing the popup marks read */
  const seen = useRef<string[]>([]);

  const shown = items.slice(0, SHOWN);

  const close = useCallback(() => {
    setOpen(false);
    if (seen.current.length) void markRead(seen.current);
    seen.current = [];
  }, []);

  const place = useCallback(() => {
    const r = button.current?.getBoundingClientRect();
    if (r) setAt({ top: r.bottom + 13, right: Math.max(8, window.innerWidth - r.right) });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    seen.current = shown.filter((i) => i.unread).map((i) => i.id);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (popup.current?.contains(t) || button.current?.contains(t)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", place);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", place);
    };
    // the unread ones are remembered once per opening, not as the list moves
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, place, close]);

  if (!connected) return null;

  const heading = "text-[12px] text-on-dark";
  const note = "text-[9px] leading-[14px] tracking-[0.4px] text-on-dark-muted";

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={unread ? `소식 · 읽지 않은 ${unread}개` : "소식"}
        aria-expanded={open}
        title="소식"
        onClick={() => (open ? close() : setOpen(true))}
        className="relative flex size-[36px] shrink-0 cursor-pointer items-center justify-center rounded-pill bg-paper text-ink transition-colors rule hover:bg-accent"
      >
        <BellIcon />
        {unread > 0 && (
          <span className="tnum absolute -right-[3px] -top-[3px] flex h-[15px] min-w-[15px] items-center justify-center rounded-full bg-accent-bright px-[4px] text-[8px] leading-none text-paper-solid">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open &&
        at &&
        createPortal(
          <div
            ref={popup}
            role="dialog"
            aria-label="소식"
            style={{ top: at.top, right: at.right }}
            className="fixed z-50 flex w-[380px] max-w-[calc(100vw-16px)] flex-col gap-[10px] rounded-[8px] bg-[#1f1f1f] p-[16px] text-on-dark shadow-[0_4px_20px_rgba(0,0,0,0.35)]"
          >
            <div className="flex items-center justify-between text-[11px]">
              <span>소식</span>
              {shown.length > 0 && (
                <button
                  type="button"
                  disabled={unread === 0}
                  onClick={() => {
                    seen.current = [];
                    void markRead();
                  }}
                  className="cursor-pointer text-[9px] text-on-dark-muted transition-colors enabled:hover:text-on-dark disabled:cursor-default disabled:opacity-40"
                >
                  모두 읽음으로
                </button>
              )}
            </div>

            {status === "loading" && shown.length === 0 && (
              <p className="flex items-center gap-[8px] py-[14px] text-[10px] text-on-dark-muted">
                새 소식을 확인하는 중
                <LoadingDots size={4} />
              </p>
            )}

            {status === "error" && shown.length === 0 && (
              <div className="flex flex-col items-start gap-[8px] py-[4px]">
                <p className="text-[10px] text-[#ff9b9b]">새 소식을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.</p>
                <button
                  type="button"
                  onClick={() => void loadFollows(true)}
                  className="cursor-pointer whitespace-nowrap rounded-pill bg-on-dark px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-panel"
                >
                  다시 확인
                </button>
              </div>
            )}

            {status === "ok" && artists.length === 0 && (
              <div className="flex flex-col items-start gap-[6px] py-[4px]">
                <p className={heading}>팔로우한 가수가 없어요</p>
                <p className={note}>아티스트 페이지에서 팔로우하면 그 가수의 새 앨범을 알려 드려요.</p>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    router.push("/search");
                  }}
                  className="cursor-pointer whitespace-nowrap rounded-pill bg-on-dark px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-panel"
                >
                  가수 찾아보기 →
                </button>
              </div>
            )}

            {status === "ok" && artists.length > 0 && shown.length === 0 && (
              <p className={`${heading} py-[4px]`}>아직 새 앨범이 없어요</p>
            )}

            {shown.length > 0 && (
              <ul className="flex flex-col">
                {shown.map((u) => (
                  <UpdateRow key={u.id} item={u} dark onOpen={close} />
                ))}
              </ul>
            )}

            {checkError && shown.length > 0 && (
              <div className="flex items-center gap-[10px]">
                <p className="text-[10px] text-[#ff9b9b]">새 소식을 다 확인하지 못했어요.</p>
                <button
                  type="button"
                  onClick={() => void loadFollows(true)}
                  className="cursor-pointer whitespace-nowrap rounded-pill bg-on-dark px-[10px] py-[4px] text-[8px] tracking-[0.7px] text-panel"
                >
                  다시 확인
                </button>
              </div>
            )}

            {artists.length > 0 && (
              <div className="flex items-center justify-between pt-[4px] text-[9px]">
                <Link href="/mypage?panel=updates" onClick={close} className="text-on-dark/90 transition-colors hover:text-on-dark">
                  전체 보기 →
                </Link>
                <Link href="/mypage?panel=following" onClick={close} className="text-on-dark-muted transition-colors hover:text-on-dark">
                  팔로우 관리
                </Link>
              </div>
            )}
          </div>,
          document.body,
        )}
    </>
  );
}
