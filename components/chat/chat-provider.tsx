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
import { useCustomTags } from "@/components/station/use-custom-tags";
import { snapshot as likedSnapshot } from "@/lib/likes";
import { updateCustomDefinition } from "@/lib/station/custom-tags";
import type { CustomMoodKey } from "@/lib/station/filter";
import { useLyricsView } from "@/components/lyrics/lyrics-view";

/** The width the chat column starts at, and the narrowest it can be dragged to. */
export const CHAT_MIN_WIDTH = 330;
const WIDTH_KEY = "superlike:chat-width:v1";
const TASTE_KEY = "superlike:chat-taste:v1";
/** How many of the newest liked songs go to the agent when the listener shares them. */
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
  definition: string;
  reason: string;
  /** set when the criterion is something a title and an artist cannot settle */
  warning: string | null;
  preview: { checked: number; passedCount: number; passed: ChatTrack[]; failed: ChatTrack[] };
  state: "pending" | "applied" | "dismissed";
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
      proposal: ChatProposal | null;
      /** the question as asked, so the same one can be asked again with another source */
      question: string;
      /** set when the agent could not answer: where it looked, and where else the listener can send it */
      offer: { tried: ChatSource[]; options: ChatSource[] } | null;
      error: string | null;
      streaming: boolean;
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
  send: (question: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
  width: number;
  /** clamped to [CHAT_MIN_WIDTH, half the window] */
  setWidth: (px: number) => void;
  maxWidth: number;
  /** the listener picked where to look next, for the question this answer was about */
  searchWith: (messageId: string, source: ChatSource) => void;
  /** whether the liked songs are shared with the agent, and the switch for it */
  shareTaste: boolean;
  toggleTaste: () => void;
};

const ChatContext = createContext<Ctx | null>(null);

