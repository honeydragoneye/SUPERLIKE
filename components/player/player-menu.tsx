"use client";

import { forwardRef, useState, type CSSProperties } from "react";

export type PlayerMenuItem = {
  key: string;
  label: string;
  /** the small mark in front, in pink */
  mark: string;
  onSelect: () => void;
  disabled?: boolean;
  /** items after a divider start a new group */
  dividerBefore?: boolean;
  /** stays open after the press, to say what happened in place of the label */
  confirm?: string;
};

/**
 * What can be done with the track playing, hung above the ··· on the bar.
 *
 * It lives in the same place as UP NEXT and the lyrics — a dark popover over
 * the bar — and the panel keeps the three to one open at a time. Each item is
 * offered by the panel only when it can carry it out.
 */
/** hung above the bar's ··· */
const ABOVE_BAR = "absolute bottom-[calc(100%+8px)] right-[16px] z-30 shadow-[0_-4px_20px_rgba(0,0,0,0.35)]";

/**
 * The same menu serves the ··· on a song row or an album cover: `className` and
 * `style` then say where it sits (components/ui/more-menu.tsx pins it to the button).
 */
export const PlayerMenu = forwardRef<
  HTMLDivElement,
  { items: PlayerMenuItem[]; onClose: () => void; className?: string; style?: CSSProperties }
>(
  function PlayerMenu({ items, onClose, className = ABOVE_BAR, style }, ref) {
    const [said, setSaid] = useState<string | null>(null);

    return (
      <div
        ref={ref}
        role="menu"
        aria-label="세부 기능"
        style={style}
        className={`flex flex-col bg-[#1f1f1f] w-[248px] rounded-[8px] p-[8px] text-on-dark ${className}`}
      >
        {items.map((item) => (
          <div key={item.key} className="contents">
            {item.dividerBefore && <div className={`my-[4px] h-px bg-on-dark/15`} aria-hidden />}
            <button
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                item.onSelect();
                if (item.confirm) {
                  setSaid(item.key);
                  setTimeout(onClose, 900);
                } else onClose();
              }}
              className={`flex w-full cursor-pointer items-center rounded-[6px] text-left gap-[10px] px-[10px] py-[9px] text-[12px] outline-none transition-colors hover:bg-white/10 focus-visible:bg-white/10 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent`}
            >
              <span className={`shrink-0 text-center w-[14px] text-[11px] text-accent-bright`} aria-hidden>
                {said === item.key ? "✓" : item.mark}
              </span>
              {said === item.key ? item.confirm : item.label}
            </button>
          </div>
        ))}
      </div>
    );
  },
);
