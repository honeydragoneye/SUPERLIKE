"use client";

import { useHydrated } from "@/components/ui/use-hydrated";
import { useConnectDialog } from "./connect-dialog";
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
 * The labels and the tooltip cannot match a server that has no session either,
 * so they wait for this component's own hydration rather than being written
 * early and suppressed.
 *
 * The flag has to live here, not in the provider. The provider sits outside the
 * Suspense boundary this button is inside, so it commits — and its gate opens —
 * before React gets round to comparing this subtree against the server HTML;
 * by then its token fetch has already reported a session. Measured both ways:
 * gated here the header's errors left the log, gated in the provider they came
 * back on the next full reload.
 */
export function ConnectButton() {
  const { connected, ready, logout } = useSpotify();
  const hydrated = useHydrated();
  const live = hydrated && connected;
  const { ask, dialog } = useConnectDialog();

  return (
    <>
      <button
        type="button"
        onClick={() => (connected ? void logout() : ask())}
        title={live ? "연결 해제" : "Spotify 연결"}
        className="flex shrink-0 flex-col items-end gap-[2px] whitespace-nowrap text-[8px] tracking-[0.6px]"
      >
        {/* green only once the device is actually live: CONNECTING is not yet a
          connection, and colouring it would promise something not true */}
        <span className={live && ready ? "font-black text-spotify" : undefined}>
          {live ? (ready ? "CONNECTED" : "CONNECTING…") : "CONNECT"}
        </span>
        <span className="text-muted">{live ? "DISCONNECT" : "SPOTIFY"}</span>
      </button>
      {dialog}
    </>
  );
}