/** Half of the window, and never under the minimum: the chat may not take more than that. */
function maxChatWidth(): number {
  if (typeof window === "undefined") return CHAT_MIN_WIDTH;
  return Math.max(CHAT_MIN_WIDTH, Math.floor(window.innerWidth / 2));
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
 * Whether the liked songs are shared with the agent. Off until the listener
 * turns it on: the songs leave this browser for the model, so it is a choice.
 */
let savedTaste: boolean | undefined; // undefined = not read yet
const tasteListeners = new Set<() => void>();

function readTaste(): boolean {
  if (savedTaste === undefined) {
    try {
      savedTaste = localStorage.getItem(TASTE_KEY) === "1";
    } catch {
      savedTaste = false;
    }
  }
  return savedTaste;
}

function subscribeTaste(onChange: () => void): () => void {
  tasteListeners.add(onChange);
  return () => void tasteListeners.delete(onChange);
}

function writeTaste(on: boolean): void {
  savedTaste = on;
  try {
    localStorage.setItem(TASTE_KEY, on ? "1" : "0");
  } catch {
    // still applies for this session
  }
  for (const fn of tasteListeners) fn();
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

const OFFLINE = "에이전트가 꺼져 있어요. 터미널에서 npm run agent 를 실행해 주세요.";

/** What the model is shown of the earlier turns: the cards' songs are not in the text, so they are added. */
function historyOf(messages: ChatMessage[]): { role: "user" | "assistant"; content: string }[] {
  const out: { role: "user" | "assistant"; content: string }[] = [];
  for (const m of messages) {
    if (m.role === "user") {
      out.push({ role: "user", content: m.text });
    } else if (m.text.trim() || m.tracks.length || m.proposal) {
      const songs = m.tracks.length
        ? `\n(추천한 곡: ${m.tracks.map((t) => `${t.title} - ${t.artist}`).join(", ")})`
        : "";
      const proposed = m.proposal
        ? `\n(제안한 기준: ${m.proposal.definition} — ${
            { pending: "아직 답 없음", applied: "사용자가 적용함", dismissed: "사용자가 취소함" }[m.proposal.state]
          })`
        : "";
      out.push({ role: "assistant", content: m.text.trim() + songs + proposed });
    }
  }
  return out;
}

let seq = 0;
const nextId = () => `m${Date.now().toString(36)}${(seq++).toString(36)}`;

/**
 * The conversation with the music agent, and whether and how wide its column is.
 *
 * Held above the pages, like the lyrics view: the chat keeps its messages while
 * you move between screens, and a reply that is still arriving does not stop
 * because you navigated.
 */
export function ChatProvider({ children }: { children: React.ReactNode }) {
  const lyrics = useLyricsView();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const [refineKey, setRefineKey] = useState<CustomMoodKey | null>(null);
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

  const messagesRef = useRef<ChatMessage[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const abortRef = useRef<AbortController | null>(null);

  const setWidth = useCallback((px: number) => writeSavedWidth(clamp(px, maxChatWidth())), []);

  const close = useCallback(() => setOpen(false), []);
  const toggle = useCallback(() => {
    // the lyrics column takes the same place; one at a time
    if (!open) lyrics.close();
    setOpen(!open);
  }, [open, lyrics]);

  const patch = useCallback((id: string, change: (m: Extract<ChatMessage, { role: "assistant" }>) => void) => {
    setMessages((all) =>
      all.map((m) => {
        if (m.id !== id || m.role !== "assistant") return m;
        const copy = { ...m, tracks: [...m.tracks] };
        change(copy);
        return copy;
      }),
    );
  }, []);

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
          id: reply, role: "assistant", text: "", status: null, tracks: [], proposal: null,
          question, offer: null, error: null, streaming: true,
        },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            question,
            history,
            refine: refineRef.current && { label: refineRef.current.label, definition: refineRef.current.definition },
            sources: opts?.sources,
            // read when sending, so a heart pressed a second ago is already in
            taste: readTaste()
              ? likedSnapshot().slice(0, TASTE_MAX).map((t) => ({ title: t.title, artist: t.artist }))
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
            case "tool_call":
              patch(reply, (m) => {
                m.status =
                  event.name === "top_tracks"
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
            case "tool_result": {
              const result = event.result as
                | {
                    found?: boolean;
                    based_on?: string;
                    tracks?: ChatTrack[];
                    checked?: number;
                    proposal?: { definition: string; reason?: string; warning?: string };
                    preview?: { checked: number; passed_count?: number; passed: ChatTrack[]; failed: ChatTrack[] };
                  }
                | undefined;
              if (result?.proposal && result.preview) {
                const { proposal, preview } = result;
                patch(reply, (m) => {
                  // a newer proposal replaces the one before it: only the last is on the table
                  m.proposal = {
                    definition: String(proposal.definition),
                    reason: String(proposal.reason ?? ""),
                    warning: proposal.warning ? String(proposal.warning) : null,
                    preview: {
                      checked: Number(preview.checked) || 0,
                      passedCount: Number(preview.passed_count ?? preview.passed.length) || 0,
                      passed: preview.passed.map((t) => ({ title: String(t.title), artist: String(t.artist) })),
                      failed: preview.failed.map((t) => ({ title: String(t.title), artist: String(t.artist) })),
                    },
                    state: "pending",
                  };
                  m.status = "기준을 정리했어요";
                });
                break;
              }
              const note = NOTE_OF[String(event.name)];
              if (note && result && !Array.isArray(result.tracks)) {
                // an answer about an artist or a song: say where it came from, or that nothing was there
                patch(reply, (m) => {
                  m.status = result.found === false ? `${note}에 정보가 없었어요` : `${note} 참고`;
                });
                break;
              }
              if (result && Array.isArray(result.tracks)) {
                const found = result.tracks.map((t) => ({ title: String(t.title), artist: String(t.artist) }));
                patch(reply, (m) => {
                  m.tracks = found;
                  if (event.name === "find_track") {
                    // asked for one named song: it is either found, or it is not
                    m.status = found.length ? "곡을 찾았어요" : "곡을 찾지 못했어요";
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
      }
    },
    [patch],
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

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const setProposalState = useCallback(
    (id: string, state: "applied" | "dismissed") =>
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

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
  }, []);

  const openRefine = useCallback(
    (key: CustomMoodKey) => {
      // a new subject is a new conversation: what was said about songs is not about this tag
      abortRef.current?.abort();
      setMessages([]);
      setRefineKey(key);
      lyrics.close();
      setOpen(true);
    },
    [lyrics],
  );
  const leaveRefine = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setRefineKey(null);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      open, toggle, close, messages, busy, refine, openRefine, leaveRefine,
      applyProposal, dismissProposal, send, stop, clear, width, setWidth, maxWidth, searchWith, shareTaste, toggleTaste,
    }),
    [
      open, toggle, close, messages, busy, refine, openRefine, leaveRefine,
      applyProposal, dismissProposal, send, stop, clear, width, setWidth, maxWidth, searchWith, shareTaste, toggleTaste,
    ],
  );
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): Ctx {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}
