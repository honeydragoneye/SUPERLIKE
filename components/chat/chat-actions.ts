import type { useSpotify, NowPlaying } from "@/components/player/spotify-provider";
import { mirrorLike } from "@/components/player/account-sync";
import { seedFrom } from "@/components/ui/station-button";
import { lookUp, type Found } from "@/components/ui/track-card";
import { isLiked, toggle } from "@/lib/likes";
import { addToPlaylist, createPlaylist, playlistErrorText } from "@/lib/playlists";
import type { ChatTrack } from "./chat-provider";
import { lookUpLink } from "./link-card";

/**
 * What the chatbot can do for the listener, and the browser's side of doing it.
 *
 * The agent has no account and touches nothing: its tools only say "like this",
 * "start a station from that". The browser, which is signed in, carries it out
 * through the same stores and routes the buttons use. So a heart pressed from
 * the chat is the same heart as one pressed on the player, and a playlist made
 * from the chat is an ordinary playlist.
 *
 * Doing something takes a moment (a song to look up, a station to build), so an
 * action is a small state machine the chat draws as a card.
 */

/** One song as an action holds it: found on Spotify, with what a heart, a queue or a playlist keeps. */
export type ActionTrack = {
  id: string;
  uri: string;
  title: string;
  artist: string;
  artwork: string | null;
  durationMs: number;
  albumId: string | null;
};

export type ChatAction = {
  id: string;
  kind: "like" | "playback" | "station" | "playlist";
  /** where the subject came from: the song playing (now), named by the listener, an artist, the songs shown, the station */
  source: "now" | "named" | "artist" | "shown" | "station";
  command?: "play" | "pause" | "resume" | "next" | "previous";
  /** the subject as the agent named it; a card shows it while the song is still being found */
  title: string;
  artist: string;
  /** a playlist's name */
  name?: string;
  /** the songs found: the one liked or played, or those a playlist would hold */
  tracks?: ActionTrack[];
  /**
   * working: being done · pending: waiting for the listener (a playlist) · done · undone: taken back ·
   * cancelled · already: it was so before · busy: another station is being built · error
   */
  state: "working" | "pending" | "done" | "undone" | "cancelled" | "already" | "busy" | "error";
  /** why it did not work, or a line of explanation, in words for the listener */
  note?: string;
  /** the playlist that was made */
  playlistId?: string;
};

const KINDS = ["like", "playback", "station", "playlist"] as const;
const SOURCES = ["now", "named", "artist", "shown", "station"] as const;
const COMMANDS = ["play", "pause", "resume", "next", "previous"] as const;
const line = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");

/** The action in a tool's answer, or null when it is not one. Only known shapes get through: the model's words are not trusted. */
export function actionFrom(raw: unknown): ChatAction | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const kind = KINDS.find((k) => k === a.kind);
  if (!kind || typeof a.id !== "string") return null;
  const command = COMMANDS.find((c) => c === a.command);
  const source = SOURCES.find((s) => s === a.source) ?? (kind === "playlist" ? "shown" : kind === "playback" ? "named" : "now");
  if (kind === "playback" && !command) return null;
  return {
    id: a.id.slice(0, 20),
    kind,
    source,
    ...(command ? { command } : {}),
    title: line(a.title, 120),
    artist: line(a.artist, 120),
    ...(kind === "playlist" ? { name: line(a.name, 60) || "새 플레이리스트" } : {}),
    state: "working",
  };
}

type Spotify = ReturnType<typeof useSpotify>;

/** What the executor reads: the live player, and the songs the chat has shown (newest answer first). */
export type ActionEnv = {
  spotify: Spotify;
  shown: () => ChatTrack[];
};

const toTrack = (f: Found): ActionTrack => ({
  id: f.id,
  uri: f.uri,
  title: f.name,
  artist: f.artist,
  artwork: f.artwork,
  durationMs: f.durationMs,
  albumId: f.albumId ?? null,
});

/** The song playing now, as something a heart or a playlist can keep; null when nothing plays. */
function playing(now: NowPlaying | null): ActionTrack | null {
  if (!now?.uri.startsWith("spotify:track:")) return null;
  return { id: now.uri.slice(14), uri: now.uri, title: now.title, artist: now.artist, artwork: now.artwork, durationMs: now.durationMs, albumId: now.albumId };
}

const fail = (note: string): Partial<ChatAction> => ({ state: "error", note });
const NOT_FOUND = "Spotify에서 그 곡을 찾지 못했어요";

/** The song an action is about: the one playing, or the one named. */
async function subject(a: ChatAction, env: ActionEnv): Promise<ActionTrack | null> {
  if (a.source === "now") return playing(env.spotify.now);
  const found = await lookUp({ title: a.title, artist: a.artist }).catch(() => null);
  return found ? toTrack(found) : null;
}

