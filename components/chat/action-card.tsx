"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { usePlaybackPosition, useSpotify } from "@/components/player/spotify-provider";
import { clock, playQueued, showsPlayer, type ChatAction } from "./chat-actions";
import { useChat } from "./chat-provider";

/**
 * What the agent did for the listener, drawn in the chat.
 *
 * A heart and a song played happen as they are asked for and leave one line
 * that can be taken back; a station is begun at once and shows how far it is;
 * a playlist waits for a press, because it makes something that stays. Moving
 * the player on, pausing and the like leave nothing here but the agent's words.
 */

const Tile = ({ src, round }: { src: string | null | undefined; round?: boolean }) =>
  src ? (
    <span className={`relative size-[30px] shrink-0 overflow-hidden bg-ink ${round ? "rounded-full" : "rounded-[4px]"}`}>
      <Image src={src} alt="" fill sizes="30px" className="object-cover" unoptimized />
    </span>
  ) : (
    <span className="relative flex size-[30px] shrink-0 items-center justify-center rounded-[4px] bg-artwork">
      <span className="size-[16px] rounded-full bg-accent-bright" />
      <span className="absolute size-[4px] rounded-full bg-ink" />
    </span>
  );

function Button({
  children,
  onClick,
  dark = false,
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  dark?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`shrink-0 cursor-pointer whitespace-nowrap rounded-pill px-[12px] py-[6px] text-[8px] tracking-[0.6px] transition-colors rule disabled:cursor-default disabled:opacity-40 ${
        dark ? "bg-ink text-paper-solid enabled:hover:bg-accent-bright" : "bg-paper-solid text-on-bright enabled:hover:bg-soft"
      }`}
    >
      {children}
    </button>
  );
}

/** A heart or a song played: one line, with the way back at its end. */
function Line({ messageId, a }: { messageId: string; a: ChatAction }) {
  const { actOn, busy } = useChat();
  const track = a.tracks?.[0];
  const liking = a.kind === "like";
  const undone = a.state === "undone";
  const sub =
    a.state === "working"
      ? liking
        ? "좋아요 누르는 중…"
        : "곡을 찾는 중…"
      : a.state === "error"
        ? (a.note ?? "하지 못했어요")
        : a.state === "already"
          ? "이미 좋아요에 있어요"
          : undone
            ? liking
              ? "좋아요를 취소했어요"
              : "일시정지했어요"
            : liking
              ? `${track?.artist ?? a.artist} · 좋아요에 담았어요`
              : `${track?.artist ?? a.artist} · 재생 중`;
  const glyph = liking ? (undone ? "♡" : "♥") : undone ? "❚❚" : "▶";
  const failed = a.state === "error";
  return (
    <li className="flex items-center gap-[8px] rounded-[8px] bg-chart py-[6px] pl-[6px] pr-[8px]">
      <Tile src={track?.artwork} />
      <span className="flex min-w-0 flex-1 flex-col gap-px">
        <span className={`w-full truncate text-[10px] ${undone ? "text-on-bright-muted" : "text-on-bright"}`}>{track?.title ?? a.title}</span>
        <span className={`w-full truncate text-[8px] tracking-[0.5px] ${failed ? "text-alert" : "text-on-bright-muted"}`}>{sub}</span>
      </span>
      {!failed && a.state !== "working" && (
        <span
          aria-hidden
          className={`flex size-[22px] shrink-0 items-center justify-center rounded-full text-[9px] ${undone || a.state === "already" ? "bg-soft text-on-bright-muted" : "bg-accent-bright text-paper-solid"}`}
        >
          {glyph}
        </span>
      )}
      {a.state === "done" && (
        <Button disabled={busy} onClick={() => actOn(messageId, a.id, { type: "undo" })}>
          {liking ? "취소" : "일시정지"}
        </Button>
      )}
      {failed && <Button onClick={() => actOn(messageId, a.id, { type: "retry" })}>다시 시도</Button>}
    </li>
  );
}

