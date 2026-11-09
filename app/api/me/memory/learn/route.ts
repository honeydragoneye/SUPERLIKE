import { NextResponse, type NextRequest } from "next/server";
import { signedInUser, withTokens } from "@/lib/db/account";
import { getMemory, patchItems, reactionsSince } from "@/lib/db/memory";
import { learn, type Turn } from "@/lib/memory/learn";
import { failure } from "../route";

const NO_STORE = { "Cache-Control": "no-store" };

const turnsOf = (raw: unknown): Turn[] =>
  Array.isArray(raw)
    ? raw.slice(-6).flatMap((t): Turn[] => {
        const row = t as { role?: unknown; text?: unknown };
        return (row?.role === "user" || row?.role === "assistant") && typeof row.text === "string" && row.text.trim()
          ? [{ role: row.role, text: row.text.slice(0, 600) }]
          : [];
      })
    : [];

/**
 * `{ turns }`: the last few turns of a conversation. One small model call decides what is worth remembering;
 * the lines it adds come back so the chat can say so (and the listener can take them back).
 * A failure is not an error the listener needs: the answer is "nothing learned".
 */
export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as { turns?: unknown } | null;
  const turns = turnsOf(body?.turns);
  if (!turns.some((t) => t.role === "user" && t.text.trim().length >= 4)) return NextResponse.json({ added: [] }, { headers: NO_STORE });
  try {
    const user = await signedInUser();
    const state = await getMemory(user.id);
    if (!state.enabled) return withTokens(NextResponse.json({ added: [] }, { headers: NO_STORE }), user.resolved, []);
    const reacted = await reactionsSince(user.id);
    let added: Awaited<ReturnType<typeof patchItems>> = [];
    try {
      const patch = await learn(turns, state.items, reacted);
      added = await patchItems(user.id, patch.add, patch.remove);
    } catch (e) {
      console.error("[memory learn]", e instanceof Error ? e.message : e);
    }
    return withTokens(NextResponse.json({ added }, { headers: NO_STORE }), user.resolved, []);
  } catch (e) {
    return failure(e);
  }
}
