"use client";

import { useEffect, useRef, useState } from "react";
import { useSpotify } from "@/components/player/spotify-provider";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useHydrated } from "@/components/ui/use-hydrated";
import { useLikedTracks } from "@/components/player/use-likes";
import { useCustomTags } from "@/components/station/use-custom-tags";
import { boldSpans } from "@/lib/chat/inline";
import { CHAT_SOURCES, useChat, type ChatMessage, type ChatProposal, type ChatTrack } from "./chat-provider";

type Seed = Parameters<ReturnType<typeof useSpotify>["startStation"]>[0];

/** What the box offers when the listener is settling what one of their tags means. */
const REFINE_STARTERS = [
  "해외 곡 중에서 슬픈 곡만 넣고 싶어",
  "BTS나 IU 같은 특정 가수의 곡만 넣고 싶어",
];

/** What the box offers before anything has been said. */
const STARTERS = [
  "비 오는 날 들을 잔잔한 한국 노래 추천해줘",
  "새벽 드라이브에 어울리는 신나는 노래",
  "Dagger 같은 슈게이즈 노래 알려줘",
];

/**
 * The agent picks songs by Last.fm's spelling, which has no Spotify id. A card
 * looks the song up once through the search the rest of the app uses, so it can
 * be played and can seed a station.
 */
const lookups = new Map<string, Promise<Seed | null>>();

function lookUp(track: ChatTrack): Promise<Seed | null> {
  const key = `${track.title}|${track.artist}`.toLowerCase();
  const known = lookups.get(key);
  if (known) return known;

  const pending = (async (): Promise<Seed | null> => {
    const q = encodeURIComponent(`${track.title} ${track.artist}`);
    const res = await fetch(`/api/spotify/search?q=${q}&type=track&limit=1`, { cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { tracks?: (Seed & { artwork: string | null })[] };
    const first = data.tracks?.[0];
    return first
      ? { id: first.id, uri: first.uri, name: first.name, artist: first.artist, artwork: first.artwork, durationMs: first.durationMs }
      : null;
  })();
  // a failed lookup is not remembered, so the next card for the same song tries again
  pending.catch(() => lookups.delete(key));
  lookups.set(key, pending);
  return pending;
}

function Pill({
  children,
  onClick,
  dark = false,
  disabled = false,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  dark?: boolean;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`shrink-0 cursor-pointer whitespace-nowrap rounded-pill px-[12px] py-[6px] text-[8px] tracking-[0.6px] transition-colors rule disabled:cursor-default ${
        dark
          ? "bg-ink text-paper-solid enabled:hover:bg-pink-bright"
          : "bg-paper-solid text-on-bright enabled:hover:bg-gold"
      }`}
    >
      {children}
    </button>
  );
}

/** The dark sleeve with a pink disc the lists use for a track with no artwork. */
function Sleeve({ src }: { src: string | null }) {
  if (src) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className="size-[34px] shrink-0 rounded-[4px] object-cover" />;
  }
  return (
    <span className="relative flex size-[34px] shrink-0 items-center justify-center rounded-[4px] bg-ink">
      <span className="size-[18px] rounded-full bg-pink-bright" />
      <span className="absolute size-[5px] rounded-full bg-ink" />
    </span>
  );
}

