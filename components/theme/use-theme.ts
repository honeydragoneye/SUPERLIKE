"use client";

import { useCallback, useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

/** The listener's own choice; absent until they make one, and then the system decides. */
export const THEME_KEY = "superlike-theme";

/**
 * Runs in <head> before the first paint, so the page is never drawn in the
 * wrong colours and then corrected. Kept as a string because it has to execute
 * as the HTML is parsed, before any component exists.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem("${THEME_KEY}");if(t!=="light"&&t!=="dark")t=matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="light"}`;

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  // the system flipping (sunset on an auto schedule) matters only while nothing is chosen
  const media = matchMedia("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (!stored()) {
      apply(media.matches ? "dark" : "light");
      onChange();
    }
  };
  media.addEventListener("change", onSystem);
  return () => {
    listeners.delete(onChange);
    media.removeEventListener("change", onSystem);
  };
}

function stored(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return t === "light" || t === "dark" ? t : null;
  } catch {
    return null;
  }
}

function apply(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

/** What the page is showing now: the attribute the head script (or a press) set. */
function snapshot(): Theme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

/** The server has no listener to ask, so it draws light, as the HTML does before the script runs. */
function serverSnapshot(): Theme {
  return "light";
}

/**
 * The colour mode, and a way to change it.
 *
 * Reads the attribute the head script already set, so the first client render
 * agrees with what is on screen. A press stores the choice and applies it in
 * the same turn; storage that refuses (private windows) still changes this
 * visit, it just is not remembered.
 */
export function useTheme(): { theme: Theme; setTheme: (next: Theme) => void } {
  const theme = useSyncExternalStore(subscribe, snapshot, serverSnapshot);
  const setTheme = useCallback((next: Theme) => {
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      /* not remembered, still applied */
    }
    apply(next);
    listeners.forEach((l) => l());
  }, []);
  return { theme, setTheme };
}
