import { NextResponse, type NextRequest } from "next/server";
import { resolveAccessToken, writeTokens } from "@/lib/spotify/tokens";
import { spotifyHttp } from "@/lib/http/throttle";

const API = "https://api.spotify.com/v1";

type Body =
  | { action: "shuffle"; state: boolean; deviceId?: string }
  | { action: "repeat"; state: "off" | "context" | "track"; deviceId?: string }
  | { action: "next"; deviceId?: string }
  | { action: "previous"; deviceId?: string };

/**
 * Transport and playback modes, all via the Web API.
 *
 * The SDK's own nextTrack()/previousTrack() stall on a queue built from a bare
 * uri list — it stops instead of advancing — so skipping goes through the
 * account-level endpoints, which handle the queue properly.
 */
export async function PUT(request: NextRequest) {
  const resolved = await resolveAccessToken();
  if (resolved.status === "none") {
    return NextResponse.json({ error: "not_connected" }, { status: 401 });
  }

  const body = (await request.json()) as Body;
  const query = body.deviceId ? `?device_id=${body.deviceId}` : "";
  const amp = body.deviceId ? `&device_id=${body.deviceId}` : "";

  let path: string;
  let skip = false;
  switch (body.action) {
    case "next":
    case "previous":
      skip = true;
      path = `/me/player/${body.action}${query}`;
      break;
    case "shuffle":
      path = `/me/player/shuffle?state=${body.state}${amp}`;
      break;
    default:
      path = `/me/player/repeat?state=${body.state}${amp}`;
  }

  const res = await spotifyHttp(`${API}${path}`, {
    method: skip ? "POST" : "PUT",
    headers: { Authorization: `Bearer ${resolved.accessToken}` },
  });

  const reply = (payload: object, init?: ResponseInit) => {
    const out = NextResponse.json(payload, init);
    if (resolved.status === "refreshed") writeTokens(out, resolved.tokens);
    return out;
  };

  if (res.ok || res.status === 204) return reply({ ok: true });

  return reply(
    { error: "mode_failed", status: res.status, detail: await res.text() },
    { status: res.status === 403 ? 403 : 502 },
  );
}
