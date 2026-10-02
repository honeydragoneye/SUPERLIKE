"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type Ctx = { open: boolean; toggle: () => void; close: () => void };

const LyricsViewContext = createContext<Ctx | null>(null);

/**
 * Whether the lyrics column is showing.
 *
 * Held here because the control and the panel live apart: the button is in the
 * Now Playing column, the panel is a column of the grid. Both are mounted for
 * the whole session, so this state outlives any page.
 */
export function LyricsViewProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const close = useCallback(() => setOpen(false), []);
  const value = useMemo<Ctx>(() => ({ open, toggle, close }), [open, toggle, close]);
  return <LyricsViewContext.Provider value={value}>{children}</LyricsViewContext.Provider>;
}

export function useLyricsView(): Ctx {
  const ctx = useContext(LyricsViewContext);
  if (!ctx) throw new Error("useLyricsView must be used inside <LyricsViewProvider>");
  return ctx;
}