/** A station: begun at once, shown while it is built, opened when it is done. */
function Station({ messageId, a }: { messageId: string; a: ChatAction }) {
  const { actOn } = useChat();
  const router = useRouter();
  const track = a.tracks?.[0];
  const title = track?.title ?? (a.title || a.artist);
  return (
    <li className="flex flex-col gap-[8px] rounded-[8px] bg-chart p-[10px]">
      <div className="flex items-center gap-[6px]">
        <span className="text-[8px] tracking-[0.8px] text-accent-bright">STATION</span>
        {a.state === "done" && <span className="rounded-pill bg-ink px-[7px] py-[2px] text-[7px] tracking-[0.5px] text-paper-solid">시작했어요 ✓</span>}
        {a.state === "cancelled" && <span className="rounded-pill bg-soft px-[7px] py-[2px] text-[7px] tracking-[0.5px] text-on-bright-muted">취소했어요</span>}
      </div>
      <div className="flex items-center gap-[8px]">
        <Tile src={track?.artwork} />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="w-full truncate text-[11px] font-black">{title}의 스테이션</span>
          <span className="w-full truncate text-[8px] tracking-[0.5px] text-on-bright-muted">{track?.artist ?? a.artist}</span>
        </span>
      </div>
      {a.state === "working" && (
        <>
          <span aria-hidden className="relative h-[4px] w-full overflow-hidden rounded-pill bg-soft">
            <span className="absolute inset-y-0 w-1/3 animate-pulse rounded-pill bg-accent-bright" />
          </span>
          <p className="text-[8px] leading-[12px] tracking-[0.4px] text-on-bright-muted">비슷한 곡을 찾고 가사를 확인하는 중… 보통 10~20초</p>
          <div className="flex gap-[6px]">
            <Button onClick={() => actOn(messageId, a.id, { type: "cancel" })}>취소</Button>
          </div>
        </>
      )}
      {a.state === "done" && (
        <>
          <p className="text-[9px] leading-[14px]">지금 재생을 스테이션으로 바꿨어요. 대기열은 스테이션 화면에서 볼 수 있어요.</p>
          <div className="flex gap-[6px]">
            <Button dark onClick={() => router.push("/station")}>
              스테이션 열기 →
            </Button>
          </div>
        </>
      )}
      {a.state === "busy" && <p className="text-[9px] leading-[14px] text-on-bright-muted">다른 스테이션을 만드는 중이에요. 끝난 뒤에 다시 말씀해 주세요.</p>}
      {a.state === "error" && (
        <>
          <p className="text-[9px] leading-[14px] text-alert">{a.note ?? "스테이션을 만들지 못했어요"}</p>
          <div className="flex gap-[6px]">
            <Button dark onClick={() => actOn(messageId, a.id, { type: "retry" })}>
              다시 시도
            </Button>
          </div>
        </>
      )}
      {a.state === "cancelled" && (
        <div className="flex gap-[6px]">
          <Button onClick={() => actOn(messageId, a.id, { type: "retry" })}>다시 만들기</Button>
        </div>
      )}
    </li>
  );
}

