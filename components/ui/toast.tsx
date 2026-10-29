"use client";

import { useSyncExternalStore } from "react";

/**
 * A short note at the foot of the screen, with an optional way to undo what it
 * says. One at a time: a new one replaces the one showing.
 */
type Toast = { id: number; text: string; action?: { label: string; run: () => void } };

let current: Toast | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let next = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((l) => l());
}

export function dismissToast(): void {
  if (timer) clearTimeout(timer);
  timer = null;
  current = null;
  emit();
}

export function showToast(text: string, action?: Toast["action"], ms = 5000): void {
  if (timer) clearTimeout(timer);
  current = { id: next++, text, action };
  timer = setTimeout(dismissToast, ms);
  emit();
}

export function ToastHost() {
  const toast = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
    () => null,
  );
  if (!toast) return null;
  return (
    <div
      role="status"
      className="fixed bottom-[88px] left-1/2 z-50 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-[14px] rounded-[8px] bg-[#1f1f1f] px-[16px] py-[10px] text-[11px] tracking-[0.3px] text-on-dark shadow-[0_4px_20px_rgba(0,0,0,0.35)]"
    >
      <span>{toast.text}</span>
      {toast.action && (
        <button
          type="button"
          onClick={() => {
            toast.action?.run();
            dismissToast();
          }}
          className="cursor-pointer whitespace-nowrap text-[10px] text-[#9eb3ff] transition-colors hover:text-on-dark"
        >
          {toast.action.label}
        </button>
      )}
    </div>
  );
}
