import { useSyncExternalStore } from "react";
import type { Person } from "@/lib/db/people";

/**
 * The other accounts on Superlike and who follows whom, kept in one place so
 * the counts, the list on the mypage and a profile's button change together.
 * With Spotify's development mode there are at most five accounts, so the whole
 * list is read at once.
 */
export type PeopleState = {
  people: Person[];
  /** the listener lets their followers see what they listen to */
  share: boolean;
  /** the signed-in listener, as the database knows them: where their own page is */
  me: { id: string; name: string } | null;
  status: "idle" | "loading" | "ok" | "error";
  /** the last change that did not go through, in words */
  failure: string | null;
};

const EMPTY: PeopleState = { people: [], share: false, me: null, status: "idle", failure: null };

let state: PeopleState = EMPTY;
const listeners = new Set<() => void>();

function set(patch: Partial<PeopleState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function usePeopleState(): PeopleState {
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

const post = (body: unknown): RequestInit => ({
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function loadPeople(): Promise<void> {
  if (state.status === "idle") set({ status: "loading" });
  try {
    const { people, share, me } = await call<{ people: Person[]; share: boolean; me: { id: string; name: string } }>("/api/me/people");
    set({ people, share, me, status: "ok" });
  } catch {
    // what was already here stays; only the first load has nothing to show
    set({ status: state.status === "loading" ? "error" : state.status });
  }
}

/** Nothing of a previous account stays once the session is gone. */
export function resetPeople(): void {
  if (state !== EMPTY) set({ ...EMPTY });
}

function errorText(code: string): string {
  if (code === "not_found") return "그 사람을 찾을 수 없어요";
  if (code === "database_off") return "저장소가 꺼져 있어서 지금은 쓸 수 없어요";
  if (code === "not_connected") return "Spotify를 연결하면 쓸 수 있어요";
  return "저장하지 못했어요. 잠시 후 다시 시도해 주세요.";
}

export const lastPeopleFailure = (): string | null => state.failure;

export const isFollowingPerson = (id: string): boolean => state.people.some((p) => p.id === id && p.following);

/** Follows or unfollows a person; returns whether it went through. The list changes at once and is put back if it did not. */
export async function setFollowingPerson(id: string, on: boolean): Promise<boolean> {
  const before = state.people;
  set({ failure: null, people: before.map((p) => (p.id === id ? { ...p, following: on, recent: on ? p.recent : null } : p)) });
  try {
    await call("/api/me/people", post({ action: on ? "follow" : "unfollow", id }));
    // what a follow reveals (their last song) comes with the next read
    void loadPeople();
    return true;
  } catch (e) {
    set({ people: before, failure: errorText(e instanceof Error ? e.message : "") });
    return false;
  }
}

/** Turns sharing the listener's own activity on or off; returns whether it went through. */
export async function setShareActivity(on: boolean): Promise<boolean> {
  const before = state.share;
  set({ failure: null, share: on });
  try {
    await call("/api/me/people", post({ action: "share", on }));
    return true;
  } catch (e) {
    set({ share: before, failure: errorText(e instanceof Error ? e.message : "") });
    return false;
  }
}