/** A playlist, made when the listener presses: the name can be changed, the songs are the ones the chat found. */
function Playlist({ messageId, a }: { messageId: string; a: ChatAction }) {
  const { actOn } = useChat();
  const router = useRouter();
  const [name, setName] = useState(a.name ?? "");
  const tracks = a.tracks ?? [];
  const editable = a.state === "pending" || (a.state === "error" && tracks.length > 0);
  const gathering = a.state === "working" && tracks.length === 0;
  return (
    <li className="flex flex-col gap-[8px] rounded-[8px] bg-chart p-[10px]">
      <div className="flex items-center gap-[6px]">
        <span className="text-[8px] tracking-[0.8px] text-accent-bright">PLAYLIST</span>
        {a.state === "done" && <span className="rounded-pill bg-ink px-[7px] py-[2px] text-[7px] tracking-[0.5px] text-paper-solid">만들었어요 ✓</span>}
        {a.state === "cancelled" && <span className="rounded-pill bg-soft px-[7px] py-[2px] text-[7px] tracking-[0.5px] text-on-bright-muted">취소했어요</span>}
      </div>
      <input
        value={editable ? name : (a.name ?? name)}
        disabled={!editable}
        maxLength={60}
        onChange={(e) => setName(e.target.value)}
        aria-label="플레이리스트 이름"
        className={`rounded-pill bg-paper-solid px-[12px] py-[8px] text-[11px] font-bold outline-none disabled:opacity-70 ${a.state === "error" && !tracks.length ? "border-[1.5px] border-alert" : "rule"}`}
      />
      {gathering && <p className="text-[8px] leading-[12px] tracking-[0.4px] text-on-bright-muted">담을 곡을 찾는 중…</p>}
      {tracks.length > 0 && (
        <ul className="flex flex-col gap-[6px]">
          {tracks.slice(0, 3).map((t) => (
            <li key={t.id} className="flex items-center gap-[8px]">
              <Tile src={t.artwork} />
              <span className="flex min-w-0 flex-1 flex-col gap-px">
                <span className="w-full truncate text-[9px] font-bold">{t.title}</span>
                <span className="w-full truncate text-[7px] tracking-[0.4px] text-on-bright-muted">{t.artist}</span>
              </span>
            </li>
          ))}
          <li className="text-[8px] tracking-[0.4px] text-on-bright-muted">
            {tracks.length > 3 ? `외 ${tracks.length - 3}곡 · ` : ""}모두 {tracks.length}곡
          </li>
        </ul>
      )}
      {a.state === "error" && <p className="text-[9px] leading-[14px] text-alert">{a.note ?? "만들지 못했어요"}</p>}
      <div className="flex gap-[6px]">
        {a.state === "pending" && (
          <>
            <Button dark disabled={!name.trim()} onClick={() => actOn(messageId, a.id, { type: "confirm", name })}>
              만들기
            </Button>
            <Button onClick={() => actOn(messageId, a.id, { type: "cancel" })}>취소</Button>
          </>
        )}
        {a.state === "working" && tracks.length > 0 && <Button disabled>만드는 중…</Button>}
        {a.state === "error" && (
          <Button dark onClick={() => (tracks.length ? actOn(messageId, a.id, { type: "confirm", name }) : actOn(messageId, a.id, { type: "retry" }))}>
            다시 시도
          </Button>
        )}
        {a.state === "done" && a.playlistId && (
          <Button dark onClick={() => router.push(`/playlist/${a.playlistId}`)}>
            플레이리스트 열기 →
          </Button>
        )}
        {a.state === "cancelled" && <Button onClick={() => actOn(messageId, a.id, { type: "retry" })}>다시 만들기</Button>}
      </div>
    </li>
  );
}

/** The card an older one becomes once a newer one of its kind has come: what was done, in a line. */
function Record({ glyph, a }: { glyph: string; a: ChatAction }) {
  const failed = a.state === "error";
  return (
    <li className="flex items-center gap-[6px] rounded-[8px] bg-chart px-[10px] py-[7px]">
      <span className="text-[7px] tracking-[0.6px] text-on-bright-muted">{glyph}</span>
      <span className={`min-w-0 flex-1 truncate text-[9px] ${failed ? "text-alert" : "text-on-bright-muted"}`}>
        {failed ? (a.note ?? "하지 못했어요") : (a.summary ?? "")}
      </span>
    </li>
  );
}

const Ico = ({ children, on = false, big = false, label, onClick, disabled }: { children: React.ReactNode; on?: boolean; big?: boolean; label: string; onClick?: () => void; disabled?: boolean }) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    disabled={disabled}
    onClick={onClick}
    className={`flex shrink-0 cursor-pointer items-center justify-center rounded-full text-[10px] font-bold transition-colors disabled:cursor-default disabled:opacity-40 ${
      big ? "size-[30px] bg-accent-bright text-paper-solid enabled:hover:bg-ink" : `size-[22px] ${on ? "bg-[#d4dcff] text-accent-bright" : "text-on-bright enabled:hover:bg-soft"}`
    }`}
  >
    {children}
  </button>
);

