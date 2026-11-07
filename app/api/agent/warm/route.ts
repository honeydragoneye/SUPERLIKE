import { NextResponse } from "next/server";

/**
 * The chat agent is a separate process that, on the free host, goes to sleep
 * when nobody has used it for a while and takes about a minute to wake up. The
 * first question after that would fail. The browser calls this once when the
 * listener connects Spotify, so the agent is already waking while they browse.
 *
 * It only touches the agent's `/health`, which asks the model nothing, so it
 * costs no tokens. What matters is that the request arrives, not that it is
 * answered: the wait is cut short and a slow answer is reported as `warming`.
 */
const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:8765";

export async function POST() {
  try {
    const res = await fetch(`${AGENT_URL}/health`, {
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    return NextResponse.json({ status: res.ok ? "awake" : "error" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // no answer within the wait: the request has still reached a sleeping host, which starts waking on it
    return NextResponse.json({ status: "warming" }, { headers: { "Cache-Control": "no-store" } });
  }
}
