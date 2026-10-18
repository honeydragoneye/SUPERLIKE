"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MENU_ITEM, TrashIcon } from "./track-menu";

/** Which tag was right-clicked, and where the pointer was. */
export type TagMenuTarget = { key: string; label: string; x: number; y: number };

/** Space kept between the menu and the window's edges. */
const GAP = 6;

/**
 * What a right-click on one of the listener's own tags offers: deleting it.
 *
 * It opens at the pointer rather than hanging from the pill, because it was
 * asked for there — and like the ··· menu it is rendered into <body>, so the
 * TAGS column's own clipping cannot cut it off. It goes away on anything that
 * would leave it pointing at the wrong place: a scroll, a resize, a click
 * elsewhere, Escape.
 */
export function TagMenu({
  target,
  onClose,
  onDelete,
  deleteDisabled = false,
}: {
  target: TagMenuTarget | null;
  onClose: () => void;
  onDelete: (key: string) => void;
  /** a tag that is on cannot be taken away while the station is rebuilding for it */
  deleteDisabled?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [at, setAt] = useState<{ left: number; top: number } | null>(null);

  // measured once it exists, before it is painted: its own size decides whether it fits
  useLayoutEffect(() => {
    const menu = ref.current;
    if (!target || !menu) return;
    setAt({
      left: Math.max(GAP, Math.min(target.x, window.innerWidth - menu.offsetWidth - GAP)),
      top: Math.max(GAP, Math.min(target.y, window.innerHeight - menu.offsetHeight - GAP)),
    });
    menu.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
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
      aria-label={`${target.label} 태그`}
      // a second right-click on the menu itself should not open the browser's own
      onContextMenu={(e) => e.preventDefault()}
      style={{ left: at?.left ?? 0, top: at?.top ?? 0, visibility: at ? "visible" : "hidden" }}
      className="fixed z-50 flex w-[132px] flex-col gap-[2px] rounded-[6px] bg-paper-solid p-[6px] text-ink shadow-[0_6px_18px_rgba(0,0,0,0.18)] rule"
    >
      <button
        type="button"
        role="menuitem"
        disabled={deleteDisabled}
        title={deleteDisabled ? "스테이션을 만드는 중에는 지울 수 없어요" : undefined}
        onClick={() => {
          onDelete(target.key);
          onClose();
        }}
        className={`${MENU_ITEM} disabled:cursor-default disabled:opacity-40`}
      >
        <TrashIcon />
        삭제
      </button>
    </div>,
    document.body,
  );
}
