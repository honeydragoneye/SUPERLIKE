"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useHydrated } from "@/components/ui/use-hydrated";
import { useLikedTracks } from "@/components/player/use-likes";
import { useSpotify } from "@/components/player/spotify-provider";
import { useCustomTags } from "@/components/station/use-custom-tags";
import { CUSTOM_LABEL_MAX, MAX_CUSTOM_TAGS, removeCustomTag } from "@/lib/station/custom-tags";
import { boldSpans } from "@/lib/chat/inline";
import { showToast } from "@/components/ui/toast";
import { TrackCard, lookUp, type Found } from "@/components/ui/track-card";
import { forgetItems, react, reactionKey, unreact, useMemoryState, type Reaction } from "@/components/memory/memory-store";
import { ChatHistory, ClockIcon } from "./chat-history";
import { MemoryNotice, MemoryPanel } from "./memory-panel";
import { ActionCard } from "./action-card";
import { showsPlayer } from "./chat-actions";
import { LinkCard } from "./link-card";
import { CHAT_SOURCES, useChat, type ChatMessage, type ChatProposal, type ChatTrack } from "./chat-provider";

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
  "비 오는 날 듣기 좋은 곡만 모으는 태그 만들어줘",
];

/** What the box offers when it was opened to make a tag. */
const TAG_STARTERS = [
  "비 오는 날 듣기 좋은 잔잔한 곡만 모으는 태그 만들어줘",
  "운동할 때 듣는 신나는 팝만 모으는 태그 만들어줘",
  "해외 곡 중에서 슬픈 곡만 모으는 태그 만들어줘",
];

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
      className={`shrink-0 cursor-pointer whitespace-nowrap rounded-pill px-[12px] py-[6px] text-[8px] tracking-[0.6px] transition-colors border-[1.5px] border-transparent disabled:cursor-default ${
        dark
          ? "bg-ink text-on-ink enabled:hover:bg-accent-bright enabled:hover:text-paper-solid"
          : "bg-card text-on-bright enabled:hover:bg-soft"
      }`}
    >
      {children}
    </button>
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
 * Plays the songs the new criterion let through, as the queue.
 *
 * They are named by title and artist only, so each is looked up on Spotify first, a few at a time to stay
 * clear of its rate limit; one that is not found is left out and the listener is told how many.
 */
