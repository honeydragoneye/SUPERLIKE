"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { RejectTarget } from "@/lib/station/rejects";

/** Which row's menu is open, and the ··· it hangs from. */
export type TrackMenuTarget = { track: RejectTarget; anchor: HTMLElement };

/** Space kept between the menu and the button, and between it and the window. */
const GAP = 6;

export const MENU_ITEM =
  "flex h-[34px] w-full shrink-0 cursor-pointer items-center gap-[10px] rounded-[4px] px-[10px] text-left text-[11px] tracking-[0.5px] outline-none hover:bg-gold focus-visible:bg-gold";

/** Not exported from Figma yet, so it is drawn here in the icons' own weight. */
export function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="shrink-0">
      <path
        d="M2.5 3.75h9M5.5 3.75V2.5h3v1.25M3.5 3.75l.5 7.75h6l.5-7.75M5.9 6v3.4M8.1 6v3.4"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/** "No", in the same weight: a circle struck through. */
function NotIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden className="shrink-0">
      <circle cx="7" cy="7" r="4.9" stroke="currentColor" strokeWidth="1.2" />
      <path d="M3.6 10.4l6.8-6.8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * What can be done with one track, hung under its ··· button.
 *
 * Each item is offered only by a caller that can carry it out: the station's
 * rows can be removed, the track playing cannot, and "아님" exists only while a
 * mood tag is on to be wrong about it.
 *
 * Rendered into <body> and placed by the button's own rectangle: the list sits
 * inside a scrolling column, and a menu positioned within it would be clipped
 * at the column's edge exactly where the buttons are.
 *
 * It closes on anything that moves the button out from under it — a scroll, a
 * resize — rather than chasing it, which is what a menu this short-lived owes.
 */
export function TrackMenu({
  target,
  onClose,
  onRemove,
  reject,
}: {
  target: TrackMenuTarget | null;
  onClose: () => void;
  onRemove?: (track: RejectTarget) => void;
  /** the mood tag that is on, and what to do when the listener says it is wrong */
  reject?: { label: string; onReject: (track: RejectTarget) => void } | null;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  /**
   * Measured after the menu exists, before it is painted: its own size decides
   * whether it fits below the button and inside the window's right edge.
   */
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!target || !menu) return;
    const button = target.anchor.getBoundingClientRect();
    const left = Math.max(
      GAP,
      Math.min(button.left, window.innerWidth - menu.offsetWidth - GAP),
    );
    const below = button.bottom + GAP;
    const top =
      below + menu.offsetHeight + GAP > window.innerHeight
        ? Math.max(GAP, button.top - GAP - menu.offsetHeight)
        : below;
    setAt({ left, top });
    menu.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onDown = (e: PointerEvent) => {
      const hit = e.target as Node;
      // the button toggles the menu itself; closing here too would reopen it
      if (ref.current?.contains(hit) || target.anchor.contains(hit)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      onClose();
      target.anchor.focus();
    };
    window.addEventListener("pointerdown", onDown);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onClose);
    // capture: the column scrolls, not the window, and scroll does not bubble
    window.addEventListener("scroll", onClose, true);
    return () => {
      window.removeEventListener("pointerdown", onDown);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", onClose, true);
    };
  }, [target, onClose]);

  if (!target) return null;

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={`${target.track.name} 세부 기능`}
      style={{ left: at?.left ?? 0, top: at?.top ?? 0, visibility: at ? "visible" : "hidden" }}
      className="fixed z-50 flex w-[168px] flex-col gap-[2px] rounded-[6px] bg-paper-solid p-[6px] text-ink shadow-[0_6px_18px_rgba(0,0,0,0.18)] rule"
    >
      {onRemove && (
        <button
          type="button"
          role="menuitem"
          onClick={() => {
            onRemove(target.track);
            onClose();
          }}
          className={MENU_ITEM}
        >
          <TrashIcon />
          삭제
        </button>
      )}
      {reject && (
        <button
          type="button"
          role="menuitem"
          title={`${reject.label} 태그에서 이 곡을 다시 넣지 않습니다`}
          onClick={() => {
            reject.onReject(target.track);
            onClose();
          }}
          className={MENU_ITEM}
        >
          <NotIcon />
          {reject.label} 아님
        </button>
      )}
    </div>,
    document.body,
  );
}