function TrackCard({ track }: { track: ChatTrack }) {
  const { connected, play, startStation, stationBusy } = useSpotify();
  const hydrated = useHydrated();
  const [seed, setSeed] = useState<Seed | null>(null);
  const [looked, setLooked] = useState(false);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!connected) return;
    let live = true;
    lookUp(track)
      .then((s) => live && (setSeed(s), setLooked(true)))
      .catch(() => live && setLooked(true));
    return () => {
      live = false;
    };
  }, [connected, track]);

  const ready = hydrated && connected && seed !== null;
  // one station at a time: the others look as they did and ignore the press
  const blocked = hydrated && stationBusy !== null && !starting;

  return (
    <li className="flex items-center gap-[8px] rounded-[8px] bg-chart py-[6px] pl-[6px] pr-[8px]">
      <Sleeve src={seed?.artwork ?? null} />
      <button
        type="button"
        disabled={!ready}
        title={
          !hydrated || !connected
            ? "Spotify를 연결하면 재생할 수 있어요"
            : looked && !seed
              ? "Spotify에서 이 곡을 찾지 못했어요"
              : "재생"
        }
        onClick={() => seed && void play({ uris: [seed.uri] })}
        className="flex min-w-0 flex-1 cursor-pointer flex-col gap-px text-left disabled:cursor-default"
      >
        <span className="w-full truncate text-[10px] text-on-bright">{track.title}</span>
        <span className="w-full truncate text-[8px] tracking-[0.5px] text-on-bright-muted">{track.artist}</span>
      </button>
      <button
        type="button"
        disabled={!ready}
        aria-label={`${track.title} 재생`}
        title={
          !hydrated || !connected
            ? "Spotify를 연결하면 재생할 수 있어요"
            : looked && !seed
              ? "Spotify에서 이 곡을 찾지 못했어요"
              : "재생"
        }
        onClick={() => seed && void play({ uris: [seed.uri] })}
        className="flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-pill bg-ink text-paper-solid transition-colors enabled:hover:bg-pink-bright disabled:cursor-default disabled:opacity-40"
      >
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden className="ml-[1px]">
          <path d="M2 1 9 5 2 9Z" fill="currentColor" />
        </svg>
      </button>
      {ready && (
        <button
          type="button"
          disabled={starting}
          title={starting ? "스테이션 구성 중…" : `${track.title} 기준으로 스테이션 시작`}
          aria-disabled={blocked || undefined}
          onClick={async () => {
            if (blocked || !seed) return;
            setStarting(true);
            try {
              await startStation(seed);
            } finally {
              setStarting(false);
            }
          }}
          className={`flex shrink-0 items-center gap-[5px] whitespace-nowrap rounded-pill bg-pink px-[10px] py-[4px] text-[8px] tracking-[0.6px] text-paper-solid transition-colors rule disabled:opacity-100 ${
            blocked ? "cursor-default" : "cursor-pointer enabled:hover:bg-ink"
          }`}
        >
          {starting ? (
            <>
              구성 중
              <LoadingDots size={3} label="스테이션 구성 중" />
            </>
          ) : (
            "STATION"
          )}
        </button>
      )}
    </li>
  );
}

/**
 * The reply without its song list, once the songs are on cards.
 *
 * The agent is told not to list songs in its text, and the small local model
 * does it anyway; saying them twice reads as a mistake. List lines are dropped
 * as they stream in — a half-typed "- Ti" is a list line already.
 */
function withoutList(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*(?:[-•]|\*(?!\*)|\d+[.)])(?:\s+\S|\s*$)/.test(line))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** One line of a preview: a dot for what the new criterion did with the song, then the song. */
function PreviewRow({ track, passed }: { track: ChatTrack; passed: boolean }) {
  return (
    <li className="flex items-center gap-[6px]">
      <span className={`size-[6px] shrink-0 rounded-full ${passed ? "bg-mint" : "bg-alert"}`} />
      <span className="min-w-0 flex-1 truncate text-[9px] text-on-bright">
        {track.title}
        <span className="text-on-bright-muted"> — {track.artist}</span>
      </span>
    </li>
  );
}

/**
 * A new definition for the tag being worked on, and what it does to real songs.
 *
 * The preview is the point: a sentence of English means little to the listener,
 * a list of songs that pass and songs that do not means a great deal. Nothing
 * is changed until 적용.
 */
