"use client";

import { useState } from "react";
import type { RadioStation } from "./radio-provider";

/** Hue from the name, so a station without a logo keeps the same colour every time. */
function hueOf(name: string): number {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

/** The station's logo, or a colour block when it has none or the image will not load. */
export function StationLogo({ station, size = 36 }: { station: RadioStation; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };
  if (station.favicon && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={station.favicon}
        alt=""
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
        style={style}
        className="shrink-0 rounded-[4px] bg-white object-contain"
      />
    );
  }
  return (
    <span
      aria-hidden
      style={{ ...style, background: `hsl(${hueOf(station.name)} 55% 55%)` }}
      className="shrink-0 rounded-[4px]"
    />
  );
}

export function HeartIcon({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden fill={filled ? "currentColor" : "none"} stroke="currentColor" strokeWidth={2.2} strokeLinejoin="round">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

export function PlayPauseIcon({ playing, size }: { playing: boolean; size: number }) {
  return playing ? (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden fill="currentColor">
      <rect x="1.5" y="1" width="2.4" height="8" />
      <rect x="6.1" y="1" width="2.4" height="8" />
    </svg>
  ) : (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden fill="currentColor">
      <path d="M2.5 1 8.8 5 2.5 9z" />
    </svg>
  );
}

/** Four bars moving, for the station that is on. */
export function Equalizer() {
  return (
    <span aria-hidden className="inline-flex h-[12px] items-end gap-[2px]">
      {[0, 0.25, 0.1, 0.4].map((delay, i) => (
        <span
          key={i}
          className="w-[2px] origin-bottom animate-[radio-eq_0.9s_ease-in-out_infinite] rounded-[1px] bg-current"
          style={{ height: 12, animationDelay: `${delay}s` }}
        />
      ))}
    </span>
  );
}

/** "어제", "오늘", else month.day: when a station was last heard. */
export function lastHeard(at: number | null): string {
  if (!at) return "아직 안 들었어요";
  const day = (ms: number) => new Date(ms).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const today = day(Date.now());
  if (day(at) === today) return "마지막으로 들은 날 오늘";
  if (day(at) === day(Date.now() - 86_400_000)) return "마지막으로 들은 날 어제";
  const [, m, d] = day(at).split("-");
  return `마지막으로 들은 날 ${Number(m)}.${Number(d)}`;
}