/**
 * The bar, made small: the song, the buttons, and where it is. It is live (the
 * buttons work and it follows the player) only while it is the newest of its
 * kind; an older one is a line of what it did, so two cards never disagree
 * about what the player is doing now.
 */
function PlayerCard({ messageId, a, live }: { messageId: string; a: ChatAction; live: boolean }) {
  const { actOn } = useChat();
  const sp = useSpotify();
  const position = usePlaybackPosition();
  if (!live) return <Record glyph="PLAYER" a={a} />;
  const now = sp.now;
  const ratio = now && now.durationMs ? Math.min(1, position / now.durationMs) : 0;
  return (
    <li className="flex flex-col gap-[8px] rounded-[8px] bg-chart p-[10px]">
      <span className="text-[8px] tracking-[0.8px] text-accent-bright">PLAYER</span>
      <div className="flex items-center gap-[8px]">
        <Tile src={now?.artwork ?? a.tracks?.[0]?.artwork} />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="w-full truncate text-[11px] font-black">{now?.title ?? a.tracks?.[0]?.title ?? "재생 중인 곡 없음"}</span>
          <span className="w-full truncate text-[8px] tracking-[0.5px] text-on-bright-muted">{now?.artist ?? a.tracks?.[0]?.artist ?? ""}</span>
        </span>
      </div>
      <div className="flex items-center justify-center gap-[6px]">
        <Ico label={sp.shuffle ? "셔플 끄기" : "셔플 켜기"} on={sp.shuffle} onClick={() => void sp.toggleShuffle()}>
          ⇄
        </Ico>
        <Ico label="이전 곡" onClick={() => void sp.previous()}>
          |◀
        </Ico>
        <Ico big label={sp.isPlaying ? "일시정지" : "재생"} onClick={() => void sp.toggle()}>
          {sp.isPlaying ? "❚❚" : "▶"}
        </Ico>
        <Ico label="다음 곡" onClick={() => void sp.next()}>
          ▶|
        </Ico>
        <Ico label={["반복 없음", "전체 반복", "한 곡 반복"][sp.repeatMode]} on={sp.repeatMode > 0} onClick={() => void sp.cycleRepeat()}>
          {sp.repeatMode === 2 ? "↻1" : "↻"}
        </Ico>
      </div>
      <div className="flex items-center gap-[6px]">
        <span className="tnum w-[28px] text-[8px] text-on-bright-muted">{clock(position)}</span>
        <button
          type="button"
          aria-label="재생 위치"
          disabled={!now}
          onClick={(e) => {
            if (!now) return;
            const box = e.currentTarget.getBoundingClientRect();
            void sp.seek(Math.round(((e.clientX - box.left) / box.width) * now.durationMs));
          }}
          className="relative h-[10px] flex-1 cursor-pointer disabled:cursor-default"
        >
          <span className="absolute inset-x-0 top-[3px] h-[4px] rounded-pill bg-soft" />
          <span className="absolute left-0 top-[3px] h-[4px] rounded-pill bg-accent-bright" style={{ width: `${ratio * 100}%` }} />
        </button>
        <span className="tnum w-[28px] text-right text-[8px] text-on-bright-muted">{now ? clock(now.durationMs) : "0:00"}</span>
      </div>
      {(a.summary || a.state === "error" || a.state === "already") && (
        <div className="flex items-center gap-[8px]">
          <span className={`min-w-0 flex-1 text-[9px] font-bold ${a.state === "error" ? "text-alert" : ""}`}>
            {a.state === "error" ? (a.note ?? "하지 못했어요") : a.state === "already" ? "이미 그 상태예요" : a.summary}
          </span>
          {a.state === "done" && <Button onClick={() => actOn(messageId, a.id, { type: "undo" })}>취소</Button>}
        </div>
      )}
    </li>
  );
}

