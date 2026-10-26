"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ChatAction } from "./chat-actions";
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

/** One action of an answer. Some leave no card: moving the player on and pausing are words, not things to keep. */
export function ActionCard({ messageId, a }: { messageId: string; a: ChatAction }) {
  if (a.kind === "like" || (a.kind === "playback" && a.command === "play")) return <Line messageId={messageId} a={a} />;
  if (a.kind === "station") return <Station messageId={messageId} a={a} />;
  if (a.kind === "playlist") return <Playlist messageId={messageId} a={a} />;
  // next, previous, pause, resume: only a refusal or an already-so is worth a line
  if (a.state === "error" || a.state === "already") {
    return (
      <li className={`text-[8px] leading-[12px] tracking-[0.4px] ${a.state === "error" ? "text-alert" : "text-on-bright-muted"}`}>
        {a.state === "error" ? (a.note ?? "하지 못했어요") : a.command === "pause" ? "이미 일시정지 상태예요" : "이미 재생 중이에요"}
      </li>
    );
  }
  return null;
}
