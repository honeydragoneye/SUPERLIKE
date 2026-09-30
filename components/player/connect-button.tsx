"use client";

import { useSpotify } from "./spotify-provider";

/** Sits where the design's SIGN IN / REGISTRATION block is. */
export function ConnectButton() {
  const { connected, ready, logout } = useSpotify();

  if (!connected) {
    return (
      <a
        href="/api/spotify/login"
        className="flex shrink-0 flex-col items-end gap-[2px] whitespace-nowrap text-[8px] tracking-[0.6px]"
      >
        <span>CONNECT</span>
        <span className="text-muted">SPOTIFY</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      onClick={() => void logout()}
      className="flex shrink-0 flex-col items-end gap-[2px] whitespace-nowrap text-[8px] tracking-[0.6px]"
    >
      <span>{ready ? "CONNECTED" : "CONNECTING…"}</span>
      <span className="text-muted">DISCONNECT</span>
    </button>
  );
}
