import { NextResponse, type NextRequest } from "next/server";
import { resolveAccessToken, writeTokens } from "@/lib/spotify/tokens";
import { spotifyHttp } from "@/lib/http/throttle";
import { MARKET } from "@/lib/spotify/api";

const API = "https://api.spotify.com/v1";

/**
 * Starts playback on the browser device.
 *
 * The spike found that Spotify rejects playback until the web device has been
 * made active once, so the first call transfers to it and waits briefly before
 * issuing play. Proxying through the server keeps the token out of app code.
 */
export async function PUT(request: NextRequest) {
  const resolved = await resolveAccessToken();
  if (resolved.status === "none") {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const { deviceId, uris, contextUri, offsetUri, positionMs, activate } =
    (await request.json()) as {
      deviceId?: string;
      uris?: string[];
      /** album/playlist to resume, so the queue survives with it */
      contextUri?: string;
      offsetUri?: string;
      positionMs?: number;
      activate?: boolean;
    };
  if (!deviceId) {
    return NextResponse.json({ error: "missing_device_id" }, { status: 400 });
  }

  const headers = {
    Authorization: `Bearer ${resolved.accessToken}`,
    "Content-Type": "application/json",
  };

  const reply = (body: object, init?: ResponseInit) => {
    const res = NextResponse.json(body, init);
    if (resolved.status === "refreshed") writeTokens(res, resolved.tokens);
    return res;
  };

  if (activate) {
    const transfer = await spotifyHttp(`${API}/me/player`, {
      method: "PUT",
      headers,
      body: JSON.stringify({ device_ids: [deviceId], play: false }),
      cache: "no-store",
    });
    if (!transfer.ok && transfer.status !== 204) {
      return reply(
        { error: "transfer_failed", status: transfer.status, detail: await transfer.text() },
        { status: 502 },
      );
    }
    await new Promise((r) => setTimeout(r, 800));
  }

  const payload: Record<string, unknown> = {};
  if (contextUri) {
    payload.context_uri = contextUri;
    if (offsetUri) payload.offset = { uri: offsetUri };
  } else if (uris?.length) {
    payload.uris = uris;
  }
  if (positionMs != null) payload.position_ms = positionMs;

  const res = await spotifyHttp(`${API}/me/player/play?device_id=${deviceId}`, {
    method: "PUT",
    headers,
    body: Object.keys(payload).length ? JSON.stringify(payload) : undefined,
  });

  if (res.status === 204 || res.ok) return reply({ ok: true });

  const detail = await res.text();

  /**
   * A refused play answers `Restriction violated` with `reason: "UNKNOWN"`,
   * which names nothing. One lookup of the track names it instead.
   *
   * `restrictions.reason` covers catalogue-level blocks (`market`, `product`).
   * An account that filters explicit content is not one of those: the track
   * stays `is_playable: true` and carries no restriction, because the block
   * happens at playback. Measured on CHROMAKOPIA's "Like Him", which Spotify
   * lists twice — the clean cut plays and the explicit one is refused. So the
   * track's own `explicit` flag is what identifies that case.
   */
  let restriction:
    | { isPlayable?: boolean; reason?: string; explicit?: boolean }
    | undefined;
  if (res.status === 403 && uris?.length) {
    const id = uris[0].split(":").pop();
    try {
      const probe = await spotifyHttp(`${API}/tracks/${id}?market=${MARKET}`, {
        headers,
        cache: "no-store",
      });
      if (probe.ok) {
        const track = (await probe.json()) as {
          is_playable?: boolean;
          explicit?: boolean;
          restrictions?: { reason?: string };
        };
        restriction = {
          isPlayable: track.is_playable,
          reason: track.restrictions?.reason,
          explicit: track.explicit,
        };
      }
    } catch {
      // diagnosis is best-effort; the 403 below is the answer either way
    }
    console.warn("[play] refused", uris[0], restriction ?? "(no track detail)");
  }

  return reply(
    { error: "play_failed", status: res.status, detail, restriction },
    { status: res.status === 403 ? 403 : 502 },
  );
}
