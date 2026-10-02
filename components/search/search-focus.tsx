"use client";

import { createContext, useCallback, useContext, useMemo, useRef } from "react";

type Ctx = {
  /** the field registers its input here so controls outside it can reach it */
  fieldRef: React.RefObject<HTMLInputElement | null>;
  /** puts the caret in the search field, selecting whatever is already typed */
  focus: () => void;
};

const SearchFocusContext = createContext<Ctx | null>(null);

/**
 * Lets a control outside the search field put the caret in it.
 *
 * The header's search button and the field sit in different rows of the shell
 * — the header is its own band, the field lives in the action bar — so there
 * is no parent between them to hold this.
 *
 * A ref rather than a counter: focusing is an action on a DOM node, not a
 * piece of state. Routing it through state would mean an effect watching a
 * nonce to perform something that should happen on the press itself, and the
 * nonce would have to keep changing for a second press to register.
 */
export function SearchFocusProvider({ children }: { children: React.ReactNode }) {
  const fieldRef = useRef<HTMLInputElement | null>(null);

  const focus = useCallback(() => {
    const el = fieldRef.current;
    // the field is part of the shell, so this only misses before it mounts
    if (!el) return;
    el.focus();
    /**
     * Selecting rather than appending.
     *
     * Pressing the header's search button means "I want to search for
     * something", and the something is rarely a continuation of a query left
     * in the field from earlier. Typing replaces it; the arrow keys still keep
     * it for anyone who did mean to edit.
     */
    el.select();
  }, []);

  const value = useMemo<Ctx>(() => ({ fieldRef, focus }), [focus]);
  return <SearchFocusContext.Provider value={value}>{children}</SearchFocusContext.Provider>;
}

export function useSearchFocus(): Ctx {
  const ctx = useContext(SearchFocusContext);
  if (!ctx) throw new Error("useSearchFocus must be used inside <SearchFocusProvider>");
  return ctx;
}
