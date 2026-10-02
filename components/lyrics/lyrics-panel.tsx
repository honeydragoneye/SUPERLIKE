"use client";

import { useEffect, useRef, useState } from "react";
import { usePlaybackPosition, useSpotify } from "@/components/player/spotify-provider";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useLyricsView } from "./lyrics-view";

type Line = { ms: number; text: string };
type Lyrics = { instrumental: boolean | null; lines: Line[]; plain: string[] };

const EMPTY: Lyrics = { instrumental: null, lines: [], plain: [] };

/**
 * Lyrics for whatever is playing, beside the player.
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
export function LyricsPanel() {
  const { now } = useSpotify();
  const positionMs = usePlaybackPosition();
  const { close } = useLyricsView();

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

  // follow the song rather than making the listener scroll with it
  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [current]);

  const nothing = !loading && timed.length === 0 && plain.length === 0;

  return (
    <section className="flex h-full w-full flex-col gap-[12px] overflow-hidden bg-chart p-[16px]">
      <div className="flex w-full shrink-0 items-start justify-between gap-[8px]">
        <div className="flex min-w-0 flex-col gap-px">
          <p className="text-[8px] tracking-[0.9px] text-on-bright-muted">LYRICS</p>
          <p className="truncate text-[19px] font-black tracking-[-0.5px]" title={now?.title}>
            {now?.title ?? "재생 중인 곡 없음"}
          </p>
          <p className="truncate text-[9px] text-on-bright-muted">{now?.artist ?? ""}</p>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="가사 닫기"
          title="가사 닫기"
          className="shrink-0 rounded-pill px-[6px] text-[12px] leading-none text-muted transition-colors hover:text-ink"
        >
          ×
        </button>
      </div>

      <div className="h-[1.5px] w-full shrink-0 bg-ink" />

      <div ref={listRef} className="scroll-y scroll-y-ink flex min-h-0 w-full flex-1 flex-col gap-[12px]">
        {loading && (
          <p className="flex shrink-0 items-center gap-[8px] text-[10px] text-on-bright-muted">
            불러오는 중
            <LoadingDots size={4} />
          </p>
        )}

        {nothing && (
          <p className="shrink-0 py-[20px] text-center text-[14px] font-black tracking-[1px] text-on-bright-muted">
            No LYRICS
          </p>
        )}

        {timed.map((line, i) => (
          <p
            key={`${line.ms}-${i}`}
            ref={i === current ? currentRef : null}
            className={
              i === current
                ? "shrink-0 text-[13.2px] font-black leading-[19px] text-pink-bright"
                : "shrink-0 text-[12px] leading-[17px] text-on-bright-muted"
            }
          >
            {line.text || " "}
          </p>
        ))}

        {/* no timings: the sheet, without a line to follow */}
        {timed.length === 0 &&
          plain.map((line, i) => (
            <p key={i} className="shrink-0 text-[12px] leading-[17px] text-on-bright-muted">
              {line}
            </p>
          ))}
      </div>

      <p className="shrink-0 text-[8px] tracking-[0.5px] text-on-bright-muted">
        출처: LRCLIB{timed.length ? " · 싱크 가사" : ""}
      </p>
    </section>
  );
}