function ProposalCard({ id, p }: { id: string; p: ChatProposal }) {
  const { refine, applyProposal, dismissProposal } = useChat();
  const { checked, passedCount, passed, failed } = p.preview;
  return (
    <div className="flex flex-col gap-[8px] rounded-[8px] bg-chart p-[10px] ring-[1.5px] ring-pink-bright">
      <p className="text-[8px] tracking-[0.6px] text-on-bright-muted">새 기준</p>
      <p className="break-words text-[10px] leading-[15px] text-on-bright">{p.definition}</p>
      {p.warning && <p className="text-[8px] leading-[12px] text-alert">{p.warning}</p>}

      <div className="flex flex-col gap-[4px]">
        <p className="text-[8px] tracking-[0.6px] text-on-bright-muted">
          미리보기 · 곡 {checked}개 중 {passedCount}개 통과
        </p>
        {passed.length + failed.length > 0 && (
          <ul className="flex flex-col gap-[3px]">
            {passed.slice(0, 4).map((t) => (
              <PreviewRow key={`p|${t.title}|${t.artist}`} track={t} passed />
            ))}
            {failed.slice(0, 3).map((t) => (
              <PreviewRow key={`f|${t.title}|${t.artist}`} track={t} passed={false} />
            ))}
          </ul>
        )}
      </div>

      {p.state === "pending" && (
        <div className="flex gap-[6px]">
          <Pill dark disabled={!refine} onClick={() => applyProposal(id)}>
            적용
          </Pill>
          <Pill onClick={() => dismissProposal(id)}>취소</Pill>
        </div>
      )}
      {p.state === "applied" && (
        <p className="text-[8px] leading-[12px] text-on-bright-muted">
          적용했어요. 다음 재생 목록을 만들 때부터 반영돼요. 지금 목록에 바로 보려면 태그를 껐다 켜 주세요.
        </p>
      )}
      {p.state === "dismissed" && <p className="text-[8px] leading-[12px] text-on-bright-muted">취소했어요.</p>}
    </div>
  );
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex w-full justify-end">
      <p className="max-w-[88%] whitespace-pre-wrap break-words rounded-[14px_14px_4px_14px] bg-ink px-[12px] py-[9px] text-[10px] leading-[15px] text-paper-solid">
        {text}
      </p>
    </div>
  );
}

function AssistantBubble({ m }: { m: Extract<ChatMessage, { role: "assistant" }> }) {
  const { searchWith, busy } = useChat();
  const text = m.tracks.length ? withoutList(m.text) : m.text;
  const waiting = m.streaming && !text && !m.status && !m.proposal && !m.error;
  return (
    <div className="flex w-full justify-start">
      <div className="flex w-full min-w-0 max-w-full flex-col gap-[8px] rounded-[4px_14px_14px_14px] bg-paper-solid p-[10px]">
        {waiting && (
          <p className="flex items-center gap-[6px] text-[8px] tracking-[0.5px] text-on-bright-muted">
            생각하는 중
            <LoadingDots size={3} label="생각하는 중" />
          </p>
        )}
        {text && (
          <p className="whitespace-pre-wrap break-words text-[10px] leading-[15px] text-on-bright">
            {boldSpans(text).map((s, i) =>
              s.bold ? (
                <strong key={i} className="font-black">
                  {s.text}
                </strong>
              ) : (
                <span key={i}>{s.text}</span>
              ),
            )}
          </p>
        )}
        {m.status && (
          <p className="flex items-center gap-[6px] text-[8px] tracking-[0.5px] text-on-bright-muted">
            <span className={`size-[6px] shrink-0 rounded-full bg-mint ${m.streaming ? "animate-pulse" : ""}`} />
            {m.status}
          </p>
        )}
        {m.proposal && <ProposalCard id={m.id} p={m.proposal} />}
        {m.tracks.length > 0 && (
          <ul className="flex flex-col gap-[6px]">
            {m.tracks.map((t) => (
              <TrackCard key={`${t.title}|${t.artist}`} track={t} />
            ))}
          </ul>
        )}
        {m.offer && !m.streaming && (
          <div className="flex flex-col gap-[6px]">
            <p className="text-[8px] tracking-[0.6px] text-on-bright-muted">어디에서 더 찾아볼까요?</p>
            <div className="flex flex-wrap gap-[6px]">
              {m.offer.options.map((key) => {
                const source = CHAT_SOURCES.find((s) => s.key === key);
                return (
                  <Pill key={key} disabled={busy} title={source?.hint} onClick={() => searchWith(m.id, key)}>
                    {source?.label ?? key}에서 찾기
                  </Pill>
                );
              })}
            </div>
          </div>
        )}
        {m.error && <p className="text-[10px] leading-[15px] text-alert">{m.error}</p>}
      </div>
    </div>
  );
}