function PlayPassed({ songs }: { songs: ChatTrack[] }) {
  const { play, connected, stationActive, stopStation } = useSpotify();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const on = hydrated && connected;

  const press = async () => {
    if (busy || !on) return;
    setBusy(true);
    try {
      const found: Found[] = [];
      for (let i = 0; i < songs.length; i += 3) {
        const batch = await Promise.all(songs.slice(i, i + 3).map((t) => lookUp(t).catch(() => null)));
        for (const f of batch) if (f && !found.some((g) => g.uri === f.uri)) found.push(f);
      }
      if (!found.length) return showToast("Spotify에서 이 곡들을 찾지 못했어요");
      const tracks = found.map((f) => ({ uri: f.uri, title: f.name, artist: f.artist, artwork: f.artwork, durationMs: f.durationMs }));
      // a running station keeps the queue for itself and moves on to its own songs when this one ends: it has to stop for this list to be the queue
      if (stationActive) stopStation();
      const outcome = await play({ uris: tracks.map((t) => t.uri), tracks });
      if (outcome !== "played") showToast("재생하지 못했어요. 잠시 후 다시 시도해 주세요.");
      else if (found.length < songs.length) showToast(`${songs.length - found.length}곡은 Spotify에서 찾지 못해 뺐어요`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      disabled={!on || busy}
      title={on ? "통과한 곡을 재생 목록으로 듣기" : "Spotify를 연결하면 들을 수 있어요"}
      onClick={() => void press()}
      className="flex shrink-0 cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-pill border-[1.5px] border-transparent bg-ink px-[10px] py-[4px] text-[8px] tracking-[0.6px] text-on-ink transition-colors enabled:hover:bg-accent-bright enabled:hover:text-paper-solid disabled:cursor-default disabled:opacity-60"
    >
      <svg width="8" height="8" viewBox="0 0 10 10" aria-hidden>
        <path d="M2 1 9 5 2 9Z" fill="currentColor" />
      </svg>
      {busy ? (
        <>
          찾는 중
          {/* the dots wave up from the bottom of their box, so at rest they sit below the text's middle: 1px up centres the wave on it */}
          <span className="inline-flex -translate-y-px">
            <LoadingDots size={3} label="곡을 찾는 중" />
          </span>
        </>
      ) : (
        "통과한 곡 듣기"
      )}
    </button>
  );
}

/**
 * A new definition for the tag being worked on, and what it does to real songs.
 *
 * The preview is the point: a sentence of English means little to the listener,
 * a list of songs that pass and songs that do not means a great deal. Nothing
 * is changed until 적용.
 */
function RefineCard({ id, p }: { id: string; p: ChatProposal }) {
  const { refine, applyProposal, dismissProposal, send, busy } = useChat();
  const { checked, passedCount, passed, failed } = p.preview;
  const fallback = p.preview.sample?.fallback === true;
  return (
    <div className="flex flex-col gap-[8px] rounded-[8px] bg-chart p-[10px]">
      <p className="text-[8px] tracking-[0.6px] text-on-bright-muted">새 기준</p>
      <p className="break-words text-[10px] leading-[15px] text-on-bright">{p.definition}</p>
      {p.warning && <p className="text-[8px] leading-[12px] text-on-bright-muted">{p.warning}</p>}

      <div className="flex flex-col gap-[4px]">
        <div className="flex items-center justify-between gap-[8px]">
          <p className="text-[8px] tracking-[0.6px] text-on-bright-muted">
            미리보기 · 곡 {checked}개 중 {passedCount}개 통과
          </p>
          {passed.length > 0 && <PlayPassed songs={passed} />}
        </div>
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
        {p.state === "pending" && (fallback || passedCount === 0) && (
          <div className="mt-[2px] flex flex-col items-start gap-[6px]">
            <p className="text-[8px] leading-[12px] text-on-bright-muted">
              {fallback
                ? "비슷한 곡을 찾지 못해 인기 차트의 곡으로 확인했어요. 그래서 이 미리보기는 기준과 맞지 않을 수 있어요."
                : "통과한 곡이 없어요. 샘플 곡이 안 맞았거나 기준이 너무 좁을 수 있어요."}
            </p>
            <Pill disabled={busy} onClick={() => void send("같은 기준으로 다른 샘플 곡으로 다시 미리보기 해줘")}>
              다른 곡으로 다시 보기
            </Pill>
          </div>
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

/**
 * A new tag, proposed: its name (which the listener may change), what it means, and what that does to real songs.
 *
 * Nothing is made until 태그 만들기. The name is checked where the tags are kept, so a full list or a name already
 * taken is said here, in words, before anything is lost. A full list can be cleared one tag at a time from the card.
 */
function TagCreateCard({ id, p }: { id: string; p: ChatProposal }) {
  const { createTag, openRefine, dismissProposal, send, busy } = useChat();
  const tags = useCustomTags();
  const { stationActive, stationBusy, stationFilter, setStationFilter } = useSpotify();
  const hydrated = useHydrated();
  const [name, setName] = useState(p.label ?? "");
  const [error, setError] = useState<string | null>(null);
  const used = hydrated ? tags.length : 0;

  if (p.state === "superseded") return <p className="text-[8px] leading-[12px] text-on-bright-muted">새 제안으로 바뀌었어요.</p>;
  if (p.state === "dismissed") return <p className="text-[8px] leading-[12px] text-on-bright-muted">취소했어요.</p>;

  if (p.state === "created") {
    const made = hydrated ? tags.find((t) => t.key === p.tagKey) : undefined;
    const on = made !== undefined && stationFilter.mood === made.key;
    const canUse = made !== undefined && stationActive && stationBusy === null && !on;
    return (
      <div className="flex flex-col gap-[8px] rounded-[8px] bg-chart p-[10px]">
        <p className="text-[8px] tracking-[0.6px] text-on-bright-muted">
          내 태그 · {used}/{MAX_CUSTOM_TAGS}
        </p>
        <span className="w-fit rounded-pill bg-tag-blue px-[14px] py-[7px] text-[9px] text-ink">{p.label}</span>
        <p className="break-words text-[9px] leading-[13px] text-on-bright-muted">{p.definition}</p>
        <p className="text-[9px] leading-[13px] text-on-bright">만들었어요. TAGS에서 켜고 끌 수 있어요.</p>
        <div className="flex gap-[6px]">
          <Pill
            dark
            disabled={!canUse}
            title={stationActive ? "이 태그로 다음 재생 목록을 거르기" : "스테이션을 먼저 시작해 주세요"}
            onClick={() => made && void setStationFilter({ ...stationFilter, mood: made.key })}
          >
            {on ? "스테이션에 쓰는 중" : "스테이션에 쓰기"}
          </Pill>
          <Pill disabled={!made} onClick={() => made && openRefine(made.key)}>
            대화로 다듬기
          </Pill>
        </div>
        <p className="text-[8px] leading-[12px] text-on-bright-muted">
          {stationActive
            ? "누르면 다음 재생 목록부터 이 태그로 걸러져요."
            : "스테이션을 시작하면 쓸 수 있어요. 지금은 TAGS에서 태그만 확인할 수 있어요."}
        </p>
      </div>
    );
  }

  const { checked, passedCount, passed, failed } = p.preview;
  const fallback = p.preview.sample?.fallback === true;
  const flat = name.replace(/\s+/g, " ").trim();
  const full = used >= MAX_CUSTOM_TAGS;
  const taken = hydrated && flat !== "" && tags.some((t) => t.label === flat);
  const why = error ?? (taken ? "같은 이름의 태그가 있어요. 이름을 눌러서 고쳐 주세요." : null);
  const remove = async (key: (typeof tags)[number]["key"]) => {
    // a tag that is on cannot outlive its definition
    if (stationFilter.mood === key) await setStationFilter({ ...stationFilter, mood: null });
    removeCustomTag(key);
  };

  return (
    <div className="flex flex-col gap-[8px] rounded-[8px] bg-chart p-[10px]">
      <p className="text-[8px] tracking-[0.6px] text-on-bright-muted">새 태그</p>
      <label className="flex flex-col gap-[4px]">
        <span className="text-[8px] tracking-[0.6px] text-on-bright-muted">이름 · {CUSTOM_LABEL_MAX}자까지 · 눌러서 고칠 수 있어요</span>
        <span className={`flex items-center justify-between gap-[8px] rounded-[8px] border-[1.5px] bg-card px-[10px] py-[7px] ${why ? "border-alert" : "border-transparent"}`}>
          <input
            value={name}
            maxLength={CUSTOM_LABEL_MAX}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            aria-label="태그 이름"
            className="min-w-0 flex-1 bg-transparent text-[10px] font-bold text-on-bright outline-none"
          />
          <span className="shrink-0 text-[8px] text-on-bright-muted">
            {name.length}/{CUSTOM_LABEL_MAX}
          </span>
        </span>
      </label>
      {why && <p className="text-[8px] leading-[12px] text-alert">{why}</p>}
      <p className="text-[8px] tracking-[0.6px] text-on-bright-muted">기준</p>
      <p className="break-words text-[10px] leading-[14px] text-on-bright">{p.definition}</p>
      {p.warning && <p className="text-[8px] leading-[12px] text-on-bright-muted">{p.warning}</p>}

      <div className="flex flex-col gap-[4px]">
        <div className="flex items-center justify-between gap-[8px]">
          <p className="text-[8px] tracking-[0.6px] text-on-bright-muted">
            미리보기 · 곡 {checked}개 중 {passedCount}개 통과
          </p>
          {passed.length > 0 && <PlayPassed songs={passed} />}
        </div>
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
        {(fallback || passedCount === 0) && (
          <div className="mt-[2px] flex flex-col items-start gap-[6px]">
            <p className="text-[8px] leading-[12px] text-on-bright-muted">
              {fallback
                ? "비슷한 곡을 찾지 못해 인기 차트의 곡으로 확인했어요. 그래서 이 미리보기는 기준과 맞지 않을 수 있어요."
                : "통과한 곡이 없어요. 샘플 곡이 안 맞았거나 기준이 너무 좁을 수 있어요."}
            </p>
            <Pill disabled={busy} onClick={() => void send("같은 기준으로 다른 샘플 곡으로 다시 미리보기 해줘")}>
              다른 곡으로 다시 보기
            </Pill>
          </div>
        )}
      </div>

      {full ? (
        <div className="flex flex-col gap-[6px]">
          <p className="text-[8px] leading-[12px] text-alert">
            내 태그 {used}/{MAX_CUSTOM_TAGS} — 지울 태그를 골라 주세요
          </p>
          <ul className="flex flex-col gap-[4px]">
            {tags.map((t) => (
              <li key={t.key} className="flex items-center justify-between gap-[8px]">
                <span className="min-w-0 truncate rounded-pill bg-tag-blue px-[14px] py-[7px] text-[9px] text-ink">{t.label}</span>
                <Pill onClick={() => void remove(t.key)}>지우기</Pill>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[8px] tracking-[0.6px] text-on-bright-muted">
          내 태그 {used}/{MAX_CUSTOM_TAGS} → 만들면 {used + 1}/{MAX_CUSTOM_TAGS}
        </p>
      )}
      <div className="flex gap-[6px]">
        <Pill dark disabled={full || taken || flat === ""} onClick={() => setError(createTag(id, name))}>
          {passedCount === 0 ? "그래도 만들기" : "태그 만들기"}
        </Pill>
        <Pill onClick={() => dismissProposal(id)}>취소</Pill>
      </div>
      <p className="text-[8px] leading-[12px] text-on-bright-muted">
        마음에 안 들면 고치고 싶은 점을 아래에 말해 주세요. 새 카드가 뜨면 이 카드는 ‘대체됨’으로 바뀌어요.
      </p>
    </div>
  );
}

function ProposalCard({ id, p }: { id: string; p: ChatProposal }) {
  return p.kind === "create" ? <TagCreateCard id={id} p={p} /> : <RefineCard id={id} p={p} />;
}

function UserBubble({ text }: { text: string }) {
  return (
    <div className="flex w-full justify-end">
      <p className="max-w-[88%] whitespace-pre-wrap break-words rounded-[14px_14px_4px_14px] bg-ink px-[12px] py-[9px] text-[10px] leading-[15px] text-on-ink">
        {text}
      </p>
    </div>
  );
}

/** Opens the memory screen from inside an answer ("기억 3가지를 참고했어요 · 보기"). */
const OpenMemory = createContext<() => void>(() => undefined);

/** What the memory just learned from this exchange, with the way to take it back. */
function MemoryNote({ ids, texts }: { ids: string[]; texts: string[] }) {
  const [undone, setUndone] = useState(false);
  if (undone) return null;
  return (
    <p className="flex w-fit max-w-full flex-wrap items-center gap-[6px] rounded-[10px] bg-chart px-[10px] py-[5px] text-[8px] leading-[12px] tracking-[0.3px] text-on-bright-muted">
      <span>기억했어요 · {texts.join(" · ")}</span>
      <button
        type="button"
        onClick={() => {
          setUndone(true);
          void forgetItems(ids);
        }}
        className="cursor-pointer underline hover:text-on-bright"
      >
        되돌리기
      </button>
    </p>
  );
}

/** "이번 추천 어땠어요?": one answer about every song of a reply, for the listener who does not want to press each card. */
function AnswerFeedback({ tracks }: { tracks: ChatTrack[] }) {
  const [said, setSaid] = useState<Reaction | null>(null);
  if (said) {
    return (
      <p className="flex items-center gap-[8px] text-[8px] leading-[12px] text-on-bright-muted">
        고마워요, 다음 추천에 반영할게요
        <button
          type="button"
          onClick={() => {
            setSaid(null);
            void unreact(tracks);
          }}
          className="cursor-pointer underline hover:text-on-bright"
        >
          되돌리기
        </button>
      </p>
    );
  }
  return (
    <div className="flex flex-col gap-[6px]">
      <p className="text-[8px] tracking-[0.6px] text-on-bright-muted">이번 추천 어땠어요?</p>
      <div className="flex flex-wrap gap-[6px]">
        {(
          [
            ["up", "마음에 들어요"],
            ["down", "별로예요"],
            ["known", "이미 알아요"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setSaid(value);
              void react(tracks, value);
            }}
            className="shrink-0 cursor-pointer whitespace-nowrap rounded-pill border-[1.5px] border-transparent bg-chart px-[12px] py-[6px] text-[8px] tracking-[0.6px] text-on-bright transition-colors hover:bg-soft"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function AssistantBubble({ m }: { m: Extract<ChatMessage, { role: "assistant" }> }) {
  const openMemory = useContext(OpenMemory);
  const memory = useMemoryState();
  const reactable = memory.status === "ok" && memory.enabled;
  const onReact = (t: ChatTrack, value: Reaction | null) => {
    if (!value) {
      void unreact([t]);
      return;
    }
    void react([t], value);
    if (value === "down") showToast(`‘${t.artist}’ 같은 곡은 덜 추천할게요`, { label: "되돌리기", run: () => void unreact([t]) });
  };
  const { searchWith, retry, busy, messages } = useChat();
  // of the player cards, and of the volume cards, only the newest in the conversation is live
  const live = new Set<string>();
  for (const kind of ["player", "volume", "queue"] as const) {
    for (let i = messages.length - 1; i >= 0; i--) {
      const row = messages[i];
      const hit = row.role === "assistant" ? [...row.actions].reverse().find((x) => (kind === "volume" ? x.kind === "volume" : kind === "queue" ? x.kind === "queue" : showsPlayer(x))) : undefined;
      if (hit) {
        live.add(hit.id);
        break;
      }
    }
  }
  // "옮길게요" above a card that says it could not is a contradiction: the card speaks alone
  const failed = !m.streaming && m.actions.length > 0 && m.actions.every((x) => x.state === "error");
  const text = failed ? "" : m.tracks.length ? withoutList(m.text) : m.text;
  const waiting = m.streaming && !text && !m.status && !m.proposal && !m.actions.length && !m.error;
  return (
    <div className="flex w-full justify-start">
      <div className="flex w-full min-w-0 max-w-full flex-col gap-[8px] rounded-[4px_14px_14px_14px] bg-card p-[10px]">
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
        {m.memoryNote && <MemoryNote ids={m.memoryNote.ids} texts={m.memoryNote.texts} />}
        {m.proposal && <ProposalCard id={m.id} p={m.proposal} />}
        {m.actions.length > 0 && (
          <ul className="flex flex-col gap-[6px]">
            {m.actions.map((a) => (
              <ActionCard key={a.id} messageId={m.id} a={a} live={live.has(a.id)} />
            ))}
          </ul>
        )}
        {m.tracks.length > 0 && (
          <ul className="flex flex-col gap-[6px]">
            {m.tracks.map((t, i) => (
              <TrackCard
                key={`${t.title}|${t.artist}`}
                track={t}
                eager={i < 3}
                reaction={reactable ? { value: memory.reactions[reactionKey(t)] ?? null, onChange: (v) => onReact(t, v) } : undefined}
              />
            ))}
          </ul>
        )}
        {reactable && !m.streaming && m.tracks.length > 0 && <AnswerFeedback tracks={m.tracks} />}
        {m.links.length > 0 && (
          <ul className="flex flex-col gap-[6px]">
            {m.links.map((l) => (
              <LinkCard key={`${l.kind}|${l.name}`} link={l} />
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
        {m.error && (
          <div className="flex flex-col items-start gap-[6px]">
            <p className="text-[10px] leading-[15px] text-alert">{m.error}</p>
            {!m.streaming && (
              <Pill disabled={busy} title="같은 질문을 다시 보냅니다" onClick={() => retry(m.id)}>
                다시 시도
              </Pill>
            )}
          </div>
        )}
        {!m.streaming && !!m.memoryUsed && (
          <p className="flex items-center gap-[6px] text-[8px] leading-[12px] text-on-bright-muted">
            기억 {m.memoryUsed}가지를 참고했어요
            <button type="button" onClick={openMemory} className="cursor-pointer underline hover:text-on-bright">
              보기
            </button>
          </p>
        )}
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
  const { messages, busy, send, stop, clear, close, refine, openRefine, leaveRefine, creating, shareTaste, toggleTaste, shareHistory, toggleHistory } = useChat();
  const { connected: session } = useSpotify();
  const liked = useLikedTracks();
  const tags = useCustomTags();
  const [draft, setDraft] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const hydrated = useHydrated();
  const memory = useMemoryState();

  /** The memory screen, closed by Escape or a press outside it like the saved-conversations list below. */
  const [memoryOpen, setMemoryOpen] = useState(false);
  const memoryRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!memoryOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (memoryRef.current?.contains(target) || target.closest?.("[data-memory-toggle]") || target.closest?.("[data-memory-open]")) return;
      setMemoryOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setMemoryOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [memoryOpen]);

  /** Escape or a press outside closes the saved-conversations list; its own button handles its press. */
  const [historyOpen, setHistoryOpen] = useState(false);
  const historyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!historyOpen) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (historyRef.current?.contains(target) || target.closest?.("[data-history-toggle]")) return;
      setHistoryOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setHistoryOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [historyOpen]);

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
    <OpenMemory.Provider
      value={() => {
        setHistoryOpen(false);
        setMemoryOpen(true);
      }}
    >
    <section
      aria-label="챗봇"
      className="relative flex h-full w-full min-w-0 flex-col gap-[12px] overflow-hidden bg-well p-[16px]"
    >
      <div className="flex w-full shrink-0 items-center justify-between gap-[10px]">
        <div className="flex min-w-0 flex-col gap-px">
          <h2 className="text-[19px] font-black tracking-[-0.4px] text-on-bright">CHAT</h2>
          <p className="truncate text-[8px] tracking-[0.7px] text-on-bright-muted">음악 에이전트</p>
        </div>
        <div className="flex shrink-0 items-center gap-[6px]">
          {/* saved to the account, so only for a listener who is connected; a tag conversation is not kept */}
          {hydrated && session && !refine && (
            <button
              type="button"
              data-history-toggle
              aria-label="대화 이력"
              aria-expanded={historyOpen}
              title="대화 이력"
              onClick={() => {
                setHistoryOpen((v) => !v);
                setMemoryOpen(false);
              }}
              className={`flex size-[25px] shrink-0 cursor-pointer items-center justify-center rounded-pill transition-colors border-[1.5px] border-transparent ${
                historyOpen ? "bg-ink text-on-ink" : "bg-card text-on-bright hover:bg-soft"
              }`}
            >
              <ClockIcon />
            </button>
          )}
          {hydrated && session && !refine && memory.status === "ok" && (
            <button
              type="button"
              data-memory-toggle
              aria-expanded={memoryOpen}
              title={memory.enabled ? "챗봇이 기억하는 것 보기 (켜짐)" : "기억이 꺼져 있어요"}
              onClick={() => {
                setMemoryOpen((v) => !v);
                setHistoryOpen(false);
              }}
              className={`flex shrink-0 cursor-pointer items-center gap-[5px] whitespace-nowrap rounded-pill border-[1.5px] border-transparent px-[12px] py-[6px] text-[8px] tracking-[0.6px] transition-colors ${
                memoryOpen ? "bg-ink text-on-ink" : "bg-card text-on-bright hover:bg-soft"
              }`}
            >
              <span aria-hidden className={`size-[6px] rounded-full ${memory.enabled ? "bg-live" : "bg-current opacity-30"}`} />
              기억
            </button>
          )}
          {hydrated && messages.length > 0 && (
            <Pill onClick={clear} title="대화를 지우고 새로 시작">
              NEW
            </Pill>
          )}
          <Pill onClick={close}>CLOSE</Pill>
        </div>
      </div>

      {historyOpen && hydrated && session && !refine && (
        <ChatHistory onClose={() => setHistoryOpen(false)} popoverRef={historyRef} />
      )}
      {memoryOpen && hydrated && session && !refine && memory.status === "ok" && (
        <MemoryPanel onClose={() => setMemoryOpen(false)} popoverRef={memoryRef} />
      )}
      {hydrated && session && !refine && memory.status === "ok" && memory.enabled && !memory.noticeSeen && (
        <div data-memory-open>
          <MemoryNotice onOpen={() => setMemoryOpen(true)} />
        </div>
      )}

      {!refine && (
        <div className="flex w-full shrink-0 flex-wrap items-center gap-[6px]" role="group" aria-label="내 취향">
          <p className="text-[8px] tracking-[0.6px] text-on-bright-muted">내 취향</p>
          {(() => {
            const noLikes = hydrated && liked.length === 0;
            const likesOn = hydrated && shareTaste && !noLikes;
            const noHistory = hydrated && !session;
            const historyOn = hydrated && shareHistory && !noHistory;
            const pill = (on: boolean, none: boolean) =>
              `shrink-0 whitespace-nowrap rounded-pill px-[10px] py-[4px] text-[8px] tracking-[0.6px] transition-colors border-[1.5px] border-transparent ${
                none
                  ? "cursor-default bg-card text-on-bright-muted opacity-60"
                  : on
                    ? "cursor-pointer bg-ink text-on-ink hover:bg-accent-bright hover:text-paper-solid"
                    : "cursor-pointer bg-card text-on-bright-muted hover:bg-soft"
              }`;
            return (
              <>
                <button
                  type="button"
                  aria-pressed={likesOn}
                  aria-disabled={noLikes}
                  title={
                    noLikes
                      ? "좋아요한 곡이 없어요"
                      : likesOn
                        ? "좋아요한 곡 공유 끄기"
                        : "최근 좋아요한 곡을 챗봇에게 보여 줘서 내 취향에 맞는 곡을 추천받기"
                  }
                  onClick={() => {
                    if (!noLikes) toggleTaste();
                  }}
                  className={pill(likesOn, noLikes)}
                >
                  {!hydrated
                    ? "좋아요한 곡 공유"
                    : noLikes
                      ? "좋아요한 곡 없음"
                      : `좋아요 ${Math.min(liked.length, 30)}곡 · ${likesOn ? "공유 중" : "공유 안 함"}`}
                </button>
                <button
                  type="button"
                  aria-pressed={historyOn}
                  aria-disabled={noHistory}
                  title={
                    noHistory
                      ? "Spotify를 연결하면 쓸 수 있어요"
                      : historyOn
                        ? "재생 기록 공유 끄기"
                        : "최근 4주 동안 많이 들은 곡을 챗봇에게 보여 줘서 내 취향에 맞는 곡을 추천받기"
                  }
                  onClick={() => {
                    if (!noHistory) toggleHistory();
                  }}
                  className={pill(historyOn, noHistory)}
                >
                  {!hydrated ? "재생 기록 공유" : `재생 기록 4주 · ${historyOn ? "공유 중" : "공유 안 함"}`}
                </button>
              </>
            );
          })()}
          {hydrated && (
            <p className="w-full text-[8px] leading-[12px] text-on-bright-muted">
              {(shareTaste && liked.length > 0) || (shareHistory && session)
                ? "공유한 곡을 보고 내 취향에 맞는 곡을 골라 줘요. 곡 정보가 모델(Gemini)로 전달돼요."
                : "켜면 좋아요한 곡이나 최근 4주 동안 많이 들은 곡을 챗봇에게 보여 줘서 내 취향에 맞는 곡을 추천받을 수 있어요. 곡 정보가 모델(Gemini)로 전달되므로 기본은 꺼져 있어요."}
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
            className="flex min-w-0 cursor-pointer items-center gap-[6px] rounded-pill bg-accent px-[10px] py-[4px] text-[8px] tracking-[0.6px] text-on-bright transition-colors rule hover:bg-soft"
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
            <p className="rounded-[8px] bg-card px-[10px] py-[8px] text-[9px] leading-[14px] text-on-bright-muted">
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
              {creating
                ? "어떤 곡을 모으는 태그를 만들고 싶은지 말해 보세요. 이름과 기준은 제가 정리해 드려요."
                : "듣고 싶은 분위기나 상황을 말해 보세요. 실제로 있는 곡만 골라 드려요."}
            </p>
            <div className="flex flex-wrap gap-[6px]">
              {(creating ? TAG_STARTERS : STARTERS).map((s) => (
                <Pill key={s} onClick={() => void send(s)}>
                  {s}
                </Pill>
              ))}
              {!creating && hydrated && ((shareTaste && liked.length > 0) || (shareHistory && session)) && (
                <Pill onClick={() => void send("내 취향에 맞는 곡 추천해줘")}>내 취향에 맞는 곡 추천해줘</Pill>
              )}
            </div>
            {!creating && hydrated && tags.length > 0 && (
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
        className="flex h-[44px] w-full shrink-0 items-center gap-[8px] rounded-pill bg-card pl-[16px] pr-[6px] rule"
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
            className="shrink-0 cursor-pointer whitespace-nowrap rounded-pill bg-ink px-[12px] py-[8px] text-[8px] tracking-[0.6px] text-on-ink transition-colors enabled:hover:bg-accent-bright enabled:hover:text-paper-solid disabled:cursor-default disabled:opacity-60"
          >
            ENTER
          </button>
        )}
      </form>
    </section>
    </OpenMemory.Provider>
  );
}
