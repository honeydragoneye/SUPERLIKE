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

/** What the player was before an action changed it, so the action can be taken back. */
export type Before = {
  shuffle?: boolean;
  repeat?: 0 | 1 | 2;
  positionMs?: number;
  volume?: number;
  muted?: boolean;
  paused?: boolean;
};

export type ChatAction = {
  id: string;
  kind: "like" | "playback" | "mode" | "seek" | "volume" | "choice" | "station" | "playlist";
  /** where the subject came from: the song playing (now), named by the listener, an artist, the songs shown, the station */
  source: "now" | "named" | "artist" | "shown" | "station";
  command?: "play" | "pause" | "resume" | "next" | "previous";
  /** the subject as the agent named it; a card shows it while the song is still being found */
  title: string;
  artist: string;
  /** a playlist's name */
  name?: string;
  /** mode: what to set; an empty side is left as it is */
  shuffle?: "on" | "off" | "";
  repeat?: "off" | "all" | "one" | "";
  /** seek: seconds from the start, or to add to where the song is */
  seconds?: number;
  relative?: boolean;
  /** volume: a level to set (0-100), an amount to add, or a mute */
  level?: number;
  change?: number;
  mute?: "on" | "off" | "";
  /** the songs found: the one liked or played, or those a playlist would hold */
  tracks?: ActionTrack[];
  /**
   * working: being done · pending: waiting for the listener (a playlist, a choice) · done · undone: taken back ·
   * cancelled · already: it was so before · busy: another station is being built · error
   */
  state: "working" | "pending" | "done" | "undone" | "cancelled" | "already" | "busy" | "error";
  /** why it did not work, or a line of explanation, in words for the listener */
  note?: string;
  /** what was done, in a line: the card's chip, and its record once a newer card takes its place */
  summary?: string;
  before?: Before;
  /** a choice: which way the listener took it */
  chosen?: "loop" | "once";
  /** the playlist that was made */
  playlistId?: string;
};

const KINDS = ["like", "playback", "mode", "seek", "volume", "choice", "station", "playlist"] as const;
const SOURCES = ["now", "named", "artist", "shown", "station"] as const;
const COMMANDS = ["play", "pause", "resume", "next", "previous"] as const;
const line = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
const num = (v: unknown, lo: number, hi: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : undefined);

/** The action in a tool's answer, or null when it is not one. Only known shapes get through: the model's words are not trusted. */
export function actionFrom(raw: unknown): ChatAction | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const kind = KINDS.find((k) => k === a.kind);
  if (!kind || typeof a.id !== "string") return null;
  const command = COMMANDS.find((c) => c === a.command);
  const source = SOURCES.find((s) => s === a.source) ?? (kind === "playlist" ? "shown" : kind === "playback" || kind === "choice" ? "named" : "now");
  if (kind === "playback" && !command) return null;
  const shuffle = a.shuffle === "on" || a.shuffle === "off" ? a.shuffle : "";
  const repeat = a.repeat === "off" || a.repeat === "all" || a.repeat === "one" ? a.repeat : "";
  const mute = a.mute === "on" || a.mute === "off" ? a.mute : "";
  if (kind === "mode" && !shuffle && !repeat) return null;
  const seconds = num(a.seconds, -36000, 36000);
  if (kind === "seek" && seconds === undefined) return null;
  const level = num(a.level, 0, 100);
  const change = num(a.change, -100, 100);
  if (kind === "volume" && level === undefined && change === undefined && !mute) return null;
  return {
    id: a.id.slice(0, 20),
    kind,
    source,
    ...(command ? { command } : {}),
    title: line(a.title, 120),
    artist: line(a.artist, 120),
    ...(kind === "playlist" ? { name: line(a.name, 60) || "새 플레이리스트" } : {}),
    ...(kind === "mode" ? { shuffle, repeat } : {}),
    ...(kind === "seek" ? { seconds, relative: a.relative === true } : {}),
    ...(kind === "volume" ? { level, change, mute } : {}),
    state: "working",
  };
}

/** Whether the action is drawn as the player card: one of them is live, the newer ones replace the older. */
export function showsPlayer(a: ChatAction): boolean {
  return a.kind === "mode" || a.kind === "seek" || (a.kind === "playback" && (a.command === "play" || a.command === "pause" || a.command === "resume"));
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
const NOTHING_PLAYING = "지금 재생 중인 곡이 없어요";

/** m:ss, the way the bar writes a position. */
export const clock = (ms: number): string => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};