/**
 * The agent's column: the conversation, and the box to type into.
 *
 * Sits where the station's TAGS panel does, so it takes that panel's grey and
 * its 16px margin rather than introducing a second look for the right-hand side.
 */
export function ChatPanel() {
  const { messages, busy, send, stop, clear, close, refine, openRefine, leaveRefine, shareTaste, toggleTaste } = useChat();
  const liked = useLikedTracks();
  const tags = useCustomTags();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const hydrated = useHydrated();

  // follow the reply as it is written
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const submit = () => {
    const q = draft.trim();
    if (!q || busy) return;
    setDraft("");
    void send(q);
  };

  return (
    <section
      aria-label="챗봇"
      className="flex h-full w-full min-w-0 flex-col gap-[12px] overflow-hidden bg-[#d9d9d9] p-[16px]"
    >
      <div className="flex w-full shrink-0 items-center justify-between gap-[10px]">
        <div className="flex min-w-0 flex-col gap-px">
          <h2 className="text-[19px] font-black tracking-[-0.4px] text-on-bright">CHAT</h2>
          <p className="truncate text-[8px] tracking-[0.7px] text-on-bright-muted">음악 에이전트</p>
        </div>
        <div className="flex shrink-0 items-center gap-[6px]">
          {hydrated && messages.length > 0 && (
            <Pill onClick={clear} title="대화를 지우고 새로 시작">
              NEW
            </Pill>
          )}
          <Pill onClick={close}>CLOSE</Pill>
        </div>
      </div>

      {!refine && (
        <div className="flex w-full shrink-0 flex-wrap items-center gap-[6px]" role="group" aria-label="내 취향">
          <p className="text-[8px] tracking-[0.6px] text-on-bright-muted">내 취향</p>
          {(() => {
            const none = hydrated && liked.length === 0;
            const on = hydrated && shareTaste && !none;
            return (
              <button
                type="button"
                aria-pressed={on}
                aria-disabled={none}
                title={
                  none
                    ? "좋아요한 곡이 없어요"
                    : on
                      ? "좋아요한 곡 공유 끄기"
                      : "최근 좋아요한 곡을 챗봇에게 보여 줘서 내 취향에 맞는 곡을 추천받기"
                }
                onClick={() => {
                  if (!none) toggleTaste();
                }}
                className={`shrink-0 whitespace-nowrap rounded-pill px-[10px] py-[4px] text-[8px] tracking-[0.6px] transition-colors rule ${
                  none
                    ? "cursor-default bg-paper-solid text-on-bright-muted opacity-60"
                    : on
                      ? "cursor-pointer bg-ink text-paper-solid hover:bg-pink-bright"
                      : "cursor-pointer bg-paper-solid text-on-bright-muted hover:bg-gold"
                }`}
              >
                {!hydrated
                  ? "좋아요한 곡 공유"
                  : none
                    ? "좋아요한 곡 없음"
                    : `좋아요한 곡 ${Math.min(liked.length, 30)}곡 · ${on ? "공유 중" : "공유 안 함"}`}
              </button>
            );
          })()}
          {hydrated && (
            <p className="w-full text-[8px] leading-[12px] text-on-bright-muted">
              {shareTaste && liked.length > 0
                ? "챗봇이 최근 좋아요한 곡을 보고 내 취향에 맞는 곡을 골라 줘요."
                : "켜면 최근 좋아요한 곡을 챗봇에게 보여 줘서 내 취향에 맞는 곡을 추천받을 수 있어요."}
            </p>
          )}
        </div>
      )}

      {refine && (
        <div className="flex w-full shrink-0 items-center gap-[8px]">
          <p className="text-[8px] tracking-[0.6px] text-on-bright-muted">대화로 다듬는 태그</p>
          <button
            type="button"
            title="다듬기를 끝내고 곡 추천으로 돌아가기"
            onClick={leaveRefine}
            className="flex min-w-0 cursor-pointer items-center gap-[6px] rounded-pill bg-pink px-[10px] py-[4px] text-[8px] tracking-[0.6px] text-on-bright transition-colors rule hover:bg-gold"
          >
            <span className="truncate">{refine.label}</span>
            <span aria-hidden>×</span>
          </button>
        </div>
      )}

      <div ref={listRef} className="scroll-y scroll-y-ink flex min-h-0 flex-1 flex-col gap-[10px]" aria-live="polite">
        {messages.length === 0 && refine ? (
          <div className="flex flex-col gap-[10px]">
            <p className="text-[10px] leading-[15px] text-on-bright">
              ‘{refine.label}’ 태그에 어떤 곡을 넣고 싶으세요? 말씀해 주시면 기준으로 정리하고, 어떤 곡이 통과하는지
              미리 보여 드려요.
            </p>
            <p className="rounded-[8px] bg-paper-solid px-[10px] py-[8px] text-[9px] leading-[14px] text-on-bright-muted">
              지금 기준 ·{" "}
              {refine.definition === refine.label ? "설명이 없어서 이름만 쓰고 있어요" : refine.definition}
            </p>
            <div className="flex flex-wrap gap-[6px]">
              {REFINE_STARTERS.map((s) => (
                <Pill key={s} onClick={() => void send(s)}>
                  {s}
                </Pill>
              ))}
            </div>
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col gap-[10px]">
            <p className="text-[10px] leading-[15px] text-on-bright-muted">
              듣고 싶은 분위기나 상황을 말해 보세요. 실제로 있는 곡만 골라 드려요.
            </p>
            <div className="flex flex-wrap gap-[6px]">
              {STARTERS.map((s) => (
                <Pill key={s} onClick={() => void send(s)}>
                  {s}
                </Pill>
              ))}
              {hydrated && shareTaste && liked.length > 0 && (
                <Pill onClick={() => void send("내 취향에 맞는 곡 추천해줘")}>내 취향에 맞는 곡 추천해줘</Pill>
              )}
            </div>
            {hydrated && tags.length > 0 && (
              <div className="flex flex-col gap-[6px]">
                <p className="text-[8px] tracking-[0.6px] text-on-bright-muted">내 태그 다듬기</p>
                <div className="flex flex-wrap gap-[6px]">
                  {tags.map((t) => (
                    <Pill key={t.key} onClick={() => openRefine(t.key)} title={`${t.label} 태그의 기준을 대화로 정하기`}>
                      {t.label}
                    </Pill>
                  ))}
                </div>
              </div>
            )}
          </div>
        ) : (
          messages.map((m) => (m.role === "user" ? <UserBubble key={m.id} text={m.text} /> : <AssistantBubble key={m.id} m={m} />))
        )}
      </div>

      <form
        className="flex h-[44px] w-full shrink-0 items-center gap-[8px] rounded-pill bg-paper-solid pl-[16px] pr-[6px] rule"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={refine ? "이 태그에 넣고 싶은 곡을 말해 보세요" : "음악에 대해 물어보세요"}
          aria-label="챗봇에게 물어보기"
          maxLength={2000}
          className="min-w-0 flex-1 bg-transparent text-[11px] text-on-bright outline-none placeholder:text-on-bright-muted"
        />
        {busy ? (
          <Pill dark onClick={stop} title="답변 멈추기">
            STOP
          </Pill>
        ) : (
          <button
            type="submit"
            disabled={!draft.trim()}
            className="shrink-0 cursor-pointer whitespace-nowrap rounded-pill bg-ink px-[12px] py-[8px] text-[8px] tracking-[0.6px] text-paper-solid transition-colors enabled:hover:bg-pink-bright disabled:cursor-default disabled:opacity-60"
          >
            ENTER
          </button>
        )}
      </form>
    </section>
  );
}
