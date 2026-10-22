import type { PlaylistDetail, PlaylistSummary, PlaylistTrack } from "@/lib/db/playlists";

/** The browser's side of the playlists kept in Superlike (app/api/me/playlists). */
export type { PlaylistDetail, PlaylistSummary, PlaylistTrack };

/** A server answer that was not a success; `error` is the code the route sent. */
export class PlaylistRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { cache: "no-store", ...init });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new PlaylistRequestError(res.status, body.error ?? String(res.status));
  }
  return (await res.json()) as T;
}

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

/** `trackId` marks the playlists that already hold that song. */
export async function listPlaylists(trackId?: string): Promise<PlaylistSummary[]> {
  const qs = trackId ? `?track=${encodeURIComponent(trackId)}` : "";
  return (await call<{ playlists: PlaylistSummary[] }>(`/api/me/playlists${qs}`)).playlists;
}

export function loadPlaylist(id: string): Promise<PlaylistDetail> {
  return call<PlaylistDetail>(`/api/me/playlists/${id}`);
}

/**
 * Every change tells the screens that show playlists, so the shelf on home and
 * an open playlist redraw without each caller having to know who is watching.
 */
const CHANGED = "superlike:playlists";

export function onPlaylistsChanged(listener: () => void): () => void {
  window.addEventListener(CHANGED, listener);
  return () => window.removeEventListener(CHANGED, listener);
}

async function changed<T>(request: Promise<T>): Promise<T> {
  const result = await request;
  window.dispatchEvent(new Event(CHANGED));
  return result;
}

export function createPlaylist(name: string, isPublic: boolean, track?: PlaylistTrack): Promise<string> {
  return changed(
    call<{ id: string }>("/api/me/playlists", json("POST", { name, isPublic, track })).then((r) => r.id),
  );
}

export function renamePlaylist(id: string, patch: { name?: string; isPublic?: boolean }): Promise<void> {
  return changed(call<void>(`/api/me/playlists/${id}`, json("PATCH", patch)));
}

export function removePlaylist(id: string): Promise<void> {
  return changed(call<void>(`/api/me/playlists/${id}`, { method: "DELETE" }));
}

export function addToPlaylist(id: string, track: PlaylistTrack): Promise<void> {
  return changed(call<void>(`/api/me/playlists/${id}/tracks`, json("POST", { track })));
}

export function removeFromPlaylist(id: string, trackId: string): Promise<void> {
  return changed(call<void>(`/api/me/playlists/${id}/tracks`, json("DELETE", { trackId })));
}

/** What to tell the listener when a playlist request fails. */
export function playlistErrorText(e: unknown): string {
  const code = e instanceof PlaylistRequestError ? e.code : "";
  if (code === "not_connected") return "Spotify를 연결하면 쓸 수 있어요";
  if (code === "database_off") return "저장소가 꺼져 있어서 지금은 쓸 수 없어요";
  if (code === "playlists_limit") return "플레이리스트는 50개까지 만들 수 있어요";
  if (code === "tracks_limit") return "한 플레이리스트에는 500곡까지 담을 수 있어요";
  return "잠시 후 다시 시도해 주세요";
}
