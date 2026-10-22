"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { TintedIcon } from "@/components/ui/icon";
import { useSpotify } from "@/components/player/spotify-provider";
import { clock } from "@/lib/time";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useSearchFocus } from "./search-focus";
import { useSuggest, SUGGEST_LIMIT } from "./search-suggest";
import { followersLabel } from "@/lib/suggest";
import { addRecent } from "@/lib/recent-searches";

/**
 * Sits in the action bar, where the quality pills used to be.
 *
 * Typing only suggests: a few tracks drop under the field so a familiar song
 * can be played without leaving whatever is on screen. The results page is a
 * deliberate step — Enter, or the button — because navigating on every
 * keystroke pulled the listener off the page they were reading.
 *
 * The committed query lives in the URL as `/search?q=…`, so a result list can
 * be shared, bookmarked and returned to with the back button.
 */
export function SearchField() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const urlQuery = params.get("q") ?? "";
  const { play } = useSpotify();
  // the header's search button focuses this field through here
  const { fieldRef } = useSearchFocus();

  /**
   * Derived rather than synced in an effect: when the URL changes from outside
   * — the back button, the header's home link — the field follows it, and while
   * typing the local text wins.
   */
  const [held, setHeld] = useState({ url: urlQuery, text: urlQuery });
  const text = held.url === urlQuery ? held.text : urlQuery;

  const [open, setOpen] = useState(false);

  /**
   * True while an IME is assembling a character.
   *
   * Korean is typed jamo by jamo, so "소녀시대" fires change events for ㅅ, 소,
   * ㅅㄴ… and each one searched. That is where the rate limit went: a four
   * character query cost roughly a dozen requests. The field still shows every
   * keystroke; only the search waits for the character to be finished.
   */
  const composing = useRef(false);
  const [settledText, setSettledText] = useState(urlQuery);

  /**
   * The results page is already showing this exact query, so the panel has
   * nothing to add — and searching for it a second time is what tipped Spotify
   * into rate-limiting the whole field.
   */
  const settled = pathname === "/search" && urlQuery === text.trim();
  const showing = open && text.trim().length > 0 && !settled;
  // the suggestion query trails the field by one completed character
  const { items, entities, loading } = useSuggest(showing ? settledText : "");
  const { artist, albums } = entities;
  // an artist or an album the typed name belongs to goes first; songs fill the rest of the six rows
  const named = (artist ? 1 : 0) + albums.length;
  const songs = items.slice(0, SUGGEST_LIMIT - named);
  const empty = songs.length === 0 && named === 0;
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const submit = () => {
    const q = text.trim();
    if (!q) return;
    composing.current = false;
    setSettledText(text);
    setOpen(false);
    addRecent(q);
    router.push(`/search?q=${encodeURIComponent(q)}`);
  };

  const onType = (next: string, done = !composing.current) => {
    setHeld({ url: urlQuery, text: next });
    setOpen(next.trim().length > 0);
    if (done) setSettledText(next);
  };

  return (
    <div className="relative shrink-0">
      <div className="flex h-[44px] w-[416px] items-center gap-[10px] rounded-pill bg-paper pl-[14px] pr-[8px] rule">
        <span className="text-ink">
          <TintedIcon name="search" size={16} />
        </span>
        <input
          ref={fieldRef}
          type="search"
          value={text}
          onChange={(e) => onType(e.target.value)}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={(e) => {
            composing.current = false;
            // the character is whole now, so this is worth searching for
            onType(e.currentTarget.value, true);
          }}
          onFocus={() => setOpen(text.trim().length > 0)}
          /* a click on a suggestion blurs the field first, so closing waits */
          onBlur={() => {
            blurTimer.current = setTimeout(() => setOpen(false), 120);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") {
              setOpen(false);
              onType("");
            }
          }}
          placeholder="곡, 아티스트 검색"
          aria-label="검색"
          role="combobox"
          aria-expanded={showing}
          aria-autocomplete="list"
          aria-controls="search-suggestions"
          className="min-w-0 flex-1 bg-transparent text-[12px] text-ink outline-none placeholder:text-muted [&::-webkit-search-cancel-button]:hidden"
        />
        {text ? (
          <>
            <button
              type="button"
              onClick={submit}
              title="검색 결과 페이지로 (Enter)"
              className="shrink-0 rounded-pill bg-ink px-[10px] py-[6px] text-[8px] tracking-[0.7px] text-paper-solid transition-colors hover:bg-accent-bright"
            >
              ENTER
            </button>
            <button
              type="button"
              onClick={() => onType("")}
              title="지우기 (Esc)"
              aria-label="검색어 지우기"
              className="shrink-0 rounded-pill px-[6px] text-[12px] leading-none text-muted transition-colors hover:text-ink"
            >
              ×
            </button>
          </>
        ) : (
          <span className="shrink-0 rounded-pill bg-ink px-[10px] py-[6px] text-[8px] tracking-[0.7px] text-paper-solid opacity-40">
            ENTER
          </span>
        )}
      </div>

      {showing && (
        <div
          id="search-suggestions"
          className="absolute left-0 top-full z-50 mt-[6px] w-[416px] overflow-hidden rounded-[8px] bg-paper-solid shadow-[0_6px_0_rgba(0,0,0,0.18)] rule"
          /* mousedown fires before blur, so this keeps the panel open long
             enough for the click that follows to land on a row */
          onMouseDown={() => blurTimer.current && clearTimeout(blurTimer.current)}
        >
          {empty ? (
            <p className="flex items-center gap-[8px] px-[14px] py-[12px] text-[10px] text-muted">
              {loading ? (
                <>
                  검색 중
                  <LoadingDots size={4} label="검색 중" />
                </>
              ) : (
                "결과가 없습니다"
              )}
            </p>
          ) : (
            <ul className="flex w-full flex-col">
              {artist && (
                <li className="rule-b">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push(`/artist/${artist.id}`);
                    }}
                    className="flex h-[44px] w-full cursor-pointer items-center gap-[10px] px-[10px] text-left transition-colors hover:bg-soft"
                  >
                    <span className="relative size-[28px] shrink-0 overflow-hidden rounded-full bg-ink">
                      {artist.image && (
                        <Image src={artist.image} alt="" fill sizes="28px" className="object-cover" unoptimized />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                      <span className="truncate text-[12px] font-bold text-on-bright">{artist.name}</span>
                      <span className="truncate text-[9px] text-on-bright-muted">
                        {artist.followers > 0 ? `팔로워 ${followersLabel(artist.followers)}` : "아티스트"}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-pill bg-ink px-[7px] py-[3px] text-[8px] text-paper-solid">
                      아티스트
                    </span>
                  </button>
                </li>
              )}
              {albums.map((a) => (
                <li key={a.id} className="rule-b">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      router.push(`/album/${a.id}`);
                    }}
                    className="flex h-[44px] w-full cursor-pointer items-center gap-[10px] px-[10px] text-left transition-colors hover:bg-soft"
                  >
                    <span className="relative size-[28px] shrink-0 overflow-hidden rounded-[3px] bg-ink">
                      {a.artwork && (
                        <Image src={a.artwork} alt="" fill sizes="28px" className="object-cover" unoptimized />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                      <span className="truncate text-[12px] font-bold text-on-bright">{a.name}</span>
                      <span className="truncate text-[9px] text-on-bright-muted">
                        {[a.artist, a.releaseDate.slice(0, 4), a.totalTracks ? `${a.totalTracks}곡` : ""]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </span>
                    <span className="shrink-0 rounded-pill bg-ink px-[7px] py-[3px] text-[8px] text-paper-solid">
                      앨범
                    </span>
                  </button>
                </li>
              ))}
              {songs.map((t) => (
                <li key={t.id} className="rule-b">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      void play({ uris: [t.uri] });
                    }}
                    className="flex h-[44px] w-full cursor-pointer items-center gap-[10px] px-[10px] text-left transition-colors hover:bg-soft"
                  >
                    <span className="relative size-[28px] shrink-0 overflow-hidden rounded-[3px] bg-ink">
                      {t.artwork && (
                        <Image
                          src={t.artwork}
                          alt=""
                          fill
                          sizes="28px"
                          className="object-cover"
                          unoptimized
                        />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                      <span className="truncate text-[12px] text-on-bright">{t.name}</span>
                      <span className="truncate text-[9px] text-on-bright-muted">
                        {t.artist}
                      </span>
                    </span>
                    <span className="tnum shrink-0 text-[9px] text-on-bright-muted">
                      {clock(t.durationMs)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="button"
            onClick={submit}
            className="flex w-full items-center justify-between gap-[8px] bg-soft px-[14px] py-[10px] text-left text-[9px] tracking-[0.6px] transition-colors hover:bg-soft"
          >
            <span className="truncate">&ldquo;{text.trim()}&rdquo; 전체 검색 결과</span>
            <span aria-hidden className="shrink-0 text-[11px]">
              →
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
