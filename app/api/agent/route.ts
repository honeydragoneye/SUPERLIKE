import { NextResponse, type NextRequest } from "next/server";

/**
 * Where the chat agent listens — a separate local process, `npm run agent`
 * (see agent/server.py). It is not part of this server: the model runs in
 * Ollama and the loop is Python, so this route only carries the conversation
 * there and the event stream back.
 */
const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:8765";

type ChatTurn = { role: "user" | "assistant"; content: string };

/** The places the agent may look things up. Anything else the browser sends is dropped. */
const SOURCES = ["lastfm", "wikipedia", "musicbrainz"] as const;

/**
 * Forwards one question and relays the agent's server-sent events as they
 * arrive, so the reply types itself out instead of landing in one piece.
 *
 * Only `question`, `history`, `refine`, `sources` and `taste` are passed on: the browser does not
 * get to address anything else on the agent. `refine` is the tag the
 * conversation is about — its name and what it means now — and turns the chat
 * from recommending songs into settling that tag's definition. `sources` is what
 * the agent may use for this question: left out, it starts with Last.fm alone,
 * and the listener adds Wikipedia or MusicBrainz when an answer could not be found. `taste`
 * is the songs the listener liked, and is only there when they chose to share it.
 */
export async function POST(request: NextRequest) {
  let body: { question?: unknown; history?: unknown; refine?: unknown; sources?: unknown; taste?: unknown; nowPlaying?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const question = typeof body.question === "string" ? body.question.trim() : "";
  if (!question) return NextResponse.json({ error: "missing_question" }, { status: 400 });

  const history: ChatTurn[] = Array.isArray(body.history)
    ? body.history.flatMap((m): ChatTurn[] => {
        const turn = m as { role?: unknown; content?: unknown };
        return (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string"
          ? [{ role: turn.role, content: turn.content }]
          : [];
      })
    : [];

  const r = body.refine as { label?: unknown; definition?: unknown } | undefined;
  const refine =
    r && typeof r.label === "string" && typeof r.definition === "string" && r.label && r.definition
      ? { label: r.label.slice(0, 24), definition: r.definition.slice(0, 200) }
      : undefined;

  // an absent list means "all on"; an empty one is a listener who switched everything off
  const sources = Array.isArray(body.sources)
    ? SOURCES.filter((s) => (body.sources as unknown[]).includes(s))
    : undefined;

  const taste = Array.isArray(body.taste)
    ? body.taste.slice(0, 30).flatMap((t): { title: string; artist: string }[] => {
        const row = t as { title?: unknown; artist?: unknown };
        return typeof row.title === "string" && typeof row.artist === "string"
          ? [{ title: row.title.slice(0, 80), artist: row.artist.slice(0, 80) }]
          : [];
      })
    : undefined;

  // what is playing in the browser right now: sent when the listener has the feature on, and the model only
  // sees it if it asks (the agent's now_playing tool). Anything but strings is dropped.
  const np = body.nowPlaying as { playing?: unknown; title?: unknown; artist?: unknown; album?: unknown } | null | undefined;
  const nowPlaying =
    np && typeof np === "object"
      ? np.playing === true && typeof np.title === "string"
        ? {
            playing: true,
            title: np.title.slice(0, 120),
            artist: typeof np.artist === "string" ? np.artist.slice(0, 120) : "",
            album: typeof np.album === "string" ? np.album.slice(0, 120) : "",
          }
        : { playing: false }
      : undefined;

  let upstream: Response;
  try {
    upstream = await fetch(`${AGENT_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history, refine, sources, taste, nowPlaying }),
      // closing the chat or sending the next question cuts the agent's work short too
      signal: request.signal,
      cache: "no-store",
    });
  } catch {
    return NextResponse.json({ error: "agent_offline" }, { status: 503 });
  }

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: "agent_error" }, { status: 502 });
  }

  return new Response(upstream.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
    },
  });
}
