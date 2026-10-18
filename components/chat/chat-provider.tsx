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
import { useLyricsView } from "@/components/lyrics/lyrics-view";

/** The width the chat column starts at, and the narrowest it can be dragged to. */
export const CHAT_MIN_WIDTH = 330;
const WIDTH_KEY = "superlike:chat-width:v1";

/** A song the agent chose. Last.fm's spelling: no Spotify id until the card looks one up. */
export type ChatTrack = { title: string; artist: string };

export type ChatMessage =
  | { id: string; role: "user"; text: string }
  | {
      id: string;
      role: "assistant";
      text: string;
      /** what the agent is doing, or just did: "후보 20곡 확인 → 3곡 통과" */
      status: string | null;
      tracks: ChatTrack[];
      error: string | null;
      streaming: boolean;
    };

type Ctx = {
  open: boolean;
  toggle: () => void;
  close: () => void;
  messages: ChatMessage[];
  busy: boolean;
  send: (question: string) => Promise<void>;
  stop: () => void;
  clear: () => void;
  width: number;
  /** clamped to [CHAT_MIN_WIDTH, half the window] */
  setWidth: (px: number) => void;
  maxWidth: number;
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
    } else if (m.text.trim() || m.tracks.length) {
      const songs = m.tracks.length
        ? `\n(추천한 곡: ${m.tracks.map((t) => `${t.title} - ${t.artist}`).join(", ")})`
        : "";
      out.push({ role: "assistant", content: m.text.trim() + songs });
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
  const saved = useSyncExternalStore(subscribeWidth, readSavedWidth, () => CHAT_MIN_WIDTH);
  const maxWidth = useSyncExternalStore(subscribeWindow, maxChatWidth, () => CHAT_MIN_WIDTH);
  // a width that was fine before can be too wide for a window that has since shrunk
  const width = clamp(saved, maxWidth);

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

  const send = useCallback(
    async (raw: string) => {
      const question = raw.trim();
      if (!question || abortRef.current) return;

      const history = historyOf(messagesRef.current);
      const reply = nextId();
      setMessages((all) => [
        ...all,
        { id: nextId(), role: "user", text: question },
        { id: reply, role: "assistant", text: "", status: null, tracks: [], error: null, streaming: true },
      ]);

      const controller = new AbortController();
      abortRef.current = controller;
      setBusy(true);

      try {
        const res = await fetch("/api/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question, history }),
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
                m.status = event.name === "top_tracks" ? "곡을 찾는 중…" : "곡을 확인하는 중…";
              });
              break;
            case "tool_result": {
              const result = event.result as { tracks?: ChatTrack[]; checked?: number } | undefined;
              if (result && Array.isArray(result.tracks)) {
                const found = result.tracks.map((t) => ({ title: String(t.title), artist: String(t.artist) }));
                patch(reply, (m) => {
                  m.tracks = found;
                  m.status =
                    typeof result.checked === "number"
                      ? found.length
                        ? `후보 ${result.checked}곡 확인 → ${found.length}곡 통과`
                        : `후보 ${result.checked}곡 확인 → 조건에 맞는 곡 없음`
                      : null;
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
        });
      }
    },
    [patch],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
  }, []);

  const value = useMemo<Ctx>(
    () => ({ open, toggle, close, messages, busy, send, stop, clear, width, setWidth, maxWidth }),
    [open, toggle, close, messages, busy, send, stop, clear, width, setWidth, maxWidth],
  );
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): Ctx {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}
