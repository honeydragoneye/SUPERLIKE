import type { useSpotify, NowPlaying } from "@/components/player/spotify-provider";
import { mirrorLike } from "@/components/player/account-sync";
import { seedFrom } from "@/components/ui/station-button";
import { lookUp, type Found } from "@/components/ui/track-card";
import { isFollowing, lastFailure, setFollowing } from "@/components/follow/follow-store";
import { isLiked, toggle } from "@/lib/likes";
import { addToPlaylist, createPlaylist, listPlaylists, playlistErrorText } from "@/lib/playlists";
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
  kind: "like" | "playback" | "mode" | "seek" | "volume" | "choice" | "queue" | "addTo" | "lyrics" | "stopStation" | "station" | "playlist" | "open" | "follow";
  /** where the subject came from: the song playing (now), named by the listener, an artist, the songs shown, the station */
  source: "now" | "named" | "artist" | "shown" | "station";
  command?: "play" | "pause" | "resume" | "next" | "previous";
  /** the subject as the agent named it; a card shows it while the song is still being found */
  title: string;
  artist: string;
  /** a playlist's name */
  name?: string;
  /** station: it was started from the card's play button, not only prepared */
  started?: boolean;
  /** station: how long it runs before it ends by itself; none means until it is stopped */
  minutes?: number;
  /** open: which page to go to; `title` carries the search words, or the artist's or album's name */
  page?: Page;
  /** follow: the artist as Spotify has them, for the card and for taking the follow back */
  person?: { id: string; name: string; image: string | null };
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
  /** player cards: the song that was playing when this was done, so the card is not read as being about a later one */
  song?: { uri: string; title: string };
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
  /** an add-to-playlist card: the playlists to choose from, and which already hold the song */
  lists?: { id: string; name: string; count: number; has: boolean }[];
  /** a queue card: how many more songs follow the ones listed */
  more?: number;
  /** a queue card: whose order it is, which decides how a row is played */
  via?: "station" | "queue";
};

const KINDS = ["like", "playback", "mode", "seek", "volume", "choice", "queue", "addTo", "lyrics", "stopStation", "station", "playlist", "open", "follow"] as const;
/** The places the chat can take the listener; the first seven are pages with a fixed address. */
const PAGES = ["home", "history", "mypage", "issues", "weekly_artist", "editors_pick", "station", "search", "artist", "album"] as const;
export type Page = (typeof PAGES)[number];
const FIXED: Partial<Record<Page, { href: string; label: string }>> = {
  home: { href: "/", label: "홈" },
  history: { href: "/history", label: "최근 재생 기록" },
  mypage: { href: "/mypage", label: "마이페이지" },
  issues: { href: "/issues", label: "지난 호" },
  weekly_artist: { href: "/weekly-artist", label: "금주의 아티스트" },
  editors_pick: { href: "/editors-pick", label: "에디터스 픽" },
  station: { href: "/station", label: "스테이션" },
};
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
  const page = PAGES.find((p) => p === a.page);
  if (kind === "open" && (!page || (!FIXED[page] && !line(a.title, 120)))) return null;
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
    ...(kind === "open" ? { page } : {}),
    ...(kind === "playlist" ? { name: line(a.name, 60) || "새 플레이리스트" } : {}),
    ...(kind === "addTo" ? { name: line(a.name, 60) } : {}),
    ...(kind === "mode" ? { shuffle, repeat } : {}),
    ...(kind === "seek" ? { seconds, relative: a.relative === true } : {}),
    ...(kind === "volume" ? { level, change, mute } : {}),
    ...(kind === "station" && num(a.minutes, 5, 180) ? { minutes: num(a.minutes, 5, 180) } : {}),
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
  /** the lyrics popover: opened from the chat, shut again with the lyrics button as ever */
  lyrics: { open: boolean; toggle: () => void };
  shown: () => ChatTrack[];
  /** moves the window to another page of the site */
  navigate: (href: string) => void;
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

