"use client";

import { forwardRef, useEffect, useRef, useState } from "react";
import { usePlaybackPosition, useSpotify } from "@/components/player/spotify-provider";
import { LoadingDots } from "@/components/ui/loading-dots";

type Line = { ms: number; text: string };
type Lyrics = { instrumental: boolean | null; lines: Line[]; plain: string[] };

const EMPTY: Lyrics = { instrumental: null, lines: [], plain: [] };

/**
 * Lyrics for whatever is playing, in the popover over the player bar.
 *
 * Timed lines when LRCLIB has them: the line being sung is the last one whose
 * stamp is behind the playback position the panel already receives every
 * second, and it carries colour, weight and a tenth more size. Everything
 * scrolls, and the current line is kept in view so the listener never has to
 * chase it.
 *
 * With only plain text the lines still all show, unhighlighted — a lyric sheet
 * rather than a follow-along.
 */
export const LyricsPopover = forwardRef<HTMLDivElement>(function LyricsPopover(_, ref) {
  const { now } = useSpotify();
  const positionMs = usePlaybackPosition();

  const [held, setHeld] = useState<{ uri: string; data: Lyrics } | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const currentRef = useRef<HTMLParagraphElement | null>(null);

  const uri = now?.uri ?? "";
  /**
   * Both derived from what is held, so a track change shows its own state
   * without an effect reaching back into React to announce it.
   */
  const lyrics = held?.uri === uri ? held.data : null;
  const loading = Boolean(uri) && lyrics === null;

  useEffect(() => {
    if (!now?.uri || !now.title || !now.artist) return;

    let live = true;
    const params = new URLSearchParams({
      name: now.title,
      artist: now.artist,
      id: now.uri.split(":").pop() ?? "",
      durationMs: String(now.durationMs),
    });

    (async () => {
      try {
        const res = await fetch(`/api/lyrics?${params}`, { cache: "no-store" });
        if (!live) return;
        setHeld({ uri: now.uri, data: res.ok ? ((await res.json()) as Lyrics) : EMPTY });
      } catch {
        if (live) setHeld({ uri: now.uri, data: EMPTY });
      }
    })();

    return () => {
      live = false;
    };
  }, [now?.uri, now?.title, now?.artist, now?.durationMs]);

  const timed = lyrics?.lines ?? [];
  const plain = lyrics?.plain ?? [];

  /**
   * The last line already reached that actually has words in it.
   *
   * Skipping the blank spacer rows matters more than it looks. A transcription
   * that stamps a blank line early and then says nothing for half a minute
   * would otherwise have the panel highlighting whitespace for that whole
   * stretch — which reads as the lyrics having stopped following the song.
   * -1 until the first line is due.
   */
  const current = timed.reduce(
    (at, line, i) => (line.ms <= positionMs && line.text ? i : at),
    -1,
  );

  /**
   * Follow the song rather than making the listener scroll with it.
   *
   * Scrolls the list itself: scrollIntoView would also move every scrollable
   * ancestor, and this list sits in a popover over the page.
   */
  useEffect(() => {
    const list = listRef.current;
    const line = currentRef.current;
    if (!list || !line) return;
    list.scrollTo({
      top: line.offsetTop - list.clientHeight / 2 + line.clientHeight / 2,
      behavior: "smooth",
    });
  }, [current]);

  const nothing = !loading && timed.length === 0 && plain.length === 0;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="가사"
      className="absolute bottom-[calc(100%+8px)] right-[16px] z-30 flex w-[380px] flex-col gap-[12px] rounded-[8px] bg-ink p-[16px] text-on-dark shadow-[0_-4px_20px_rgba(0,0,0,0.35)]"
    >
      <div className="flex w-full shrink-0 items-center justify-between gap-[12px] whitespace-nowrap">
        <p className="text-[10px] tracking-[1px]">LYRICS</p>
        <p className="truncate text-[10px] tracking-[0.5px] text-on-dark-muted" title={now?.title}>
          {now ? `${now.title} · ${timed.length ? "싱크 가사" : "가사"}` : "재생 중인 곡 없음"}
        </p>
      </div>

      <div
        ref={listRef}
        className="scroll-y relative flex h-[232px] w-full flex-col gap-[12px]"
      >
        {loading && (
          <p className="flex shrink-0 items-center gap-[8px] text-[10px] text-on-dark-muted">
            불러오는 중
            <LoadingDots size={4} />
          </p>
        )}

        {nothing && (
          <p className="shrink-0 py-[20px] text-center text-[14px] font-black tracking-[1px] text-on-dark-muted">
            No LYRICS
          </p>
        )}

        {timed.map((line, i) => (
          <p
            key={`${line.ms}-${i}`}
            ref={i === current ? currentRef : null}
            className={
              i === current
                ? "shrink-0 text-[13.2px] font-black leading-[19px] text-accent-bright"
                : "shrink-0 text-[12px] leading-[17px] text-on-dark-muted"
            }
          >
            {line.text || " "}
          </p>
        ))}

        {/* no timings: the sheet, without a line to follow */}
        {timed.length === 0 &&
          plain.map((line, i) => (
            <p key={i} className="shrink-0 text-[12px] leading-[17px] text-on-dark-muted">
              {line}
            </p>
          ))}
      </div>

      <p className="shrink-0 text-[8px] tracking-[0.5px] text-on-dark-muted">
        출처: LRCLIB{timed.length ? " · 싱크 가사" : ""}
      </p>
    </div>
  );
});
