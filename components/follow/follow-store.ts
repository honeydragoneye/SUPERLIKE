import { useSyncExternalStore } from "react";
import type { FollowedArtist, UpdateItem } from "@/lib/db/follows";

/**
 * The listener's followed artists and 소식, kept in one place so the button on
 * an artist page, the bell in the header and the panels on the mypage all draw
 * from the same answer and change together.
 */
export type FollowState = {
  artists: FollowedArtist[];
  items: UpdateItem[];
  unread: number;
  checkedAt: string | null;
  /** something could not be asked when the releases were last looked up */
  checkError: boolean;
  /** "loading" while the first answer is on its way */
  status: "idle" | "loading" | "ok" | "error";
  /** the last follow or unfollow that did not go through, in words */
  failure: string | null;
};

const EMPTY: FollowState = { artists: [], items: [], unread: 0, checkedAt: null, checkError: false, status: "idle", failure: null };

let state: FollowState = EMPTY;
const listeners = new Set<() => void>();

function set(patch: Partial<FollowState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function useFollowState(): FollowState {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => EMPTY,
  );
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? String(res.status));
  }
  return (await res.json()) as T;
}

const json = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

type UpdatesBody = { items: UpdateItem[]; unread: number; checkedAt: string | null; checkError: boolean };

/** Reads the follows and the releases; `refresh` first asks Apple about artists not asked about today. */
export async function loadFollows(refresh = true): Promise<void> {
  if (state.status === "idle") set({ status: "loading" });
  try {
    const [{ artists }, news] = await Promise.all([
      call<{ artists: FollowedArtist[] }>("/api/me/artist-follows"),
      call<UpdatesBody>(`/api/me/updates${refresh ? "?refresh=1" : ""}`),
    ]);
    set({ artists, items: news.items, unread: news.unread, checkedAt: news.checkedAt, checkError: news.checkError, status: "ok" });
  } catch {
    // what was already here stays; only the first load has nothing to show
    set({ status: state.status === "loading" ? "error" : state.status });
  }
}

/** Nothing of a previous account stays once the session is gone. */
export function resetFollows(): void {
  if (state !== EMPTY) set({ ...EMPTY });
}

export type FollowTarget = { id: string; name: string; image: string | null };

function errorText(code: string): string {
  if (code === "follows_limit") return "팔로우는 100명까지 할 수 있어요";
  if (code === "database_off") return "저장소가 꺼져 있어서 지금은 쓸 수 없어요";
  if (code === "not_connected") return "Spotify를 연결하면 쓸 수 있어요";
  return "팔로우하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

/** Why the last follow or unfollow did not go through. */
export const lastFailure = (): string | null => state.failure;

export const isFollowing = (id: string): boolean => state.artists.some((a) => a.id === id);

/** Follows or unfollows; returns whether it went through. The list changes at once and is put back if it did not. */
export async function setFollowing(artist: FollowTarget, on: boolean): Promise<boolean> {
  const before = state.artists;
  if (on === isFollowing(artist.id)) return true;
  set({
    failure: null,
    artists: on
      ? [{ id: artist.id, name: artist.name, image: artist.image, followedAt: new Date().toISOString(), lastRelease: null }, ...before]
      : before.filter((a) => a.id !== artist.id),
  });
  try {
    await call("/api/me/artist-follows", json({ action: on ? "follow" : "unfollow", artist }));
    // a follow brings its releases in with the next read; an unfollow takes theirs out of the list
    void loadFollows(on);
    return true;
  } catch (e) {
    set({ artists: before, failure: errorText(e instanceof Error ? e.message : "") });
    return false;
  }
}

/** Marks releases read (all when no ids are given). The change shows at once. */
export async function markRead(ids?: string[]): Promise<void> {
  const mark = (items: UpdateItem[]) =>
    items.map((i) => (!ids || ids.includes(i.id) ? { ...i, unread: false } : i));
  const items = mark(state.items);
  set({ items, unread: items.filter((i) => i.unread).length });
  try {
    await call("/api/me/updates", json({ action: "read", ids }));
  } catch {
    // the next read puts the true marks back
  }
}
