import type { ChatLink, ChatMessage, ChatTrack } from "@/components/chat/chat-provider";
import { query } from "./client";

/** Conversations kept per account; saving one more drops the oldest. */
export const KEEP_CHATS = 20;

const MAX_MESSAGES = 100;
const MAX_TEXT = 20_000;
const MAX_TRACKS = 50;
const TITLE_LENGTH = 60;

export type ChatSummary = { id: string; title: string; count: number; updatedAt: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isChatId = (id: unknown): id is string => typeof id === "string" && UUID.test(id);

const text = (v: unknown, max = MAX_TEXT): string => (typeof v === "string" ? v.slice(0, max) : "");

function tracks(raw: unknown): ChatTrack[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, MAX_TRACKS)
    .map((t) => ({ title: text((t as ChatTrack)?.title, 300), artist: text((t as ChatTrack)?.artist, 300) }))
    .filter((t) => t.title);
}

function links(raw: unknown): ChatLink[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .slice(0, 6)
    .flatMap((l): ChatLink[] => {
      const k = (l as ChatLink)?.kind;
      const name = text((l as ChatLink)?.name, 300);
      const artist = text((l as ChatLink)?.artist, 300);
      const alias = text((l as ChatLink)?.alias, 300);
      const song = text((l as ChatLink)?.song, 300);
      return (k === "artist" || k === "album") && name
        ? [{ kind: k, name, ...(artist ? { artist } : {}), ...(song ? { song } : {}), ...(alias ? { alias } : {}) }]
        : [];
    });
}

/**
 * What the browser sent, rebuilt from only the fields a saved conversation
 * needs. Nothing else is trusted into the table: no proposals, no errors, no
 * half-written replies, whatever the request said.
 */
export function cleanMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const out: ChatMessage[] = [];
  for (const m of raw) {
    const role = (m as ChatMessage)?.role;
    const id = text((m as ChatMessage)?.id, 40) || `m${out.length}`;
    if (role === "user") {
      out.push({ id, role, text: text((m as ChatMessage & { role: "user" }).text) });
    } else if (role === "assistant") {
      const a = m as Extract<ChatMessage, { role: "assistant" }>;
      out.push({
        id,
        role,
        text: text(a.text),
        status: typeof a.status === "string" ? text(a.status, 200) : null,
        tracks: tracks(a.tracks),
        links: links(a.links),
        // what was done for the listener is not kept: a conversation opened later is words and songs, and must not do it again
        actions: [],
        proposal: null,
        question: text(a.question, 2000),
        offer: null,
        error: null,
        streaming: false,
      });
    } else return null;
  }
  return out.some((m) => m.role === "user") ? out : null;
}

/** The first thing the listener asked is what the conversation is called. */
function titleOf(messages: ChatMessage[]): string {
  const first = messages.find((m) => m.role === "user")?.text.replace(/\s+/g, " ").trim() ?? "";
  return first.slice(0, TITLE_LENGTH) || "대화";
}

export async function listChats(userId: string): Promise<ChatSummary[]> {
  return query<ChatSummary>(
    `select id, title, message_count as count, updated_at as "updatedAt"
       from chats where user_id = $1 order by updated_at desc limit ${KEEP_CHATS}`,
    [userId],
  );
}

export async function getChat(userId: string, id: string): Promise<ChatMessage[] | null> {
  const [row] = await query<{ messages: ChatMessage[] }>(
    "select messages from chats where id = $1 and user_id = $2",
    [id, userId],
  );
  return row?.messages ?? null;
}

/**
 * Saves a conversation: the one `id` names if it is this user's, otherwise a new
 * one. Saving the same conversation again (it was closed, then carried on)
 * replaces it rather than adding a copy.
 */
export async function saveChat(userId: string, id: string | null, messages: ChatMessage[]): Promise<string> {
  const title = titleOf(messages);
  const json = JSON.stringify(messages);

  let saved: string | undefined;
  if (id) {
    [{ id: saved } = { id: undefined }] = await query<{ id: string }>(
      `update chats set title = $3, messages = $4::jsonb, message_count = $5, updated_at = now()
        where id = $1 and user_id = $2 returning id`,
      [id, userId, title, json, messages.length],
    );
  }
  if (!saved) {
    const [row] = await query<{ id: string }>(
      `insert into chats (user_id, title, messages, message_count) values ($1, $2, $3::jsonb, $4) returning id`,
      [userId, title, json, messages.length],
    );
    saved = row.id;
  }

  await query(
    `delete from chats where user_id = $1 and id not in
       (select id from chats where user_id = $1 order by updated_at desc limit ${KEEP_CHATS})`,
    [userId],
  );
  return saved;
}

export async function deleteChat(userId: string, id: string): Promise<void> {
  await query("delete from chats where id = $1 and user_id = $2", [id, userId]);
}
