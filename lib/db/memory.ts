import { query } from "./client";

/**
 * The chatbot's memory of a listener, kept in the account.
 *
 * It is a handful of short lines, not a transcript: what they like, what they
 * avoid, how they like to be talked to, and things they said. The chat reads it
 * at the start of every request (summary), the listener can read and change all
 * of it, and nothing here trains a model. Every query is scoped to the user id
 * the server read from the Spotify session.
 */

export type MemoryKind = "love" | "avoid" | "style" | "said";
export type MemoryItem = { id: string; kind: MemoryKind; text: string; at: string };
export type MemoryState = { enabled: boolean; noticeSeen: boolean; items: MemoryItem[] };
export type Reaction = "up" | "down" | "known";

/** How many lines of each kind are kept; one more pushes the oldest of its kind out. */
const CAP: Record<MemoryKind, number> = { love: 12, avoid: 8, style: 4, said: 15 };
const MAX_TEXT: Record<MemoryKind, number> = { love: 40, avoid: 40, style: 30, said: 80 };
export const isKind = (v: unknown): v is MemoryKind => v === "love" || v === "avoid" || v === "style" || v === "said";

const flat = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

function itemsOf(raw: unknown): MemoryItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r): MemoryItem[] => {
    const x = r as Partial<MemoryItem>;
    return typeof x?.id === "string" && isKind(x.kind) && typeof x.text === "string" && x.text
      ? [{ id: x.id, kind: x.kind, text: x.text, at: typeof x.at === "string" ? x.at : new Date(0).toISOString() }]
      : [];
  });
}

export async function getMemory(user: string): Promise<MemoryState> {
  const [row] = await query<{ enabled: boolean; notice_seen: boolean; items: unknown }>(
    "select enabled, notice_seen, items from listener_memory where user_id = $1",
    [user],
  );
  // nothing is written until something is: a listener who never opens it has no row, and it is on
  return row ? { enabled: row.enabled, noticeSeen: row.notice_seen, items: itemsOf(row.items) } : { enabled: true, noticeSeen: false, items: [] };
}

export async function setFlags(user: string, flags: { enabled?: boolean; noticeSeen?: boolean }): Promise<void> {
  await query(
    `insert into listener_memory (user_id, enabled, notice_seen)
     values ($1, coalesce($2::boolean, true), coalesce($3::boolean, false))
     on conflict (user_id) do update
       set enabled = coalesce($2::boolean, listener_memory.enabled),
           notice_seen = coalesce($3::boolean, listener_memory.notice_seen),
           updated_at = now()`,
    [user, flags.enabled ?? null, flags.noticeSeen ?? null],
  );
}

async function writeItems(user: string, items: MemoryItem[], learned: boolean): Promise<void> {
  await query(
    `insert into listener_memory (user_id, items, learned_at) values ($1, $2::jsonb, ${learned ? "now()" : "null"})
     on conflict (user_id) do update set items = $2::jsonb, ${learned ? "learned_at = now()," : ""} updated_at = now()`,
    [user, JSON.stringify(items)],
  );
}

/**
 * Adds lines and takes lines away, as the learner decided. A line that is already there is not added twice;
 * what was actually added comes back, so the chat can say what it learned.
 */
export async function patchItems(
  user: string,
  add: { kind: MemoryKind; text: string }[],
  removeIds: string[],
): Promise<MemoryItem[]> {
  const state = await getMemory(user);
  let items = state.items.filter((i) => !removeIds.includes(i.id));
  const added: MemoryItem[] = [];
  for (const a of add) {
    const text = flat(a.text, MAX_TEXT[a.kind]);
    if (!text || items.some((i) => i.kind === a.kind && i.text.toLowerCase() === text.toLowerCase())) continue;
    const item: MemoryItem = { id: crypto.randomUUID().slice(0, 8), kind: a.kind, text, at: new Date().toISOString() };
    items = [...items, item];
    added.push(item);
    const same = items.filter((i) => i.kind === a.kind);
    if (same.length > CAP[a.kind]) items = items.filter((i) => i !== same[0]);
  }
  if (added.length || removeIds.length) await writeItems(user, items, true);
  return added.filter((i) => items.includes(i));
}

