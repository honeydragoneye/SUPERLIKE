"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useRouter } from "next/navigation";
import { useLyricsView } from "@/components/lyrics/lyrics-view";
import { useSpotify } from "@/components/player/spotify-provider";
import { useCustomTags } from "@/components/station/use-custom-tags";
import { loadChat, saveChat } from "@/lib/chat/history";
import { actionFrom, cancelAction, chooseOption, makePlaylist, playStation, putInPlaylist, startAction, undoAction, type ActionEnv, type ChatAction } from "./chat-actions";
import { snapshot as likedSnapshot } from "@/lib/likes";
import { pageZoom } from "@/lib/page-zoom";
import { addCustomTag, CUSTOM_LABEL_MAX, snapshot as tagSnapshot, updateCustomDefinition } from "@/lib/station/custom-tags";
import { getMemoryView, learnFrom, loadMemory, recordShown, resetMemory } from "@/components/memory/memory-store";
import type { CustomMoodKey } from "@/lib/station/filter";

/** The width the chat column starts at, and the narrowest it can be dragged to. */
export const CHAT_MIN_WIDTH = 330;
const WIDTH_KEY = "superlike:chat-width:v1";
const TASTE_KEY = "superlike:chat-taste:v1";
const HISTORY_KEY = "superlike:chat-taste-history:v1";
/** How many songs (liked, played, or both together) go to the agent when the listener shares them. */
const TASTE_MAX = 30;

/** Where the agent may look things up. The listener switches them on and off. */
export type ChatSource = "lastfm" | "wikipedia" | "musicbrainz";
export const CHAT_SOURCES: { key: ChatSource; label: string; hint: string }[] = [
  { key: "lastfm", label: "Last.fm", hint: "곡 추천, 가수·곡 정보" },
  { key: "wikipedia", label: "Wikipedia", hint: "가수 소개와 활동 이력" },
  { key: "musicbrainz", label: "MusicBrainz", hint: "앨범 목록과 발매일" },
];

/** The tool that answered, by the name the reply's status line gives it. */
const NOTE_OF: Record<string, string> = {
  artist_info: "Last.fm",
  track_info: "Last.fm",
  wiki_summary: "Wikipedia",
  albums: "MusicBrainz",
};

/** A song the agent chose. Last.fm's spelling: no Spotify id until the card looks one up. */
export type ChatTrack = { title: string; artist: string };

/**
 * What the agent proposes a tag should mean, and how that reads on real songs.
 *
 * Nothing changes until the listener presses 적용: `state` is where it stands.
 */
export type ChatProposal = {
  /**
   * "refine": a new meaning for the tag being worked on. "create": a new tag, name and meaning.
   * Conversations saved before tags could be made have no kind, and are refine.
   */
  kind?: "refine" | "create";
  /** create: the name the agent suggests, which the listener may change on the card before making the tag */
  label?: string;
  definition: string;
  reason: string;
  /** set when the criterion is something a title and an artist cannot settle */
  warning: string | null;
  preview: {
    checked: number;
    passedCount: number;
    passed: ChatTrack[];
    failed: ChatTrack[];
    /** where the sample songs came from; `fallback` is the chart, used because no songs were found for the tag asked for */
    sample?: { tag: string | null; fallback: boolean };
  };
  /** created: the tag was made. superseded: a newer proposal in the same chat replaced this one. */
  state: "pending" | "applied" | "dismissed" | "created" | "superseded";
  /** create: the key of the tag that was made, once it was */
  tagKey?: string;
};

export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      text: string;
      /** what the agent is doing, or just did: "후보 20곡 확인 → 3곡 통과" */
      status: string | null;
      tracks: ChatTrack[];
      /** pages the answer points to: an artist asked about, the album of a song asked about */
      links: ChatLink[];
      /** what the agent did for the listener in this answer: a heart, a song played, a station, a playlist waiting to be made */
      actions: ChatAction[];
      proposal: ChatProposal | null;
      /** the question as asked, so the same one can be asked again with another source */
      question: string;
      /** set when the agent could not answer: where it looked, and where else the listener can send it */
      offer: { tried: ChatSource[]; options: ChatSource[] } | null;
      error: string | null;
      streaming: boolean;
      /** how many lines of the memory the agent read for this answer */
      memoryUsed?: number;
      /** what the memory learned from this exchange, so the listener can see it and take it back */
      memoryNote?: { ids: string[]; texts: string[] };
    };

/** A page of this app an answer is about: the artist, or the album a song is on. Found by name when shown. */
export type ChatLink = {
  kind: "artist" | "album";
  name: string;
  artist?: string;
  /** an album card made from a song: the song's title, so the card can use what Spotify said about that song */
  song?: string;
  /** what the agent asked the tool for, when that is not how the tool named it: 검정치마 is The Black Skirts to Spotify */
  alias?: string;
};

/** The tag a conversation is about, as it reads right now. */
export type ChatRefine = { key: CustomMoodKey; label: string; definition: string };

