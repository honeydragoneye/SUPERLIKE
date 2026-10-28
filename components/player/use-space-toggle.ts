"use client";

import { useEffect, useRef } from "react";
import { useRadio } from "@/components/radio/radio-provider";
import { useSpotify } from "./spotify-provider";

/** True where a space is a character the listener is typing. */
function typing(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
  if (target instanceof HTMLInputElement) {
    // a checkbox or a button takes the space as a press, not as text
    return !["button", "checkbox", "radio", "range", "submit", "reset", "file", "color"].includes(target.type);
  }
  return target.getAttribute("role") === "textbox";
}

/**
 * The space bar plays and pauses, wherever the listener is on the page.
 *
 * Whatever is sounding is what it stops: the radio if that is on, else Spotify.
 * Pressed again it starts the one that was last stopped, so the key undoes
 * itself. With nothing loaded there is nothing to toggle, and the space keeps
 * its usual job (scrolling the page).
 *
 * Left alone where a space is a character: the search box, the chat input, any
 * text field. And left alone inside a modal dialog, where it confirms the
 * focused button — the connect step has its button focused on opening.
 *
 * Even on a focused button the space plays rather than presses it. The browser
 * presses on key-up, so that one is cancelled too, or the button would fire
 * after the song had already toggled.
 */
export function useSpaceToggle(): void {
  const spotify = useSpotify();
  const radio = useRadio();

  const latest = useRef({ spotify, radio });
  // after each render, so the listener below always reads the current players
  useEffect(() => {
    latest.current = { spotify, radio };
  });
  /** which one was sounding last, so a second press brings the same one back */
  const last = useRef<"spotify" | "radio">("spotify");

  useEffect(() => {
    if (radio.status === "playing" || radio.status === "loading") last.current = "radio";
  }, [radio.status]);
  useEffect(() => {
    if (spotify.isPlaying) last.current = "spotify";
  }, [spotify.isPlaying]);

  useEffect(() => {
    const ours = (e: KeyboardEvent): boolean =>
      (e.code === "Space" || e.key === " ") &&
      !e.ctrlKey &&
      !e.metaKey &&
      !e.altKey &&
      !e.isComposing &&
      !typing(e.target) &&
      !(e.target instanceof Element && e.target.closest('[aria-modal="true"]'));

    const onDown = (e: KeyboardEvent) => {
      if (!ours(e)) return;
      const { spotify: sp, radio: rd } = latest.current;

      const radioOn = rd.status === "playing" || rd.status === "loading";
      const radioBack = !radioOn && last.current === "radio" && rd.current !== null;
      const spotifyHas = sp.now !== null;
      if (!radioOn && !radioBack && !spotifyHas) return;

      // taken even when held down, so the page does not scroll between toggles
      e.preventDefault();
      if (e.repeat) return;
      if (radioOn || radioBack) void rd.toggle();
      else void sp.toggle();
    };

    const onUp = (e: KeyboardEvent) => {
      if (!ours(e)) return;
      const { spotify: sp, radio: rd } = latest.current;
      const active =
        rd.status === "playing" || rd.status === "loading" || sp.now !== null || last.current === "radio";
      if (active) e.preventDefault();
    };

    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
    };
  }, []);
}
