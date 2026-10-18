import { NextResponse, type NextRequest } from "next/server";

/**
 * Where the chat agent listens — a separate local process, `npm run agent`
 * (see agent/server.py). It is not part of this server: the model runs in
 * Ollama and the loop is Python, so this route only carries the conversation
 * there and the event stream back.
 */
const AGENT_URL = process.env.AGENT_URL ?? "http://127.0.0.1:8765";

type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * Forwards one question and relays the agent's server-sent events as they
 * arrive, so the reply types itself out instead of landing in one piece.
 *
 * Only `question`, `history` and `refine` are passed on: the browser does not
 * get to address anything else on the agent. `refine` is the tag the
 * conversation is about — its name and what it means now — and turns the chat
 * from recommending songs into settling that tag's definition.
 */
export async function POST(request: NextRequest) {
  let body: { question?: unknown; history?: unknown; refine?: unknown };
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

  let upstream: Response;
  try {
    upstream = await fetch(`${AGENT_URL}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ question, history, refine }),
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