type Ctx = {
  open: boolean;
  toggle: () => void;
  close: () => void;
  messages: ChatMessage[];
  busy: boolean;
  /** non-null: the chat is settling this tag's definition instead of recommending songs */
  refine: ChatRefine | null;
  /** opens the chat on a fresh conversation about one of the listener's own tags */
  openRefine: (key: CustomMoodKey) => void;
  leaveRefine: () => void;
  /** makes the proposal in this message the tag's definition */
  applyProposal: (messageId: string) => void;
  dismissProposal: (messageId: string) => void;
  /** makes the tag a create proposal describes, under this name; the reason it could not be made, or null when it was */
  createTag: (messageId: string, name: string) => string | null;
  /** a fresh conversation about making a new tag, which shows examples to start from */
  startTagCreate: () => void;
  /** the chat was opened to make a tag and nothing has been said yet */
  creating: boolean;
  send: (question: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
  /** opens a saved conversation in place of the current one (which is saved first) */
  restore: (chatId: string, messages: ChatMessage[]) => void;
  width: number;
  /** clamped to [CHAT_MIN_WIDTH, half the window] */
  setWidth: (px: number) => void;
  maxWidth: number;
  /** a press on an action's card: take it back, stop it, make the playlist under this name, or try it again */
  actOn: (
    messageId: string,
    actionId: string,
    op: { type: "undo" | "cancel" | "retry" | "play" } | { type: "confirm"; name: string } | { type: "choose"; value: "loop" | "once" } | { type: "addTo"; target: string; name?: string; ids?: string[] },
  ) => void;
  /** the listener picked where to look next, for the question this answer was about */
  searchWith: (messageId: string, source: ChatSource) => void;
  /** asks again the question an answer gave up on, in place of the failed pair */
  retry: (messageId: string) => void;
  /** whether the liked songs are shared with the agent, and the switch for it */
  shareTaste: boolean;
  toggleTaste: () => void;
  /** the same for the songs played most lately (the server works them out from the play history) */
  shareHistory: boolean;
  toggleHistory: () => void;
};

const ChatContext = createContext<Ctx | null>(null);

/** Half of the window, and never under the minimum: the chat may not take more than that. */
function maxChatWidth(): number {
  if (typeof window === "undefined") return CHAT_MIN_WIDTH;
  // the column is laid out in the zoomed page's px (lib/page-zoom), the window is in screen px
  return Math.max(CHAT_MIN_WIDTH, Math.floor(window.innerWidth / 2 / pageZoom()));
}

function clamp(px: number, max: number): number {
  return Math.round(Math.min(max, Math.max(CHAT_MIN_WIDTH, px)));
}

/**
 * The width the listener last dragged to, kept in this browser.
 *
 * An external store rather than state read in an effect: the value lives
 * outside React, and the server snapshot is the starting width so hydration
 * matches before the saved one is read — see lib/likes for the same shape.
 */
let savedWidth: number | null | undefined; // undefined = not read yet
const widthListeners = new Set<() => void>();

function readSavedWidth(): number {
  if (savedWidth === undefined) {
    try {
      const raw = localStorage.getItem(WIDTH_KEY);
      const n = raw === null ? NaN : Number(raw);
      savedWidth = Number.isFinite(n) ? n : null;
    } catch {
      savedWidth = null;
    }
  }
  return savedWidth ?? CHAT_MIN_WIDTH;
}

function subscribeWidth(onChange: () => void): () => void {
  widthListeners.add(onChange);
  return () => void widthListeners.delete(onChange);
}

function writeSavedWidth(px: number): void {
  savedWidth = px;
  try {
    localStorage.setItem(WIDTH_KEY, String(px));
  } catch {
    // still applies for this session
  }
  for (const fn of widthListeners) fn();
}

/**
 * Whether the liked songs, and separately the recently played ones, are shared
 * with the agent. Both are off until the listener turns them on: the songs
 * leave this browser for the model, so it is a choice.
 */
function sharing(key: string) {
  let saved: boolean | undefined; // undefined = not read yet
  const listeners = new Set<() => void>();
  return {
    read(): boolean {
      if (saved === undefined) {
        try {
          saved = localStorage.getItem(key) === "1";
        } catch {
          saved = false;
        }
      }
      return saved;
    },
    subscribe(onChange: () => void): () => void {
      listeners.add(onChange);
      return () => void listeners.delete(onChange);
    },
    write(on: boolean): void {
      saved = on;
      try {
        localStorage.setItem(key, on ? "1" : "0");
      } catch {
        // still applies for this session
      }
      for (const fn of listeners) fn();
    },
  };
}

const likesShare = sharing(TASTE_KEY);
const historyShare = sharing(HISTORY_KEY);
const readTaste = likesShare.read;
const subscribeTaste = likesShare.subscribe;
const writeTaste = likesShare.write;
const readHistory = historyShare.read;
const subscribeHistory = historyShare.subscribe;
const writeHistory = historyShare.write;

/**
 * The songs the agent is told about: what was played most (worked out on the
 * server from the play history) ahead of what was hearted, without repeats.
 * A history that cannot be fetched leaves the likes alone rather than failing
 * the question.
 */
const OPEN_KEY = "superlike:chat-open";

/** Writes down whether the chat is open and which saved conversation it holds, for this tab only. */
function rememberOpen(open: boolean, id: string | null): void {
  try {
    sessionStorage.setItem(OPEN_KEY, JSON.stringify({ open, id }));
  } catch {
    // storage blocked: a refresh then starts with the chat shut, and the conversation is still in the history
  }
}

function recallOpen(): { open: boolean; id: string | null } | null {
  try {
    const raw = JSON.parse(sessionStorage.getItem(OPEN_KEY) ?? "null") as { open?: unknown; id?: unknown } | null;
    return raw && raw.open === true && typeof raw.id === "string" ? { open: true, id: raw.id } : null;
  } catch {
    return null;
  }
}

async function tasteForAgent(): Promise<{ title: string; artist: string }[] | undefined> {
  const seen = new Set<string>();
  const out: { title: string; artist: string }[] = [];
  const add = (t: { title: string; artist: string }) => {
    const key = `${t.title}|${t.artist}`.toLowerCase();
    if (seen.has(key) || out.length >= TASTE_MAX) return;
    seen.add(key);
    out.push({ title: t.title, artist: t.artist });
  };

  if (readHistory()) {
    try {
      const res = await fetch("/api/me/taste?recs=0", { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { ready?: boolean; tracks?: { title: string; artist: string }[] };
        if (data.ready) data.tracks?.slice(0, TASTE_MAX).forEach(add);
      }
    } catch {
      // the likes, if shared, still go
    }
  }
  if (readTaste()) likedSnapshot().slice(0, TASTE_MAX).forEach(add);
  return out.length ? out : undefined;
}

/** The window's own size, as an external store: it changes when the window does. */
function subscribeWindow(onChange: () => void): () => void {
  window.addEventListener("resize", onChange);
  return () => window.removeEventListener("resize", onChange);
}

/** Server-sent events off a fetch body: one parsed object per `data:` line. */
async function* eventsOf(res: Response): AsyncGenerator<Record<string, unknown>> {
  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let end: number;
    while ((end = buffer.indexOf("\n\n")) >= 0) {
      const block = buffer.slice(0, end);
      buffer = buffer.slice(end + 2);
      const line = block.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        yield JSON.parse(line.slice(6)) as Record<string, unknown>;
      } catch {
        // a half-written event is not worth stopping the reply for
      }
    }
  }
}

