"use client";

import { forwardRef, useState } from "react";

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
export const PlayerMenu = forwardRef<HTMLDivElement, { items: PlayerMenuItem[]; onClose: () => void }>(
  function PlayerMenu({ items, onClose }, ref) {
    const [said, setSaid] = useState<string | null>(null);

    return (
      <div
        ref={ref}
        role="menu"
        aria-label="세부 기능"
        className="absolute bottom-[calc(100%+8px)] right-[16px] z-30 flex w-[248px] flex-col rounded-[8px] bg-[#1f1f1f] p-[8px] text-on-dark shadow-[0_-4px_20px_rgba(0,0,0,0.35)]"
      >
        {items.map((item) => (
          <div key={item.key} className="contents">
            {item.dividerBefore && <div className="my-[4px] h-px bg-on-dark/15" aria-hidden />}
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
              className="flex w-full cursor-pointer items-center gap-[10px] rounded-[6px] px-[10px] py-[9px] text-left text-[12px] outline-none transition-colors hover:bg-white/10 focus-visible:bg-white/10 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent"
            >
              <span className="w-[14px] shrink-0 text-center text-[11px] text-accent-bright" aria-hidden>
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
