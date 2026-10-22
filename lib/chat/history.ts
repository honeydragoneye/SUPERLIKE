import type { ChatMessage } from "@/components/chat/chat-provider";

/** The browser's side of the saved conversations (app/api/me/chats). */
export type ChatSummary = { id: string; title: string; count: number; updatedAt: string };

export async function listChats(): Promise<ChatSummary[]> {
  const res = await fetch("/api/me/chats", { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as { chats: ChatSummary[] }).chats;
}

export async function loadChat(id: string): Promise<ChatMessage[]> {
  const res = await fetch(`/api/me/chats/${id}`, { cache: "no-store" });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as { messages: ChatMessage[] }).messages;
}

export async function removeChat(id: string): Promise<void> {
  const res = await fetch(`/api/me/chats/${id}`, { method: "DELETE" });
  if (!res.ok) throw new Error(String(res.status));
}

/**
 * Saves a conversation; `id` is the one it was saved as before, null the first time. Resolves to its id.
 * `keepalive` lets the request outlive the page: it is what a refresh or a closing tab sends.
 */
export async function saveChat(id: string | null, messages: ChatMessage[], opts?: { keepalive?: boolean }): Promise<string> {
  const res = await fetch("/api/me/chats", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, messages }),
    keepalive: opts?.keepalive,
  });
  if (!res.ok) throw new Error(String(res.status));
  return ((await res.json()) as { id: string }).id;
}