/** The song an action is about: the one playing, or the one named. */
async function subject(a: ChatAction, env: ActionEnv): Promise<ActionTrack | null> {
  if (a.source === "now") return playing(env.spotify.now);
  const found = await lookUp({ title: a.title, artist: a.artist }).catch(() => null);
  return found ? toTrack(found) : null;
}

/** Plays one song as a queue of one, so it ends when it ends. */
async function playOnly(track: ActionTrack, sp: Spotify) {
  return sp.play({
    uris: [track.uri],
    tracks: [{ uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork, durationMs: track.durationMs }],
  });
}

const REPEAT_MODE = { off: 0, all: 1, one: 2 } as const;
const REPEAT_SAYS = { off: "반복을 껐어요", all: "전체 반복을 켰어요", one: "한 곡 반복을 켰어요" } as const;

/** Carries the action out. Resolves to what changed on it: its state, and what was found along the way. */
export async function startAction(a: ChatAction, env: ActionEnv): Promise<Partial<ChatAction>> {
  const sp = env.spotify;
  try {
    if (a.kind === "like") {
      const track = await subject(a, env);
      if (!track) return fail(a.source === "now" ? NOTHING_PLAYING : NOT_FOUND);
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
          return { state: "done", summary: "일시정지했어요", before: { paused: false } };
        case "resume":
          if (sp.isPlaying) return { state: "already" };
          await sp.toggle();
          return { state: "done", summary: "다시 재생했어요", before: { paused: true } };
        case "next":
          await sp.next();
          return { state: "done" };
        case "previous":
          await sp.previous();
          return { state: "done" };
        default: {
          const track = await subject({ ...a, source: "named" }, env);
          if (!track) return fail(NOT_FOUND);
          const outcome = await playOnly(track, sp);
          return outcome === "played"
            ? { state: "done", tracks: [track], summary: `${track.title} 재생` }
            : { state: "error", tracks: [track], note: "재생하지 못했어요. 플레이어가 준비됐는지 확인해 주세요" };
        }
      }
    }

    if (a.kind === "mode") {
      const before: Before = { shuffle: sp.shuffle, repeat: sp.repeatMode };
      const said: string[] = [];
      if (a.shuffle) {
        await sp.setShuffleTo(a.shuffle === "on");
        said.push(a.shuffle === "on" ? "셔플을 켰어요" : "셔플을 껐어요");
      }
      if (a.repeat) {
        await sp.setRepeatTo(REPEAT_MODE[a.repeat]);
        said.push(REPEAT_SAYS[a.repeat]);
      }
      return { state: "done", before, summary: said.join(" · ") };
    }

    if (a.kind === "seek") {
      const now = sp.now;
      if (!now) return fail(NOTHING_PLAYING);
      const at = sp.getPositionMs();
      const seconds = a.seconds ?? 0;
      // an absolute minus is counted back from the end of the song
      const wanted = a.relative ? at + seconds * 1000 : seconds < 0 ? now.durationMs + seconds * 1000 : seconds * 1000;
      // past the end the player would move on to the next song: say the length does not fit instead
      if (wanted >= now.durationMs) return fail(`이 곡은 ${clock(now.durationMs)}까지라 그 위치로는 갈 수 없어요`);
      const target = Math.max(0, wanted);
      await sp.seek(target);
      return {
        state: "done",
        before: { positionMs: at },
        summary: target === 0 ? "처음으로 돌아갔어요" : `${clock(target)}으로 이동했어요`,
      };
    }

    if (a.kind === "volume") {
      const before: Before = { volume: sp.volume, muted: sp.muted };
      const was = Math.round(sp.volume * 100);
      if (a.level !== undefined) sp.setVolume(a.level / 100);
      else if (a.change !== undefined) sp.setVolume(Math.min(100, Math.max(0, was + a.change)) / 100);
      if (a.mute === "on" && !sp.muted && a.level === undefined && a.change === undefined) sp.toggleMute();
      if (a.mute === "off" && sp.muted && a.level === undefined && a.change === undefined) sp.toggleMute();
      const now = Math.round(volumeNow(sp, a, was) * 100);
      const summary =
        a.mute === "on" && a.level === undefined && a.change === undefined
          ? "음소거했어요"
          : a.mute === "off" && a.level === undefined && a.change === undefined
            ? "음소거를 풀었어요"
            : a.change !== undefined
              ? `${was}% → ${now}%로 ${a.change < 0 ? "낮췄어요" : "높였어요"}`
              : `음량을 ${now}%로 바꿨어요`;
      return { state: "done", before, summary };
    }

    if (a.kind === "choice") {
      const track = await subject({ ...a, source: "named" }, env);
      if (!track) return fail(NOT_FOUND);
      // nothing plays yet: the listener says which way to listen
      return { state: "pending", tracks: [track] };
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
        if (!track) return fail(a.source === "now" ? NOTHING_PLAYING : NOT_FOUND);
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

/** The level after the change. The store answers on the next render, so what was asked for is what counts. */
function volumeNow(sp: Spotify, a: ChatAction, was: number): number {
  if (a.level !== undefined) return a.level / 100;
  if (a.change !== undefined) return Math.min(100, Math.max(0, was + a.change)) / 100;
  return sp.volume;
}

/** The listener's pick on a choice card: keep this one song on repeat, or play it once. */
export async function chooseOption(a: ChatAction, value: "loop" | "once", env: ActionEnv): Promise<Partial<ChatAction>> {
  const sp = env.spotify;
  const track = a.tracks?.[0] ?? (await subject({ ...a, source: "named" }, env));
  if (!track) return fail(NOT_FOUND);
  try {
    const before: Before = { repeat: sp.repeatMode };
    // repeat is set first: starting a song can reset what the player was told before it
    await sp.setRepeatTo(value === "loop" ? 2 : 0);
    const outcome = await playOnly(track, sp);
    if (outcome !== "played") return { state: "error", tracks: [track], note: "재생하지 못했어요. 플레이어가 준비됐는지 확인해 주세요" };
    return {
      state: "done",
      chosen: value,
      tracks: [track],
      before,
      summary: value === "loop" ? "이 곡만 계속 듣는 중이에요" : "한 번만 듣는 중이에요 · 끝나면 멈춰요",
    };
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
  if (unique.length === 0) return fail(a.source === "now" ? NOTHING_PLAYING : a.source === "station" ? "스테이션에 담을 곡이 없어요" : "담을 곡이 없어요. 먼저 곡을 추천받아 보세요");
  return { state: "pending", tracks: unique };
}

/** Takes back what can be taken back: a heart, a mode, a place in the song, a level, a pause. A station that was begun is not undone. */
export async function undoAction(a: ChatAction, env: ActionEnv): Promise<Partial<ChatAction>> {
  const sp = env.spotify;
  const b = a.before;
  if (a.state !== "done") return {};
  const track = a.tracks?.[0];
  if (a.kind === "like" && track) {
    if (isLiked(track.id)) toggle(track);
    void mirrorLike(track, false);
    return { state: "undone", summary: "좋아요를 취소했어요" };
  }
  if (a.kind === "playback" && a.command === "play") {
    // what a play can be taken back to: silence
    if (sp.isPlaying) await sp.toggle();
    return { state: "undone", summary: "일시정지했어요" };
  }
  if (a.kind === "playback" && b?.paused !== undefined) {
    // a pause is taken back by playing again, and a resume by pausing
    if (sp.isPlaying === b.paused) await sp.toggle();
    return { state: "undone", summary: b.paused ? "다시 재생했어요" : "일시정지했어요" };
  }
  if (a.kind === "mode" && b) {
    if (b.shuffle !== undefined && a.shuffle) await sp.setShuffleTo(b.shuffle);
    if (b.repeat !== undefined && a.repeat) await sp.setRepeatTo(b.repeat);
    return { state: "undone", summary: "되돌렸어요" };
  }
  if (a.kind === "seek" && b?.positionMs !== undefined) {
    await sp.seek(b.positionMs);
    return { state: "undone", summary: `${clock(b.positionMs)}으로 되돌렸어요` };
  }
  if (a.kind === "volume" && b?.volume !== undefined) {
    sp.setVolume(b.volume);
    if (b.muted && !sp.muted) sp.toggleMute();
    return { state: "undone", summary: `음량을 ${Math.round(b.volume * 100)}%로 되돌렸어요` };
  }
  if (a.kind === "choice" && a.chosen) {
    // the listener turns the repeat off (or on) again; the song keeps playing
    await sp.setRepeatTo(a.chosen === "loop" ? 0 : 2);
    return { state: "undone", summary: a.chosen === "loop" ? "반복을 껐어요" : "한 곡 반복을 켰어요" };
  }
  return {};
}

/** Stops a station that is still being built. */
export function cancelAction(a: ChatAction, env: ActionEnv): Partial<ChatAction> {
  if (a.kind === "station" && a.state === "working") {
    env.spotify.stopStation();
    return { state: "cancelled" };
  }
  if ((a.kind === "playlist" || a.kind === "choice") && a.state === "pending") return { state: "cancelled" };
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
