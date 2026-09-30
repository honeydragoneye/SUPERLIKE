"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

type Ctx = {
  /** true while the Discover column shows the station instead of the home blocks */
  open: boolean;
  show: () => void;
  hide: () => void;
};

const StationViewContext = createContext<Ctx | null>(null);

/**
 * Which screen the middle column is on.
 *
 * The station is a view swap rather than a route, for the same reason search
 * is: the shell around it — the ticker, the header, the action bar and the Now
 * Playing column — has to stay mounted. A route change would tear down the
 * Spotify player and interrupt playback, which is exactly what this app must
 * never do.
 */
export function StationViewProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => setOpen(false), []);
  const value = useMemo<Ctx>(() => ({ open, show, hide }), [open, show, hide]);

  return (
    <StationViewContext.Provider value={value}>{children}</StationViewContext.Provider>
  );
}

export function useStationView(): Ctx {
  const ctx = useContext(StationViewContext);
  if (!ctx) throw new Error("useStationView must be used inside <StationViewProvider>");
  return ctx;
}