/** What in a listener's message suggests it is about their taste or how they like to be talked to. */
const SAYS_TASTE = /좋아|싫어|별로|취향|스타일|즐겨|자주|선호|듣고 싶|좋았|질려|말고|위주|반말|존댓말|짧게|길게|이모지|부족|더 (밝|잔잔|신나|조용|시끄|부드)/;

const OFFLINE = "에이전트에 연결하지 못했어요. 오래 쓰지 않았다면 서버가 깨어나는 데 1분쯤 걸려요. 잠시 뒤에 다시 시도해 주세요.";

/** What the model is shown of the earlier turns: the cards' songs are not in the text, so they are added. */
function historyOf(messages: ChatMessage[]): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.text });
    } else if (m.text.trim() || m.tracks.length || m.proposal || m.actions.length) {
      const songs = m.tracks.length
        ? `\n(추천한 곡: ${m.tracks.map((t) => `${t.title} - ${t.artist}`).join(", ")})`
        : "";
      const did = m.actions.length
        ? `\n(해 준 동작: ${m.actions
            .map((a) => {
              if (a.summary && a.kind !== "like") return `${a.summary} (${{ working: "하는 중", pending: "고르기 전", done: "했음", undone: "되돌림", cancelled: "취소됨", already: "이미 그랬음", busy: "-", error: "못 했음" }[a.state]})`;
              const what = a.kind === "like" ? "좋아요" : a.kind === "station" ? "스테이션" : a.kind === "playlist" ? `플레이리스트 '${a.name ?? ""}'` : "재생";
              const subject = a.tracks?.[0] ? ` ${a.tracks[0].title}` : a.title ? ` ${a.title}` : "";
              const state = { working: "하는 중", pending: "만들기 전", done: "했음", undone: "취소됨", cancelled: "취소됨", already: "이미 그랬음", busy: "다른 스테이션 만드는 중", error: "못 했음" }[a.state];
              return `${what}${subject} ${state}`;
            })
            .join(", ")})`
        : "";
      const proposed = m.proposal
        ? `\n(${m.proposal.kind === "create" ? `제안한 새 태그: 이름 '${m.proposal.label ?? ""}', 기준 ${m.proposal.definition}` : `제안한 기준: ${m.proposal.definition}`} — ${
            {
              pending: "아직 답 없음",
              applied: "사용자가 적용함",
              dismissed: "사용자가 취소함",
              created: "사용자가 태그를 만듦",
              superseded: "새 제안으로 바뀜",
            }[m.proposal.state]
          })`
        : "";
      out.push({ role: "assistant", content: m.text.trim() + songs + did + proposed });
    }
  }
  return out;
}

/** Enough to tell whether a conversation has changed since it was saved. */
function signature(list: ChatMessage[]): string {
  const last = list[list.length - 1];
  return last ? `${list.length}:${last.role}${last.text.length}` : "";
}

/** What the agent may be told about the listener's station: its songs in order, the one playing first. */
function stationForAgent(sp: ReturnType<typeof useSpotify>) {
  const seed = sp.stationSeedTrack;
  const now = sp.now;
  const queue = sp.stationQueue.slice(0, 25).map((t) => ({ title: t.name, artist: t.artist, position: "next" }));
  const tracks =
    sp.stationActive && now
      ? [{ title: now.title, artist: now.artist, position: "playing" }, ...queue.filter((t) => t.title !== now.title)]
      : queue;
  return { active: sp.stationActive, seed: seed ? { title: seed.name, artist: seed.artist } : null, tracks };
}

