"use client";

import { useSpotify } from "./spotify-provider";

/** The speaker, with as many waves as the level has; muted wears a cross instead. */
function Speaker({ waves, muted, size = 14 }: { waves: 0 | 1 | 2; muted: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden>
      <path d="M1.5 6h2.8L8 3v10L4.3 10H1.5z" fill="currentColor" />
      {!muted && waves >= 1 && <path d="M10.5 5.8a3.2 3.2 0 0 1 0 4.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />}
      {!muted && waves >= 2 && <path d="M12.3 3.8a6 6 0 0 1 0 8.4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />}
      {muted && <path d="M11 5.5l4 5M15 5.5l-4 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />}
    </svg>
  );
}

const wavesOf = (volume: number): 0 | 1 | 2 => (volume === 0 ? 0 : volume < 0.5 ? 1 : 2);

/**
 * The volume button of the player bar, and the slider that opens above it.
 *
 * The bar owns which popover is open (the queue, the lyrics and the menu share
 * one place above it), so this is told whether it is open and asks to be toggled.
 * Pressing the speaker in the slider mutes; dragging the slider sets the level,
 * which also lifts a mute. The level is the listener's own and is kept.
 */
export function VolumeControl({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const { volume, muted, setVolume, toggleMute } = useSpotify();
  const percent = Math.round(volume * 100);
  const silent = muted || volume === 0;
  const label = muted ? "음소거 중 · 누르면 음량 조절" : `음량 ${percent}%`;
  return (
    // the whole control is a toggle for the bar's outside-press rule: a press on the slider must not close it
    <span data-popover-toggle className="relative flex shrink-0">
      <button
        type="button"
        aria-label="음량"
        aria-expanded={open}
        title={label}
        onClick={onToggle}
        className={`flex size-[30px] shrink-0 cursor-pointer items-center justify-center rounded-pill transition-colors rule ${
          silent ? "bg-accent-bright text-paper-solid" : "bg-[rgba(231,236,241,0.82)] text-ink"
        }`}
      >
        <Speaker waves={wavesOf(volume)} muted={silent} />
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="음량 조절"
          className="absolute bottom-[calc(100%+12px)] right-[-4px] z-30 flex items-center gap-[10px] whitespace-nowrap rounded-pill bg-ink py-[8px] pl-[12px] pr-[14px] shadow-[0_-4px_20px_rgba(0,0,0,0.35)]"
        >
          <button
            type="button"
            aria-label={muted ? "음소거 해제" : "음소거"}
            title={muted ? "음소거 해제" : "음소거"}
            onClick={toggleMute}
            className="flex shrink-0 cursor-pointer items-center text-on-dark transition-opacity hover:opacity-70"
          >
            <Speaker waves={wavesOf(volume)} muted={silent} />
          </button>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={muted ? 0 : percent}
            aria-label="음량"
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            className="h-[4px] w-[150px] cursor-pointer accent-accent-bright"
          />
          <span className="tnum w-[26px] shrink-0 text-right text-[9px] tracking-[0.5px] text-on-dark">{muted ? "0" : percent}</span>
        </div>
      )}
    </span>
  );
}