/** The volume, with a slider that moves the player's own: it is the bar's slider, said in the chat. */
function VolumeCard({ messageId, a, live }: { messageId: string; a: ChatAction; live: boolean }) {
  const { actOn } = useChat();
  const { volume, muted, setVolume, toggleMute } = useSpotify();
  if (!live) return <Record glyph="VOLUME" a={a} />;
  const percent = Math.round(volume * 100);
  return (
    <li className="flex flex-col gap-[8px] rounded-[8px] bg-chart p-[10px]">
      <span className="text-[8px] tracking-[0.8px] text-accent-bright">VOLUME</span>
      <div className="flex items-center gap-[10px]">
        <button
          type="button"
          aria-label={muted ? "음소거 해제" : "음소거"}
          onClick={toggleMute}
          className={`flex size-[26px] shrink-0 cursor-pointer items-center justify-center rounded-full text-[11px] transition-colors ${muted ? "bg-accent-bright text-paper-solid" : "bg-soft text-on-bright"}`}
        >
          {muted ? "✕" : percent === 0 ? "◁" : "◀))"}
        </button>
        <input
          type="range"
          min={0}
          max={100}
          value={muted ? 0 : percent}
          aria-label="음량"
          onChange={(e) => setVolume(Number(e.target.value) / 100)}
          className="h-[4px] min-w-0 flex-1 cursor-pointer accent-accent-bright"
        />
        <span className={`tnum w-[40px] shrink-0 text-right text-[9px] font-bold ${muted ? "text-accent-bright" : ""}`}>{muted ? "음소거" : `${percent}%`}</span>
      </div>
      {a.summary && (
        <div className="flex items-center gap-[8px]">
          <span className="min-w-0 flex-1 text-[9px] font-bold">{a.summary}</span>
          {a.state === "done" && <Button onClick={() => actOn(messageId, a.id, { type: "undo" })}>되돌리기</Button>}
        </div>
      )}
    </li>
  );
}

/** "한 곡만 틀어줘" can mean two things, so the listener says which, and nothing plays until they do. */
function Choice({ messageId, a }: { messageId: string; a: ChatAction }) {
  const { actOn } = useChat();
  const track = a.tracks?.[0];
  const title = track?.title ?? a.title;
  return (
    <li className="flex flex-col gap-[8px] rounded-[8px] bg-chart p-[10px]">
      <div className="flex items-center gap-[6px]">
        <span className="text-[8px] tracking-[0.8px] text-accent-bright">PLAYER</span>
        {a.state === "cancelled" && <span className="rounded-pill bg-soft px-[7px] py-[2px] text-[7px] tracking-[0.5px] text-on-bright-muted">취소했어요</span>}
      </div>
      <div className="flex items-center gap-[8px]">
        <Tile src={track?.artwork} />
        <span className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="w-full truncate text-[11px] font-black">{title}</span>
          <span className="w-full truncate text-[8px] tracking-[0.5px] text-on-bright-muted">{track?.artist ?? a.artist}</span>
        </span>
      </div>
      {a.state === "pending" && (
        <>
          <p className="text-[10px] font-bold">어떻게 들을까요?</p>
          <div className="flex flex-col gap-[6px]">
            <button
              type="button"
              onClick={() => actOn(messageId, a.id, { type: "choose", value: "loop" })}
              className="flex cursor-pointer items-center gap-[10px] rounded-[12px] bg-ink px-[12px] py-[9px] text-left transition-colors hover:bg-accent-bright"
            >
              <span className="text-[12px] font-bold text-paper-solid">↻</span>
              <span className="flex flex-col gap-px">
                <span className="text-[10px] font-bold text-paper-solid">이 곡만 계속</span>
                <span className="text-[8px] text-paper-solid/70">끝나면 처음부터 다시 (한 곡 반복)</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => actOn(messageId, a.id, { type: "choose", value: "once" })}
              className="rule flex cursor-pointer items-center gap-[10px] rounded-[12px] bg-paper-solid px-[12px] py-[9px] text-left transition-colors hover:bg-soft"
            >
              <span className="text-[12px] font-bold">▶</span>
              <span className="flex flex-col gap-px">
                <span className="text-[10px] font-bold">한 번만 듣기</span>
                <span className="text-[8px] text-on-bright-muted">이 곡 하나만 틀고, 끝나면 멈춰요</span>
              </span>
            </button>
          </div>
          <div className="flex gap-[6px]">
            <Button onClick={() => actOn(messageId, a.id, { type: "cancel" })}>취소</Button>
          </div>
        </>
      )}
      {a.state === "working" && <p className="text-[8px] tracking-[0.4px] text-on-bright-muted">재생하는 중…</p>}
      {a.state === "done" && (
        <div className="flex items-center gap-[8px]">
          <span className="min-w-0 flex-1 text-[9px] font-bold">{a.chosen === "loop" ? "↻" : "▶"} {a.summary}</span>
          {a.chosen === "loop" && <Button onClick={() => actOn(messageId, a.id, { type: "undo" })}>반복 끄기</Button>}
        </div>
      )}
      {a.state === "undone" && <p className="text-[9px] font-bold text-on-bright-muted">{a.summary}</p>}
      {a.state === "error" && <p className="text-[9px] leading-[14px] text-alert">{a.note ?? "하지 못했어요"}</p>}
    </li>
  );
}

