"use client";

import { useEffect, useState } from "react";
import { LoadingDots } from "@/components/ui/loading-dots";
import { listChats, loadChat, removeChat, type ChatSummary } from "@/lib/chat/history";
import { useChat } from "./chat-provider";

type State = { kind: "loading" } | { kind: "error" } | { kind: "ok"; chats: ChatSummary[] };

/** "오늘 14:22", "어제", otherwise "10.18" — in the listener's own clock. */
function when(iso: string): string {
  const at = new Date(iso);
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const ago = Math.round((day(new Date()) - day(at)) / 86_400_000);
  if (ago === 0) return `오늘 ${at.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}`;
  if (ago === 1) return "어제";
  return `${String(at.getMonth() + 1).padStart(2, "0")}.${String(at.getDate()).padStart(2, "0")}`;
}

/** The clock on the chat header: a ring with two hands. */
export function ClockIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" aria-hidden>
      <circle cx="6.5" cy="6.5" r="5.9" stroke="currentColor" strokeWidth="1.2" />
      <path d="M6.5 3.4V6.5H8.9" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The saved conversations, listed over the top of the chat.
 *
 * Nothing here saves anything: the chat does that itself when it is closed or
 * NEW is pressed (chat-provider). This only lists what is saved, opens one,
 * and deletes one.
 */
export const ChatHistory = function ChatHistory({
  onClose,
  popoverRef,
}: {
  onClose: () => void;
  popoverRef: React.RefObject<HTMLDivElement | null>;
}) {
  const { restore } = useChat();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [opening, setOpening] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    listChats()
      .then((chats): State => ({ kind: "ok", chats }))
      .catch((): State => ({ kind: "error" }))
      .then((s) => live && setState(s));
    return () => {
      live = false;
    };
  }, []);

  const open = async (id: string) => {
    if (opening) return;
    setOpening(id);
    try {
      restore(id, await loadChat(id));
      onClose();
    } catch {
      // it was deleted from another window, or the request failed: drop it from the list
      setState((s) => (s.kind === "ok" ? { kind: "ok", chats: s.chats.filter((c) => c.id !== id) } : s));
    } finally {
      setOpening(null);
    }
  };

  const remove = (id: string) => {
    setState((s) => (s.kind === "ok" ? { kind: "ok", chats: s.chats.filter((c) => c.id !== id) } : s));
    void removeChat(id).catch(() => {
      // not deleted after all: show the list as the server has it
      void listChats().then((chats) => setState({ kind: "ok", chats })).catch(() => {});
    });
  };

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="대화 이력"
      className="absolute inset-x-[16px] top-[58px] z-20 flex max-h-[calc(100%-74px)] flex-col gap-[10px] rounded-[10px] bg-card px-[14px] pb-[10px] pt-[14px] shadow-[0_6px_16px_rgba(0,0,0,0.18)] rule"
    >
      <div className="flex w-full shrink-0 items-center justify-between gap-[8px]">
        <p className="text-[12px] font-black text-on-bright">대화 이력</p>
        <p className="shrink-0 whitespace-nowrap text-[8px] tracking-[0.4px] text-on-bright-muted">20개까지 · 계정에 저장</p>
      </div>
      <p className="shrink-0 text-[8px] tracking-[0.4px] text-on-bright-muted">창을 닫거나 NEW를 누르면 자동으로 저장돼요</p>
      <div className="h-px w-full shrink-0 bg-ink/20" />

      {state.kind === "loading" ? (
        <p className="flex items-center gap-[8px] py-[10px] text-[10px] text-on-bright-muted">
          <LoadingDots size={4} label="불러오는 중" />
          불러오는 중
        </p>
      ) : state.kind === "error" ? (
        <p className="py-[10px] text-[10px] text-on-bright-muted">이력을 불러오지 못했어요.</p>
      ) : state.chats.length === 0 ? (
        <div className="flex flex-col gap-[4px] py-[12px]">
          <p className="text-[12px] font-black text-on-bright">저장된 대화가 없어요</p>
          <p className="text-[9px] leading-[14px] text-on-bright-muted">
            챗봇과 대화한 뒤 창을 닫거나 NEW를 누르면 여기에 쌓여요.
          </p>
        </div>
      ) : (
        <ul className="scroll-y flex min-h-0 flex-col">
          {state.chats.map((c) => (
            <li key={c.id} className="flex items-center gap-[8px] rounded-[6px] pr-[8px] transition-colors hover:bg-soft/45">
              <button
                type="button"
                disabled={opening !== null}
                onClick={() => void open(c.id)}
                className="flex min-w-0 flex-1 cursor-pointer flex-col gap-[2px] px-[8px] py-[8px] text-left disabled:cursor-default"
              >
                <span className="truncate text-[11px] font-black text-on-bright" title={c.title}>
                  {c.title}
                </span>
                <span className="flex items-center gap-[6px] text-[8px] tracking-[0.4px] text-on-bright-muted">
                  {opening === c.id ? <LoadingDots size={3} label="여는 중" /> : `${when(c.updatedAt)} · 메시지 ${c.count}개`}
                </span>
              </button>
              <button
                type="button"
                aria-label={`${c.title} 삭제`}
                title="삭제"
                onClick={() => remove(c.id)}
                className="shrink-0 cursor-pointer px-[4px] text-[14px] leading-none text-on-bright-muted transition-colors hover:text-on-bright"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