/** Carries the action out. Resolves to what changed on it: its state, and what was found along the way. */
export async function startAction(a: ChatAction, env: ActionEnv): Promise<Partial<ChatAction>> {
  const sp = env.spotify;
  try {
    if (a.kind === "like") {
      const track = await subject(a, env);
      if (!track) return fail(a.source === "now" ? "지금 재생 중인 곡이 없어요" : NOT_FOUND);
      if (isLiked(track.id)) return { state: "already", tracks: [track] };
      toggle(track);
      // the account copy follows; the local heart already holds
      void mirrorLike(track, true);
      return { state: "done", tracks: [track] };
    }

    if (a.kind === "playback") {
      switch (a.command) {
        case "pause":
          if (!sp.isPlaying) return { state: "already" };
          await sp.toggle();
          return { state: "done" };
        case "resume":
          if (sp.isPlaying) return { state: "already" };
          await sp.toggle();
          return { state: "done" };
        case "next":
          await sp.next();
          return { state: "done" };
        case "previous":
          await sp.previous();
          return { state: "done" };
        default: {
          const track = await subject({ ...a, source: "named" }, env);
          if (!track) return fail(NOT_FOUND);
          const outcome = await sp.play({
            uris: [track.uri],
            tracks: [{ uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork, durationMs: track.durationMs }],
          });
          return outcome === "played" ? { state: "done", tracks: [track] } : { state: "error", tracks: [track], note: "재생하지 못했어요. 플레이어가 준비됐는지 확인해 주세요" };
        }
      }
    }

    if (a.kind === "station") {
      if (sp.stationBusy !== null) return { state: "busy" };
      let seed: Awaited<ReturnType<typeof seedFrom>> = null;
      if (a.source === "artist") {
        const artist = await lookUpLink({ kind: "artist", name: a.artist });
        seed = artist.found ? await seedFrom("artist", artist.found.id) : null;
        if (!seed) return fail("Spotify에서 그 가수를 찾지 못했어요");
      } else {
        const track = await subject(a, env);
        if (!track) return fail(a.source === "now" ? "지금 재생 중인 곡이 없어요" : NOT_FOUND);
        seed = { id: track.id, uri: track.uri, name: track.title, artist: track.artist, artwork: track.artwork, durationMs: track.durationMs };
      }
      const tracks: ActionTrack[] = [{ id: seed.id, uri: seed.uri, title: seed.name, artist: seed.artist, artwork: seed.artwork, durationMs: seed.durationMs, albumId: null }];
      await sp.startStation(seed);
      return { state: "done", tracks, title: seed.name, artist: seed.artist };
    }

    // a playlist is only gathered here: the listener sees the name and the songs, and makes it with a press
    return await gather(a, env);
  } catch {
    return fail("잠시 후 다시 시도해 주세요");
  }
}

const MAX_GATHER = 15;

/** The songs a playlist would hold, found on Spotify; the card waits for the listener when there are some. */
async function gather(a: ChatAction, env: ActionEnv): Promise<Partial<ChatAction>> {
  const sp = env.spotify;
  let tracks: ActionTrack[] = [];
  if (a.source === "now") {
    const now = playing(sp.now);
    if (now) tracks = [now];
  } else if (a.source === "station") {
    const seed = sp.stationSeedTrack;
    const rows = [...(seed ? [{ id: seed.id, uri: seed.uri, name: seed.name, artist: seed.artist, artwork: seed.artwork, durationMs: seed.durationMs }] : []), ...sp.stationQueue];
    tracks = rows.map((t) => ({ id: t.id, uri: t.uri, title: t.name, artist: t.artist, artwork: t.artwork, durationMs: t.durationMs, albumId: null }));
  } else {
    // songs already shown in the chat were found when their cards appeared, so this costs Spotify nothing more
    const shown = env.shown().slice(0, MAX_GATHER);
    const found = await Promise.all(shown.map((t) => lookUp(t).catch(() => null)));
    tracks = found.flatMap((f) => (f ? [toTrack(f)] : []));
  }
  const unique = [...new Map(tracks.map((t) => [t.id, t])).values()].slice(0, MAX_GATHER);
  if (unique.length === 0) return fail(a.source === "now" ? "지금 재생 중인 곡이 없어요" : a.source === "station" ? "스테이션에 담을 곡이 없어요" : "담을 곡이 없어요. 먼저 곡을 추천받아 보세요");
  return { state: "pending", tracks: unique };
}

/** Takes back what can be taken back: a heart. A song that was playing or a station that was begun is not undone. */
export async function undoAction(a: ChatAction, env: ActionEnv): Promise<Partial<ChatAction>> {
  const track = a.tracks?.[0];
  if (a.kind === "like" && track && a.state === "done") {
    if (isLiked(track.id)) toggle(track);
    void mirrorLike(track, false);
    return { state: "undone" };
  }
  if (a.kind === "playback" && a.state === "done") {
    // what a play can be taken back to: silence
    if (env.spotify.isPlaying) await env.spotify.toggle();
    return { state: "undone" };
  }
  return {};
}

/** Stops a station that is still being built. */
export function cancelAction(a: ChatAction, env: ActionEnv): Partial<ChatAction> {
  if (a.kind === "station" && a.state === "working") {
    env.spotify.stopStation();
    return { state: "cancelled" };
  }
  if (a.kind === "playlist" && a.state === "pending") return { state: "cancelled" };
  return {};
}

/** Makes the playlist the listener confirmed, under the name they left in the field. */
export async function makePlaylist(a: ChatAction, name: string): Promise<Partial<ChatAction>> {
  const tracks = a.tracks ?? [];
  if (tracks.length === 0) return fail("담을 곡이 없어요");
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 60) || a.name || "새 플레이리스트";
  try {
    const [first, ...rest] = tracks;
    const id = await createPlaylist(clean, false, first);
    for (const t of rest) await addToPlaylist(id, t);
    return { state: "done", playlistId: id, name: clean };
  } catch (e) {
    return { state: "error", note: playlistErrorText(e), name: clean };
  }
}