/** One action of an answer. Some leave no card: moving the player on is a word, not a thing to keep. */
/** What comes next, as UP NEXT lists it: a few rows, each playable, and a count of the rest. */
function Queue({ a, live }: { a: ChatAction; live: boolean }) {
  const sp = useSpotify();
  if (a.state === "error") return <li className="text-[8px] leading-[12px] tracking-[0.4px] text-alert">{a.note ?? "하지 못했어요"}</li>;
  const tracks = a.tracks ?? [];
  if (!live)
    return (
      <li className="flex items-center gap-[6px] rounded-[8px] bg-chart px-[10px] py-[6px] text-[8px] tracking-[0.4px]">
        <span className="text-accent-bright">UP NEXT</span>
        <span className="font-bold text-on-bright-muted">{a.summary}</span>
      </li>
    );
  return (
    <li className="flex flex-col gap-[8px] rounded-[8px] bg-chart p-[10px]">
      <span className="text-[8px] tracking-[0.8px] text-accent-bright">UP NEXT</span>
      <div className="flex flex-col gap-[6px]">
        {tracks.map((t) => (
          <div key={t.uri} className="flex items-center gap-[8px]">
            <Tile src={t.artwork} />
            <span className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="w-full truncate text-[10px] font-black">{t.title}</span>
              <span className="w-full truncate text-[8px] tracking-[0.5px] text-on-bright-muted">{t.artist}</span>
            </span>
            <Button onClick={() => void playQueued(a, t, sp)}>재생</Button>
          </div>
        ))}
      </div>
      {!!a.more && <p className="text-[8px] tracking-[0.4px] text-on-bright-muted">외 {a.more}곡</p>}
    </li>
  );
}

export function ActionCard({ messageId, a, live }: { messageId: string; a: ChatAction; live: boolean }) {
  if (a.kind === "like") return <Line messageId={messageId} a={a} />;
  if (showsPlayer(a)) return <PlayerCard messageId={messageId} a={a} live={live} />;
  if (a.kind === "volume") return <VolumeCard messageId={messageId} a={a} live={live} />;
  if (a.kind === "choice") return <Choice messageId={messageId} a={a} />;
  if (a.kind === "queue") return <Queue a={a} live={live} />;
  if (a.kind === "station") return <Station messageId={messageId} a={a} />;
  if (a.kind === "playlist") return <Playlist messageId={messageId} a={a} />;
  // next, previous: only a refusal is worth a line
  if (a.state === "error") return <li className="text-[8px] leading-[12px] tracking-[0.4px] text-alert">{a.note ?? "하지 못했어요"}</li>;
  return null;
}