let seq = 0;
const nextId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * The conversation with the music agent, and whether and how wide its column is.
 *
 * Held above the pages: the chat keeps its messages while
 * you move between screens, and a reply that is still arriving does not stop
 * because you navigated.
 */
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [refineKey, setRefineKey] = useState<CustomMoodKey | null>(null);
  /** the chat was opened from TAGS to make a tag: it shows examples until something is said */
  const [createStart, setCreateStart] = useState(false);
  const tags = useCustomTags();
  // read live: a tag that was deleted, or redefined, is no longer what the conversation started from
  const tag = refineKey ? tags.find((t) => t.key === refineKey) : undefined;
  const refine = useMemo<ChatRefine | null>(
    () => (tag ? { key: tag.key, label: tag.label, definition: tag.definition } : null),
    [tag],
  );
  const refineRef = useRef<ChatRefine | null>(null);
  useEffect(() => {
    refineRef.current = refine;
  }, [refine]);
  const saved = useSyncExternalStore(subscribeWidth, readSavedWidth, () => CHAT_MIN_WIDTH);
  const maxWidth = useSyncExternalStore(subscribeWindow, maxChatWidth, () => CHAT_MIN_WIDTH);
  // a width that was fine before can be too wide for a window that has since shrunk
  const width = clamp(saved, maxWidth);
  const shareTaste = useSyncExternalStore(subscribeTaste, readTaste, () => false);
  const toggleTaste = useCallback(() => writeTaste(!readTaste()), []);
  const shareHistory = useSyncExternalStore(subscribeHistory, readHistory, () => false);
  const toggleHistory = useCallback(() => writeHistory(!readHistory()), []);

  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * Saving the conversation, to the account, when it is put down.
   *
   * It is saved when a reply has finished, when the chat is closed or NEW is
   * pressed (or another conversation is opened), and when the page is left —
   * a refresh or a closing tab — so a conversation is never lost for being
   * unfinished. Nothing is sent while the listener is typing. Each
   * conversation has a number; the id the database gave it is kept against that
   * number, so closing and carrying on saves over the same row instead of
   * adding a copy, and a save that lands after the chat has moved on to
   * another conversation cannot attach its id to that one.
   */
  const spotify = useSpotify();
  const { connected, now: playing } = spotify;
  /** the live player, read when something is done: an action may finish long after the render that began it */
  const spotifyRef = useRef(spotify);
  const lyrics = useLyricsView();
  const lyricsRef = useRef(lyrics);
  useEffect(() => {
    spotifyRef.current = spotify;
    lyricsRef.current = lyrics;
  }, [spotify, lyrics]);
  /**
   * What is playing, read when a question is sent: a track that changed a second ago is already the one
   * the next question is about. The agent keeps it to itself unless the question is about "this song".
   */
  const nowRef = useRef(playing);
  useEffect(() => {
    nowRef.current = playing;
  }, [playing]);
  const connectedRef = useRef(false);
  useEffect(() => {
    connectedRef.current = connected;
    // what the chatbot remembers lives in the account: read it once connected, let go of it when not
    if (connected) void loadMemory();
    else resetMemory();
  }, [connected]);
  const conversation = useRef(0);
  const savedIds = useRef(new Map<number, string | null>([[0, null]]));
  const savedKey = useRef("");
  const openRef = useRef(false);
  const queue = useRef<Promise<void>>(Promise.resolve());

  const persist = useCallback((leaving = false) => {
    // a half-written reply is not saved; the next save has the whole of it
    const list = messagesRef.current.filter((m) => !(m.role === "assistant" && m.streaming));
    // a tag conversation is about a tag, not about songs: it is not kept
    if (!connectedRef.current || refineRef.current || !list.some((m) => m.role === "user")) return;
    const key = signature(list);
    if (key === savedKey.current) return;
    savedKey.current = key;

    const mine = conversation.current;
    if (leaving) {
      // the page is going: nothing after this line is certain to run, so the request is sent now, and told to outlive the page
      void saveChat(savedIds.current.get(mine) ?? null, list, { keepalive: true }).catch(() => undefined);
      return;
    }
    // one at a time, so a second save of the same conversation sees the id the first one got
    queue.current = queue.current.then(async () => {
      try {
        const id = await saveChat(savedIds.current.get(mine) ?? null, list);
        savedIds.current.set(mine, id);
        if (conversation.current === mine) rememberOpen(openRef.current, id);
      } catch {
        // let the next close or NEW try again
        if (conversation.current === mine) savedKey.current = "";
      }
    });
  }, []);

  /** Starts a new conversation: its own number, and the id of the saved one it continues if there is one. */
  const beginConversation = useCallback((savedAs: string | null, key: string) => {
    setCreateStart(false);
    conversation.current += 1;
    savedIds.current.set(conversation.current, savedAs);
    savedKey.current = key;
  }, []);

  // nothing is being written: whatever is unsaved goes now — a reply that has finished, open or closed
  useEffect(() => {
    if (!busy) persist();
  }, [busy, messages, persist]);

  // the page is being left (a refresh, a closing tab): the last question, or a reply cut off, is saved too
  useEffect(() => {
    const leave = () => persist(true);
    window.addEventListener("pagehide", leave);
    return () => window.removeEventListener("pagehide", leave);
  }, [persist]);

  // which conversation is open in this tab, so a refresh can put it back (the tab's own memory: it goes with the tab)
  const lastOpen = useRef<boolean | null>(null);
  useEffect(() => {
    openRef.current = open;
    // only when it changed: on load nothing has changed yet, and what the last page left here is what a refresh reads back
    // (development runs every effect twice, and a write on that second run would erase it)
    if (lastOpen.current !== null && lastOpen.current !== open) {
      rememberOpen(open, savedIds.current.get(conversation.current) ?? null);
    }
    lastOpen.current = open;
  }, [open]);

  const setWidth = useCallback((px: number) => writeSavedWidth(clamp(px, maxChatWidth())), []);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => setOpen(!open), [open]);

  const patch = useCallback((id: string, change: (m: Extract<ChatMessage, { role: "assistant" }>) => void) => {
    setMessages((all) =>
      all.map((m) => {
        if (m.id !== id || m.role !== "assistant") return m;
        const copy = { ...m, tracks: [...m.tracks], actions: [...m.actions] };
        change(copy);
        return copy;
      }),
    );
  }, []);

  /** Changes one action of an answer: what it found, and where it stands. */
  const patchAction = useCallback(
    (messageId: string, actionId: string, change: Partial<ChatAction>) => {
      patch(messageId, (m) => {
        m.actions = m.actions.map((a) => (a.id === actionId ? { ...a, ...change } : a));
      });
    },
    [patch],
  );

  /** The songs the chat has shown, the newest answer's first: what "the songs you just recommended" means. */
  const shownTracks = useCallback((): ChatTrack[] => {
    for (let i = messagesRef.current.length - 1; i >= 0; i--) {
      const m = messagesRef.current[i];
      if (m.role === "assistant" && m.tracks.length) return m.tracks;
      // tag refining shows its songs in the proposal's preview, not on cards: the ones that passed are what "the songs just found" means
      if (m.role === "assistant" && m.proposal && m.proposal.state !== "dismissed" && m.proposal.state !== "superseded" && m.proposal.preview.passed.length) return m.proposal.preview.passed;
    }
    return [];
  }, []);

  const router = useRouter();
  const actionEnv = useCallback(
    (shown?: () => ChatTrack[]): ActionEnv => ({ spotify: spotifyRef.current, lyrics: lyricsRef.current, shown: shown ?? shownTracks, navigate: (href) => router.push(href) }),
    [shownTracks, router],
  );

  const actOn = useCallback<Ctx["actOn"]>(
    (messageId, actionId, op) => {
      const message = messagesRef.current.find((m) => m.id === messageId);
      const action = message?.role === "assistant" ? message.actions.find((a) => a.id === actionId) : undefined;
      if (!action) return;
      void (async () => {
        if (op.type === "undo") patchAction(messageId, actionId, await undoAction(action, actionEnv()));
        else if (op.type === "cancel") patchAction(messageId, actionId, cancelAction(action, actionEnv()));
        else if (op.type === "retry") {
          patchAction(messageId, actionId, { state: "working", note: undefined });
          patchAction(messageId, actionId, await startAction({ ...action, state: "working" }, actionEnv()));
        } else if (op.type === "play") {
          // a prepared station: the listener's press is what starts it
          patchAction(messageId, actionId, await playStation(action, actionEnv()));
        } else if (op.type === "choose") {
          patchAction(messageId, actionId, { state: "working" });
          patchAction(messageId, actionId, await chooseOption(action, op.value, actionEnv()));
        } else if (op.type === "addTo") {
          patchAction(messageId, actionId, await putInPlaylist(action, op.target, op.name, op.ids));
        } else if (op.type === "confirm") {
          patchAction(messageId, actionId, { state: "working" });
          patchAction(messageId, actionId, await makePlaylist(action, op.name));
        }
      })();
    },
    [actionEnv, patchAction],
  );

  /**
   * A reply is over: the songs it showed are noted (so they are not offered again), and when the exchange looks
   * like it said something about taste or manner (or every third one), the memory reads it and learns. Nothing
   * happens for a listener who is not connected, in a tag conversation, or with the memory switched off.
   */
  const turnsSinceLearn = useRef(0);
  const afterReply = useCallback(
    (id: string) => {
      setTimeout(() => {
        const list = messagesRef.current;
        const m = list.find((x) => x.id === id);
        const memory = getMemoryView();
        if (!m || m.role !== "assistant" || m.error || !connectedRef.current || refineRef.current) return;
        if (memory.status !== "ok" || !memory.enabled) return;
        if (m.tracks.length) recordShown(m.tracks);
        const lastUser = [...list].reverse().find((x) => x.role === "user");
        turnsSinceLearn.current += 1;
        if (!(lastUser && SAYS_TASTE.test(lastUser.text)) && turnsSinceLearn.current < 3) return;
        turnsSinceLearn.current = 0;
        const turns = list.slice(-6).map((x) => ({ role: x.role, text: x.text }));
        void learnFrom(turns).then((added) => {
          if (added.length) {
            patch(id, (copy) => {
              copy.memoryNote = { ids: added.map((a) => a.id), texts: added.map((a) => a.text) };
            });
          }
        });
      }, 0);
    },
    [patch],
  );

  const run = useCallback(
    async (raw: string, opts?: { sources?: ChatSource[]; via?: string; before?: number }) => {
      const question = raw.trim();
      if (!question || abortRef.current) return;

      // a retry leaves out the answer that gave up: the model would copy it instead of looking again
      const history = historyOf(opts?.before === undefined ? messagesRef.current : messagesRef.current.slice(0, opts.before));
      const reply = nextId();
      setMessages((all) => [
        ...all,
        { id: nextId(), role: "user", text: opts?.via ? `${question} · ${opts.via}에서 찾기` : question },
        {
          id: reply, role: "assistant", text: "", status: null, tracks: [], links: [], actions: [], proposal: null,
          question, offer: null, error: null, streaming: true,
        },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);
      // what the agent asked each tool for, to pair with the name the tool answers under
      const asked = new Map<string, string>();
      // the songs this answer has shown so far: a playlist made in the same breath reads them from here
      let turnTracks: ChatTrack[] = [];

      try {
        // read when sending, so a heart pressed a second ago is already in
        const taste = await tasteForAgent();
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            history,
            refine: refineRef.current && { label: refineRef.current.label, definition: refineRef.current.definition },
            sources: opts?.sources,
            taste,
            nowPlaying: nowRef.current
              ? { playing: true, title: nowRef.current.title, artist: nowRef.current.artist, album: nowRef.current.album }
              : { playing: false },
            station: stationForAgent(spotifyRef.current),
            canAct: connectedRef.current,
            // only what the listener chose to share: absent means off, and the agent says so when asked
            likes: readTaste() ? likedSnapshot().slice(0, TASTE_MAX).map((t) => ({ title: t.title, artist: t.artist })) : undefined,
            recent: readHistory()
              ? spotifyRef.current.recent.slice(0, TASTE_MAX).map((t) => ({ title: t.title, artist: t.artist, playedAt: t.playedAt }))
              : undefined,
          }),
          signal: controller.signal,
        });
        if (!res.ok || !res.body) {
          patch(reply, (m) => {
            m.error = res.status === 503 ? OFFLINE : "에이전트가 응답하지 못했습니다.";
          });
          return;
        }

        for await (const event of eventsOf(res)) {
          switch (event.type) {
            case "tool_call": {
              const args = event.arguments as { artist?: unknown; title?: unknown } | undefined;
              const wanted = typeof args?.artist === "string" ? args.artist : typeof args?.title === "string" ? args.title : "";
              if (wanted) asked.set(String(event.name), wanted);
              patch(reply, (m) => {
                m.status =
                  event.name === "now_playing"
                    ? "지금 듣는 곡을 확인하는 중…"
                    : event.name === "station_info"
                      ? "스테이션을 확인하는 중…"
                    : ["like_track", "playback", "player_mode", "seek", "volume", "play_one", "add_to_playlist", "up_next", "lyrics", "stop_station", "start_station", "make_playlist"].includes(String(event.name))
                      ? "준비하는 중…"
                    : event.name === "top_tracks"
                    ? "곡을 찾는 중…"
                    : event.name === "propose_definition"
                      ? "기준을 정리하는 중…"
                      : event.name === "request_source"
                        ? "찾을 곳을 정리하는 중…"
                      : event.name === "similar_to"
                        ? "비슷한 곡을 찾는 중…"
                      : String(event.name) in NOTE_OF
                        ? `${NOTE_OF[String(event.name)]}에서 찾는 중…`
                        : "곡을 확인하는 중…";
              });
              break;
            }
            case "tool_result": {
              const result = event.result as
                | {
                    /** like_track, playback, start_station, make_playlist: what the browser is asked to do */
                    action?: unknown;
                    found?: boolean;
                    /** find_track: the title was not found, and these are the artist's own best-known songs instead */
                    substitute?: boolean;
                    /** artist_info and albums: the artist as Last.fm / MusicBrainz name it */
                    artist?: string;
                    /** track_info */
                    title?: string;
                    album?: string | null;
                    based_on?: string;
                    tracks?: ChatTrack[];
                    checked?: number;
                    proposal?: { definition: string; reason?: string; warning?: string; label?: string };
                    preview?: { checked: number; passed_count?: number; passed: ChatTrack[]; failed: ChatTrack[]; sample?: { tag?: string | null; fallback?: boolean } };
                  }
                | undefined;
              const action = actionFrom(result?.action);
              if (action) {
                patch(reply, (m) => {
                  m.actions = [...m.actions.filter((a) => a.id !== action.id), action];
                  m.status = null;
                });
                // done by the browser, which is the one signed in; a playlist waits there for the press
                void startAction(action, actionEnv(() => (turnTracks.length ? turnTracks : shownTracks()))).then((change) => patchAction(reply, action.id, change));
                break;
              }
              if (result?.proposal && result.preview) {
                const { proposal, preview } = result;
                patch(reply, (m) => {
                  // a newer proposal replaces the one before it: only the last is on the table
                  m.proposal = {
                    ...(typeof proposal.label === "string" && proposal.label ? { kind: "create" as const, label: String(proposal.label) } : {}),
                    definition: String(proposal.definition),
                    reason: String(proposal.reason ?? ""),
                    warning: proposal.warning ? String(proposal.warning) : null,
                    preview: {
                      checked: Number(preview.checked) || 0,
                      passedCount: Number(preview.passed_count ?? preview.passed.length) || 0,
                      passed: preview.passed.map((t) => ({ title: String(t.title), artist: String(t.artist) })),
                      failed: preview.failed.map((t) => ({ title: String(t.title), artist: String(t.artist) })),
                      ...(preview.sample ? { sample: { tag: preview.sample.tag ? String(preview.sample.tag) : null, fallback: preview.sample.fallback === true } } : {}),
                    },
                    state: "pending",
                  };
                  m.status = typeof proposal.label === "string" && proposal.label ? "태그를 정리했어요" : "기준을 정리했어요";
                });
                // a newer tag proposal replaces the ones before it that are still waiting
                if (typeof proposal.label === "string" && proposal.label) {
                  setMessages((all) =>
                    all.map((x) =>
                      x.id !== reply && x.role === "assistant" && x.proposal?.kind === "create" && x.proposal.state === "pending"
                        ? { ...x, proposal: { ...x.proposal, state: "superseded" as const } }
                        : x,
                    ),
                  );
                }
                break;
              }
              const note = NOTE_OF[String(event.name)];
              if (note && result && !Array.isArray(result.tracks)) {
                // an answer about an artist or a song: say where it came from, or that nothing was there
                patch(reply, (m) => {
                  // one of two artists not being known does not take back what was found for the other
                  if (result.found === false) {
                    if (m.links.length === 0) m.status = `${note}에 정보가 없었어요`;
                    return;
                  }
                  m.status = `${note} 참고`;
                  const add = (link: ChatLink) => {
                    // asking about two artists runs the tool twice: each gets its card, and none twice
                    const same = (l: ChatLink) => l.kind === link.kind && l.name.toLowerCase() === link.name.toLowerCase();
                    if (link.name && !m.links.some(same)) m.links = [...m.links, link];
                  };
                  const name = event.name;
                  // only names the tool itself returned: a model's own wording never becomes a link
                  if ((name === "artist_info" || name === "albums") && result.artist) {
                    const said = asked.get(String(name));
                    add({ kind: "artist", name: String(result.artist), ...(said && said.toLowerCase() !== String(result.artist).toLowerCase() ? { alias: said } : {}) });
                  } else if (name === "track_info" && result.title && result.artist) {
                    // there is no page for one song: the song's card plays it, its album's page lists it
                    const song = { title: String(result.title), artist: String(result.artist) };
                    if (!m.tracks.some((t) => t.title === song.title && t.artist === song.artist)) m.tracks = [...m.tracks, song];
                    if (result.album) add({ kind: "album", name: String(result.album), artist: song.artist, song: song.title });
                  }
                });
                break;
              }
              if (result && Array.isArray(result.tracks)) {
                const found = result.tracks.map((t) => ({ title: String(t.title), artist: String(t.artist) }));
                turnTracks = found;
                patch(reply, (m) => {
                  m.tracks = found;
                  if (event.name === "find_track") {
                    // asked for one named song: it is either found, or it is not — or the artist's own songs stand in for it
                    m.status = result.substitute
                      ? `그 제목은 없지만 ${String(result.artist ?? "")}의 대표곡이에요`
                      : found.length
                        ? "곡을 찾았어요"
                        : "곡을 찾지 못했어요";
                  } else if (event.name === "identify_song") {
                    m.status = found.length ? "이 곡일 수 있어요" : "곡을 확인하지 못했어요";
                  } else if (event.name === "similar_to") {
                    m.status = found.length
                      ? `비슷한 곡 · ${String(result.based_on ?? "")}`
                      : "비슷한 곡을 찾지 못했어요";
                  } else if (event.name === "artist_top_tracks") {
                    m.status = found.length ? "Last.fm 참고" : "Last.fm에 정보가 없었어요";
                  } else {
                    m.status =
                      typeof result.checked === "number"
                        ? found.length
                          ? `후보 ${result.checked}곡 확인 → ${found.length}곡 통과`
                          : `후보 ${result.checked}곡 확인 → 조건에 맞는 곡 없음`
                        : null;
                  }
                });
              }
              break;
            }
            case "offer": {
              const keys = CHAT_SOURCES.map((x) => x.key);
              const only = (v: unknown): ChatSource[] =>
                Array.isArray(v) ? v.filter((k): k is ChatSource => keys.includes(k as ChatSource)) : [];
              const options = only(event.options);
              if (options.length) {
                patch(reply, (m) => {
                  m.offer = { tried: only(event.tried), options };
                });
              }
              break;
            }
            case "memory":
              // how many remembered lines this answer was written with
              patch(reply, (m) => {
                m.memoryUsed = Number(event.count) || 0;
              });
              break;
            case "retry":
              // the agent is starting its answer over: what was typed so far is dropped
              patch(reply, (m) => {
                m.text = "";
              });
              break;
            case "token":
              patch(reply, (m) => {
                m.text += String(event.data ?? "");
              });
              break;
            case "waiting":
              // the model is at its per-minute limit and the agent is sitting it out: not stuck
              patch(reply, (m) => {
                m.status = `요청이 몰려서 ${Math.max(1, Math.round(Number(event.seconds) || 0))}초 기다리는 중…`;
              });
              break;
            case "error":
              patch(reply, (m) => {
                m.error = String(event.message ?? "에이전트가 응답하지 못했습니다.");
              });
              break;
          }
        }
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          patch(reply, (m) => {
            m.error = OFFLINE;
          });
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
        patch(reply, (m) => {
          m.streaming = false;
          // "…중…" is what a tool is doing; once the reply is over, a tool that never
          // reported back leaves nothing true to say, so the line goes rather than lingering
          if (m.status?.endsWith("…")) m.status = null;
        });
        afterReply(reply);
      }
    },
    [patch, patchAction, actionEnv, shownTracks, afterReply],
  );

  const send = useCallback((question: string) => run(question), [run]);

  // the same question again, with one more place to look; the buttons of the answer it follows are spent
  const searchWith = useCallback(
    (id: string, source: ChatSource) => {
      const m = messagesRef.current.find((x) => x.id === id);
      if (!m || m.role !== "assistant" || !m.offer || abortRef.current) return;
      const via = CHAT_SOURCES.find((x) => x.key === source)?.label ?? source;
      const tried = [...m.offer.tried, source];
      patch(id, (copy) => {
        copy.offer = null;
      });
      const at = messagesRef.current.indexOf(m);
      void run(m.question, { sources: tried, via, before: Math.max(0, at - 1) });
    },
    [run, patch],
  );

  const retry = useCallback(
    (id: string) => {
      const at = messagesRef.current.findIndex((x) => x.id === id);
      const m = messagesRef.current[at];
      if (at < 1 || !m || m.role !== "assistant" || !m.error || abortRef.current) return;
      // the failed question and its answer are dropped; run() reads the list for the history right away
      const kept = messagesRef.current.slice(0, at - 1);
      messagesRef.current = kept;
      setMessages(kept);
      void run(m.question);
    },
    [run],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const setProposalState = useCallback(
    (id: string, state: ChatProposal["state"]) =>
      setMessages((all) =>
        all.map((m) =>
          m.id === id && m.role === "assistant" && m.proposal
            ? { ...m, proposal: { ...m.proposal, state } }
            : m,
        ),
      ),
    [],
  );
  const applyProposal = useCallback(
    (id: string) => {
      const target = refineRef.current;
      const message = messagesRef.current.find((m) => m.id === id);
      if (!target || !message || message.role !== "assistant" || !message.proposal) return;
      // the store says no when the tag is gone or the text is empty; nothing is marked applied then
      if (updateCustomDefinition(target.key, message.proposal.definition) === null) setProposalState(id, "applied");
    },
    [setProposalState],
  );
  const dismissProposal = useCallback((id: string) => setProposalState(id, "dismissed"), [setProposalState]);

  const createTag = useCallback(
    (id: string, name: string): string | null => {
      const message = messagesRef.current.find((m) => m.id === id);
      const p = message && message.role === "assistant" ? message.proposal : null;
      if (!p || p.kind !== "create" || p.state !== "pending") return "이미 처리된 제안이에요";
      const why = addCustomTag(name, p.definition);
      if (why) return why;
      const label = name.replace(/\s+/g, " ").trim().slice(0, CUSTOM_LABEL_MAX);
      const made = tagSnapshot().find((t) => t.label === label);
      setMessages((all) =>
        all.map((m) =>
          m.id === id && m.role === "assistant" && m.proposal ? { ...m, proposal: { ...m.proposal, state: "created" as const, label, tagKey: made?.key } } : m,
        ),
      );
      return null;
    },
    [],
  );

  const clear = useCallback(() => {
    persist();
    abortRef.current?.abort();
    beginConversation(null, "");
    setMessages([]);
  }, [persist, beginConversation]);

  const restore = useCallback(
    (chatId: string, saved: ChatMessage[]) => {
      persist();
      abortRef.current?.abort();
      // what was just loaded is already saved: it is only saved again once it changes
      beginConversation(chatId, signature(saved));
      setRefineKey(null);
      // conversations saved before links existed have none
      setMessages(saved.map((m) => (m.role === "assistant" ? { ...m, links: m.links ?? [] } : m)));
    },
    [persist, beginConversation],
  );

  // a refresh puts the conversation that was open back: it is read from the account, where it was saved
  const restoredOnce = useRef(false);
  useEffect(() => {
    if (!connected || restoredOnce.current) return;
    restoredOnce.current = true;
    const last = recallOpen();
    if (!last?.id) return;
    const id = last.id;
    void loadChat(id).then(
      (saved) => {
        restore(id, saved);
        setOpen(true);
      },
      () => undefined,
    );
  }, [connected, restore]);

  const openRefine = useCallback((key: CustomMoodKey) => {
    // a new subject is a new conversation: what was said about songs is not about this tag
    persist();
    abortRef.current?.abort();
    beginConversation(null, "");
    setMessages([]);
    setRefineKey(key);
    setOpen(true);
  }, [persist, beginConversation]);
  const startTagCreate = useCallback(() => {
    persist();
    abortRef.current?.abort();
    beginConversation(null, "");
    setMessages([]);
    setRefineKey(null);
    setCreateStart(true);
    setOpen(true);
  }, [persist, beginConversation]);
  // the examples are for a conversation that has not started: the first word ends them
  const creating = createStart && messages.length === 0 && !refineKey;
  const leaveRefine = useCallback(() => {
    abortRef.current?.abort();
    beginConversation(null, "");
    setMessages([]);
    setRefineKey(null);
  }, [beginConversation]);

  const value = useMemo<Ctx>(
    () => ({
      open, toggle, close, messages, busy, refine, openRefine, leaveRefine,
      applyProposal, dismissProposal, createTag, startTagCreate, creating, send, stop, clear, restore, width, setWidth, maxWidth, searchWith, retry, actOn, shareTaste, toggleTaste, shareHistory, toggleHistory,
    }),
    [
      open, toggle, close, messages, busy, refine, openRefine, leaveRefine,
      applyProposal, dismissProposal, createTag, startTagCreate, creating, send, stop, clear, restore, width, setWidth, maxWidth, searchWith, retry, actOn, shareTaste, toggleTaste, shareHistory, toggleHistory,
    ],
  );
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): Ctx {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}