/** The song a player card is about, kept as it was when the card was made. */
function songOf(now: NowPlaying | null): ChatAction["song"] {
  return now ? { uri: now.uri, title: now.title } : undefined;
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

/** How many songs a queue card lists; the rest are counted. */
const QUEUE_ROWS = 3;

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

    if (a.kind === "open") return await openPage(a, env);

    if (a.kind === "follow") {
      // "this artist" is the one on the song playing; otherwise the name the agent gave
      const name = a.artist || playing(sp.now)?.artist || "";
      const hit = name ? (await lookUpLink({ kind: "artist", name })).found : null;
      if (!hit) return fail("Spotify에서 그 가수를 찾지 못했어요");
      const person = { id: hit.id, name: hit.name, image: hit.image };
      if (isFollowing(person.id)) return { state: "already", person };
      if (!(await setFollowing(person, true))) return fail(lastFailure() ?? "팔로우하지 못했어요");
      return { state: "done", person, summary: `${person.name}을(를) 팔로우했어요` };
    }

    if (a.kind === "playback") {
      switch (a.command) {
        case "pause":
          if (!sp.isPlaying) return { state: "already" };
          await sp.toggle();
          return { state: "done", summary: "일시정지했어요", before: { paused: false }, song: songOf(sp.now) };
        case "resume":
          if (sp.isPlaying) return { state: "already" };
          await sp.toggle();
          return { state: "done", summary: "다시 재생했어요", before: { paused: true }, song: songOf(sp.now) };
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
      return { state: "done", before, summary: said.join(" · "), song: songOf(sp.now) };
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
        song: songOf(now),
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

    if (a.kind === "addTo" && a.source === "shown") {
      // the songs just shown, found on Spotify; the listener picks which of them go in, and into which playlist
      const found = await gather(a, env);
      if (found.state === "error") return found;
      const lists = (await listPlaylists()).map((p) => ({ id: p.id, name: p.name, count: p.count, has: false }));
      return { state: "pending", tracks: found.tracks, lists };
    }

    if (a.kind === "addTo") {
      const track = await subject(a, env);
      if (!track) return fail(a.source === "now" ? NOTHING_PLAYING : NOT_FOUND);
      const lists = (await listPlaylists(track.id)).map((p) => ({ id: p.id, name: p.name, count: p.count, has: p.has }));
      // nothing is put in until the listener presses a row
      return { state: "pending", tracks: [track], lists };
    }

    if (a.kind === "queue") {
      const station = sp.stationActive && sp.stationQueue.length > 0;
      const rows = station ? sp.stationQueue.map((t) => ({ uri: t.uri, title: t.name, artist: t.artist, artwork: t.artwork, durationMs: t.durationMs })) : sp.nextUp;
      if (!rows.length) return fail("다음에 나올 곡이 없어요");
      const tracks: ActionTrack[] = rows.slice(0, QUEUE_ROWS).map((t) => ({ id: t.uri, uri: t.uri, title: t.title, artist: t.artist, artwork: t.artwork, durationMs: t.durationMs, albumId: null }));
      return { state: "done", tracks, more: Math.max(0, rows.length - tracks.length), via: station ? "station" : "queue", summary: `다음 곡 ${rows.length}곡` };
    }

    if (a.kind === "lyrics") {
      if (!sp.now) return fail(NOTHING_PLAYING);
      if (!env.lyrics.open) env.lyrics.toggle();
      return { state: "done", summary: "가사 화면을 열었어요" };
    }

    if (a.kind === "stopStation") {
      if (!sp.stationActive) return fail("지금 돌고 있는 스테이션이 없어요");
      sp.stopStation();
      return { state: "done", summary: "스테이션을 종료했어요" };
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
      // the station is only prepared here: the queue is built, and nothing plays until the listener presses play on the card
      const tracks: ActionTrack[] = [{ id: seed.id, uri: seed.uri, title: seed.name, artist: seed.artist, artwork: seed.artwork, durationMs: seed.durationMs, albumId: null }];
      await sp.startStation(seed, a.minutes, { play: false });
      return { state: "done", started: false, tracks, title: seed.name, artist: seed.artist };
    }

    // a playlist is only gathered here: the listener sees the name and the songs, and makes it with a press
    return await gather(a, env);
  } catch {
    return fail("잠시 후 다시 시도해 주세요");
  }
}

/** Goes to the page asked for. An artist or an album is found by name first: a wrong page opened is worse than none. */
async function openPage(a: ChatAction, env: ActionEnv): Promise<Partial<ChatAction>> {
  const page = a.page;
  if (!page) return fail("열 페이지를 모르겠어요");
  const fixed = FIXED[page];
  if (fixed) {
    env.navigate(fixed.href);
    return { state: "done", summary: `${fixed.label}(으)로 이동했어요` };
  }
  if (page === "search") {
    env.navigate(`/search?q=${encodeURIComponent(a.title)}`);
    return { state: "done", summary: `‘${a.title}’ 검색 결과로 이동했어요` };
  }
  const kind = page === "artist" ? "artist" : "album";
  const hit = (await lookUpLink({ kind, name: a.title, ...(kind === "album" && a.artist ? { artist: a.artist } : {}) })).found;
  if (!hit) return fail(kind === "artist" ? "Spotify에서 그 가수를 찾지 못했어요" : "Spotify에서 그 앨범을 찾지 못했어요");
  env.navigate(`/${kind}/${hit.id}`);
  return { state: "done", summary: `${hit.name} 페이지로 이동했어요` };
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

const MAX_GATHER = 20;

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
    // a few at a time: a song not yet looked up costs Spotify a search, and twenty at once runs into its rate limit
    for (let i = 0; i < shown.length; i += 3) {
      const found = await Promise.all(shown.slice(i, i + 3).map((t) => lookUp(t).catch(() => null)));
      tracks.push(...found.flatMap((f) => (f ? [toTrack(f)] : [])));
    }
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
  if (a.kind === "follow" && a.person) {
    await setFollowing(a.person, false);
    return { state: "undone", summary: `${a.person.name} 팔로우를 취소했어요` };
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

/** The listener pressed play on a station card: the prepared station plays from its first song. */
export async function playStation(a: ChatAction, env: ActionEnv): Promise<Partial<ChatAction>> {
  const sp = env.spotify;
  const t = a.tracks?.[0];
  // another station may have taken its place since the card was made
  if (!t || !sp.stationActive || sp.stationSeedTrack?.uri !== t.uri) return fail("이 스테이션은 더 이상 준비돼 있지 않아요. 다시 만들어 주세요");
  const ok = await sp.playStationSeed().catch(() => false);
  return ok ? { state: "done", started: true } : fail("재생할 기기가 없어요. 플레이어를 켠 뒤 다시 눌러 주세요");
}

/** Stops a station that is still being built, or one the listener has not started yet. */
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

/**
 * A row of a queue card pressed: play it the way the UP NEXT list does. The song and
 * everything after it become the queue, so what follows it is what comes next; a
 * station's queue is its own and just reorders.
 */
export async function playQueued(a: ChatAction, track: ActionTrack, sp: Spotify): Promise<void> {
  if (a.via === "station" && sp.stationActive) {
    const row = sp.stationQueue.find((t) => t.uri === track.uri);
    if (row) return void (await sp.playFromStation(row));
  }
  const at = sp.nextUp.findIndex((t) => t.uri === track.uri);
  const rest = at >= 0 ? sp.nextUp.slice(at) : [];
  if (rest.length > 1) return void (await sp.play({ uris: rest.map((t) => t.uri), tracks: rest }));
  await sp.play({ uris: [track.uri], tracks: [{ uri: track.uri, title: track.title, artist: track.artist, artwork: track.artwork, durationMs: track.durationMs }] });
}

/**
 * A row of an add-to-playlist card pressed: put the song in that playlist, or in a new one made for it.
 * A new one is named by what the listener typed; the name the chat guessed is only the fallback.
 */
export async function putInPlaylist(a: ChatAction, target: string | "new", typed?: string, ids?: string[]): Promise<Partial<ChatAction>> {
  const all = a.tracks ?? [];
  // more than one song when the card let the listener pick: only the picked ones go in, in the order they were shown
  const picked = ids ? all.filter((t) => ids.includes(t.id)) : all.slice(0, 1);
  const [track, ...rest] = picked;
  if (!track) return fail(ids ? "담을 곡을 골라 주세요" : "담을 곡이 없어요");
  const lists = a.lists ?? [];
  const many = picked.length > 1;
  try {
    if (target === "new") {
      const name = (typed ?? a.name ?? "").replace(/\s+/g, " ").trim().slice(0, 60) || "새 플레이리스트";
      const id = await createPlaylist(name, false, track);
      for (const t of rest) await addToPlaylist(id, t);
      return { state: "pending", lists: [{ id, name, count: picked.length, has: !ids }, ...lists], summary: many ? `‘${name}’을 만들어 ${picked.length}곡을 담았어요` : `‘${name}’을 만들어 담았어요` };
    }
    const list = lists.find((l) => l.id === target);
    if (!list) return {};
    for (const t of picked) await addToPlaylist(list.id, t);
    if (ids) {
      // a song that was already in it is not added twice, so the count is read back instead of guessed
      const fresh = await listPlaylists().catch(() => null);
      const count = fresh?.find((p) => p.id === list.id)?.count ?? list.count + picked.length;
      return { state: "pending", lists: lists.map((l) => (l.id === list.id ? { ...l, count } : l)), summary: many ? `‘${list.name}’에 ${picked.length}곡을 담았어요` : `‘${list.name}’에 담았어요` };
    }
    return { state: "pending", lists: lists.map((l) => (l.id === list.id ? { ...l, has: true, count: l.count + 1 } : l)), summary: `‘${list.name}’에 담았어요` };
  } catch (e) {
    return { note: playlistErrorText(e) };
  }
}