export async function removeItems(user: string, ids: string[]): Promise<void> {
  const state = await getMemory(user);
  const items = state.items.filter((i) => !ids.includes(i.id));
  if (items.length !== state.items.length) await writeItems(user, items, false);
}

/** Everything it remembers goes: the lines and what the listener did with songs. The on/off choice stays. */
export async function clearMemory(user: string): Promise<void> {
  await query("update listener_memory set items = '[]'::jsonb, updated_at = now() where user_id = $1", [user]);
  await query("delete from track_feedback where user_id = $1", [user]);
}

// ---- songs

export type FeedbackTrack = { title: string; artist: string };
/** The same key the agent uses for songs it has already shown ("title|artist", lower case). */
export const trackKey = (t: FeedbackTrack) => `${t.title}|${t.artist}`.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 300);

const cleanTracks = (tracks: FeedbackTrack[]) =>
  tracks
    .map((t) => ({ title: flat(t.title, 200), artist: flat(t.artist, 200) }))
    .filter((t) => t.title)
    .slice(0, 30);

export async function recordReaction(user: string, tracks: FeedbackTrack[], value: Reaction): Promise<void> {
  for (const t of cleanTracks(tracks)) {
    await query(
      `insert into track_feedback (user_id, track_key, title, artist, value) values ($1, $2, $3, $4, $5)
       on conflict (user_id, track_key) do update set value = $5, at = now()`,
      [user, trackKey(t), t.title, t.artist, value],
    );
  }
}

/** A song was recommended: remembered so it is not recommended again. A reaction already there is kept. */
export async function recordShown(user: string, tracks: FeedbackTrack[]): Promise<void> {
  for (const t of cleanTracks(tracks)) {
    await query(
      `insert into track_feedback (user_id, track_key, title, artist, value) values ($1, $2, $3, $4, 'shown')
       on conflict (user_id, track_key) do nothing`,
      [user, trackKey(t), t.title, t.artist],
    );
  }
}

/** A reaction taken back: the song goes back to being one that was only shown. */
export async function undoReaction(user: string, tracks: FeedbackTrack[]): Promise<void> {
  for (const t of cleanTracks(tracks)) {
    await query("update track_feedback set value = 'shown' where user_id = $1 and track_key = $2 and value <> 'shown'", [user, trackKey(t)]);
  }
}

/** The songs the chat should not offer again: everything shown, liked, disliked or known, newest first. */
export async function avoidKeys(user: string, limit = 120): Promise<string[]> {
  const rows = await query<{ track_key: string }>("select track_key from track_feedback where user_id = $1 order by at desc limit $2", [user, limit]);
  return rows.map((r) => r.track_key);
}

/** What the listener reacted to (not just was shown), for drawing the buttons as pressed. */
export async function reactions(user: string): Promise<Record<string, Reaction>> {
  const rows = await query<{ track_key: string; value: Reaction }>(
    "select track_key, value from track_feedback where user_id = $1 and value <> 'shown' order by at desc limit 300",
    [user],
  );
  return Object.fromEntries(rows.map((r) => [r.track_key, r.value]));
}

/** Reactions since the profile was last updated, for the learner to read. */
export async function reactionsSince(user: string, limit = 12): Promise<{ title: string; artist: string; value: Reaction }[]> {
  return query<{ title: string; artist: string; value: Reaction }>(
    `select f.title, f.artist, f.value from track_feedback f
       left join listener_memory m on m.user_id = f.user_id
      where f.user_id = $1 and f.value <> 'shown' and (m.learned_at is null or f.at > m.learned_at)
      order by f.at desc limit $2`,
    [user, limit],
  );
}

// ---- what the chat reads

const LABEL: Record<MemoryKind, string> = { love: "좋아해요", avoid: "피해요", style: "말투", said: "사용자가 한 말" };

/** The profile as the lines the model reads. `count` is how many lines it holds. */
export function summarize(items: MemoryItem[]): { text: string; count: number } {
  const parts = (["love", "avoid", "style", "said"] as const).flatMap((k) => {
    const lines = items.filter((i) => i.kind === k).map((i) => i.text);
    return lines.length ? [`${LABEL[k]}: ${lines.join(", ")}`] : [];
  });
  return { text: parts.join("\n"), count: items.length };
}
