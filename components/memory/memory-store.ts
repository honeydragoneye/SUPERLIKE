"use client";

import { useSyncExternalStore } from "react";
import type { MemoryItem, Reaction } from "@/lib/db/memory";

export type { MemoryItem, Reaction };

/**
 * What the chatbot remembers about the listener, as the browser holds it.
 *
 * One copy for the header button, the first-time notice, the memory screen and the song cards, so a switch
 * turned in one place is turned in all of them. The account is the truth: every change is sent, and put back
 * when it could not be. `off` is "not available": not connected, or no database: the chat has no memory UI then.
 */
export type MemoryView = {
  status: "idle" | "loading" | "ok" | "off";
  enabled: boolean;
  noticeSeen: boolean;
  items: MemoryItem[];
  /** by song key, what the listener reacted to */
  reactions: Record<string, Reaction>;
};

const EMPTY: MemoryView = { status: "idle", enabled: true, noticeSeen: true, items: [], reactions: {} };
let state: MemoryView = EMPTY;
const listeners = new Set<() => void>();

function set(patch: Partial<MemoryView>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useMemoryState(): MemoryView {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => EMPTY,
  );
}

export const getMemoryView = (): MemoryView => state;

/** The key a song is known by, the same the agent and the table use. */
export const reactionKey = (t: { title: string; artist: string }) => `${t.title}|${t.artist}`.toLowerCase().replace(/\s+/g, " ").trim().slice(0, 300);

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init });
  if (!res.ok) throw new Error(String(res.status));
  return (await res.json()) as T;
}

export async function loadMemory(): Promise<void> {
  if (state.status === "loading" || state.status === "ok") return;
  set({ status: "loading" });
  try {
    const data = await call<{ enabled: boolean; noticeSeen: boolean; items: MemoryItem[]; reactions: Record<string, Reaction> }>("/api/me/memory");
    set({ status: "ok", enabled: data.enabled, noticeSeen: data.noticeSeen, items: data.items, reactions: data.reactions ?? {} });
  } catch {
    set({ ...EMPTY, status: "off" });
  }
}

/** Disconnecting forgets what this browser held; the account keeps its own. */
export function resetMemory(): void {
  if (state !== EMPTY) set({ ...EMPTY });
}

export async function setMemoryEnabled(on: boolean): Promise<boolean> {
  const before = state.enabled;
  set({ enabled: on, noticeSeen: true });
  try {
    await call("/api/me/memory", json("PATCH", { enabled: on, noticeSeen: true }));
    return true;
  } catch {
    set({ enabled: before });
    return false;
  }
}

export async function dismissNotice(): Promise<void> {
  set({ noticeSeen: true });
  try {
    await call("/api/me/memory", json("PATCH", { noticeSeen: true }));
  } catch {
    // the notice shows again next time, which is harmless
  }
}

export async function forgetItems(ids: string[]): Promise<boolean> {
  const before = state.items;
  set({ items: before.filter((i) => !ids.includes(i.id)) });
  try {
    await Promise.all(ids.map((id) => call(`/api/me/memory/items/${encodeURIComponent(id)}`, json("DELETE"))));
    return true;
  } catch {
    set({ items: before });
    return false;
  }
}

export async function forgetAll(): Promise<boolean> {
  const before = { items: state.items, reactions: state.reactions };
  set({ items: [], reactions: {} });
  try {
    await call("/api/me/memory", json("DELETE"));
    return true;
  } catch {
    set(before);
    return false;
  }
}

type Song = { title: string; artist: string };

export async function react(tracks: Song[], value: Reaction): Promise<boolean> {
  const before = state.reactions;
  set({ reactions: { ...before, ...Object.fromEntries(tracks.map((t) => [reactionKey(t), value])) } });
  try {
    await call("/api/me/memory/feedback", json("POST", { action: "react", value, tracks }));
    return true;
  } catch {
    set({ reactions: before });
    return false;
  }
}

export async function unreact(tracks: Song[]): Promise<boolean> {
  const before = state.reactions;
  const next = { ...before };
  for (const t of tracks) delete next[reactionKey(t)];
  set({ reactions: next });
  try {
    await call("/api/me/memory/feedback", json("POST", { action: "undo", tracks }));
    return true;
  } catch {
    set({ reactions: before });
    return false;
  }
}

/** Songs the chat just showed: noted so they are not offered again. Nobody waits for this. */
export function recordShown(tracks: Song[]): void {
  if (tracks.length === 0) return;
  void call("/api/me/memory/feedback", json("POST", { action: "shown", tracks: tracks.slice(0, 30) })).catch(() => undefined);
}

/** The last turns of a conversation, for the memory to learn from; the lines it added, or none. */
export async function learnFrom(turns: { role: "user" | "assistant"; text: string }[]): Promise<MemoryItem[]> {
  try {
    const { added } = await call<{ added: MemoryItem[] }>("/api/me/memory/learn", json("POST", { turns }));
    if (added.length) set({ items: [...state.items, ...added] });
    return added;
  } catch {
    return [];
  }
}
