"use client";

import { useSpotify } from "./spotify-provider";

/**
 * Sits where the design's SIGN IN / REGISTRATION block is.
 *
 * One element in both states, deliberately. Swapping between `<a>` and
 * `<button>` on `connected` changed the tag the server had already written,
 * and any re-hydration — a fast refresh, a restored page — tore the tree down
 * over it. Connection is knowledge only the browser has; the markup should not
 * depend on it.
 *
 * The labels and the tooltip cannot match a server that has no session either.
 * Marking them as expected differences only hid them — React still found the
 * `title` here, which carried no such marker, and threw the header away. They
 * need no marker now: the provider reports nothing until hydration is done, so
 * `connected` is already false for the render the server is compared against.
 */
export function ConnectButton() {
  const { connected, ready, logout } = useSpotify();

  return (
    <button
      type="button"
      onClick={() => {
        if (connected) return void logout();
        /**
         * A full navigation, not a router push.
         *
         * `/api/spotify/login` is not a page: it answers 302 to Spotify's own
         * accounts host to begin the OAuth handshake. The router cannot follow
         * a redirect off the application, so the lint rule's premise — that
         * this is an internal destination — does not hold here.
         */
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
        window.location.href = "/api/spotify/login";
      }}
      title={connected ? "연결 해제" : "Spotify 연결"}
      className="flex shrink-0 flex-col items-end gap-[2px] whitespace-nowrap text-[8px] tracking-[0.6px]"
    >
      {/* green only once the device is actually live: CONNECTING is not yet a
          connection, and colouring it would promise something not true */}
      <span className={connected && ready ? "font-black text-spotify" : undefined}>
        {connected ? (ready ? "CONNECTED" : "CONNECTING…") : "CONNECT"}
      </span>
      <span className="text-muted">{connected ? "DISCONNECT" : "SPOTIFY"}</span>
    </button>
  );
}
