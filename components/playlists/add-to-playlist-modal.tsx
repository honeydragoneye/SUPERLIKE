"use client";

import Image from "next/image";
import type { Palette } from "@/lib/palette";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  addToPlaylist,
  createPlaylist,
  listPlaylists,
  playlistErrorText,
  removeFromPlaylist,
  type PlaylistSummary,
  type PlaylistTrack,
} from "@/lib/playlists";

/**
 * A playlist's cover: the colours of its first song's album, painted the way the
 * Editor's Pick block is — the album's colour fading to a darker corner, with a
 * record resting over the top right. An empty playlist is a plain tile with the
 * outline of a record, until a song gives it colour.
 *
 * Everything is measured from `size`, so the one drawing serves the 150px card
 * and the 40px row.
 */
export function PlaylistCover({
  palette,
  size,
  tone = "bg-white/15",
}: {
  palette: Palette | null;
  size: number;
  /** the tile behind an empty playlist, so it reads on a dark or a light surface */
  tone?: string;
}) {
  if (!palette) {
    return (
      <span
        className={`relative block shrink-0 overflow-hidden rounded-[2px] ${tone}`}
        style={{ width: size, height: size }}
        aria-hidden
      >
        <span
          className="absolute rounded-full border-current opacity-35"
          style={{ inset: size * 0.25, borderWidth: Math.max(1, size / 75) }}
        />
        <span
          className="absolute rounded-full bg-current opacity-35"
          style={{ inset: size * 0.45 }}
        />
      </span>
    );
  }

  const disc = size * 0.78;
  const ring = (k: number) => ({
    inset: (disc - disc * k) / 2,
    boxShadow: `inset 0 0 0 ${Math.max(0.6, size / 150)}px rgba(0,0,0,0.14)`,
  });
  return (
    <span
      className="relative block shrink-0 overflow-hidden rounded-[2px]"
      style={{ width: size, height: size, backgroundColor: palette.bg }}
      aria-hidden
    >
      <span
        className="absolute inset-0"
        style={{ background: `linear-gradient(150deg, transparent 30%, ${palette.bgDeep} 100%)` }}
      />
      <span
        className="absolute rounded-full"
        style={{ width: disc, height: disc, left: size * 0.34, top: -size * 0.2, backgroundColor: palette.disc }}
      >
        <span className="absolute rounded-full" style={ring(0.8)} />
        <span className="absolute rounded-full" style={ring(0.58)} />
        <span className="absolute rounded-full bg-accent-bright/90" style={{ inset: disc * 0.39 }} />
        <span className="absolute rounded-full bg-black" style={{ inset: disc * 0.475 }} />
      </span>
    </span>
  );
}

type Toast = { text: string; undo?: () => void };

/**
 * "Which playlist should this song go in?", over everything else.
 *
 * Opened from the + beside 가사 and from the ··· menu, for the track playing.
 * A row that already holds the song reads 담김 and takes it back out when
 * pressed, so the same button both adds and undoes. A playlist made from here
 * starts with the song in it.
 *
 * Rendered into <body> so no column's overflow can clip it.
 */
export function AddToPlaylistModal({ track, onClose }: { track: PlaylistTrack; onClose: () => void }) {
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = () =>
    listPlaylists(track.id).then(
      (list) => {
        setPlaylists(list);
        setError(null);
      },
      (e) => setError(playlistErrorText(e)),
    );

  useEffect(() => {
    void load();
    return () => clearTimeout(toastTimer.current);
    // loaded once per opening; `track` is the song the modal was opened for
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [track.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const say = (next: Toast) => {
    clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = setTimeout(() => setToast(null), 5000);
  };

  const toggle = async (p: PlaylistSummary) => {
    if (busy) return;
    setBusy(p.id);
    try {
      if (p.has) {
        await removeFromPlaylist(p.id, track.id);
        say({ text: `‘${p.name}’에서 뺐어요` });
      } else {
        await addToPlaylist(p.id, track);
        say({
          text: `‘${p.name}’에 담았어요`,
          undo: () => {
            void removeFromPlaylist(p.id, track.id).then(load, (e) => setError(playlistErrorText(e)));
            setToast(null);
          },
        });
      }
      await load();
    } catch (e) {
      setError(playlistErrorText(e));
    } finally {
      setBusy(null);
    }
  };

  const make = async () => {
    const title = name.trim();
    if (!title || busy) return;
    setBusy("new");
    try {
      await createPlaylist(title, isPublic, track);
      say({ text: `‘${title}’을 만들고 담았어요` });
      setCreating(false);
      setName("");
      await load();
    } catch (e) {
      setError(playlistErrorText(e));
    } finally {
      setBusy(null);
    }
  };

  const song = (
    <div className="flex items-center gap-[12px]">
      <span className="relative size-[40px] shrink-0 overflow-hidden rounded-[2px] bg-artwork">
        {track.artwork && (
          <Image src={track.artwork} alt="" fill sizes="40px" className="object-cover" unoptimized />
        )}
      </span>
      <span className="flex min-w-0 flex-col gap-px">
        <span className="truncate text-[13px]">{track.title}</span>
        <span className="truncate text-[9px] text-on-dark-muted">{track.artist}</span>
      </span>
    </div>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-[16px] pt-[12vh]"
      onPointerDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={creating ? "새 플레이리스트" : "플레이리스트에 담기"}
        className="flex max-h-[76vh] w-[440px] max-w-full flex-col gap-[16px] rounded-[10px] bg-[#1f1f1f] p-[24px] text-on-dark shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
      >
        <div className="flex shrink-0 items-center justify-between border-b border-on-dark/25 pb-[14px]">
          <h2 className="text-[17px] font-black">{creating ? "새 플레이리스트" : "플레이리스트에 담기"}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="닫기"
            className="cursor-pointer text-[13px] text-on-dark-muted transition-colors hover:text-on-dark"
          >
            ✕
          </button>
        </div>

        {creating ? (
          <form
            className="flex flex-col gap-[14px]"
            onSubmit={(e) => {
              e.preventDefault();
              void make();
            }}
          >
            <label className="flex flex-col gap-[6px] text-[10px] text-on-dark-muted">
              제목 *
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={60}
                placeholder="예: 밤에 듣는 노래"
                className="rounded-[6px] border-[1.5px] border-accent-bright bg-[#2e2e2e] px-[14px] py-[12px] text-[13px] text-on-dark outline-none placeholder:text-on-dark-muted"
              />
            </label>
            <fieldset className="flex flex-col gap-[8px]">
              <legend className="mb-[6px] text-[10px] text-on-dark-muted">공개 범위</legend>
              <div className="flex gap-[18px] text-[12px]">
                {[
                  [false, "비공개"],
                  [true, "공개"],
                ].map(([value, label]) => (
                  <label key={String(label)} className="flex cursor-pointer items-center gap-[8px]">
                    <input
                      type="radio"
                      name="privacy"
                      checked={isPublic === value}
                      onChange={() => setIsPublic(value as boolean)}
                      className="size-[14px] accent-[#3d5afe]"
                    />
                    {label as string}
                  </label>
                ))}
              </div>
              <p className="text-[9px] leading-[14px] text-on-dark-muted">
                비공개는 나만 볼 수 있어요. 공개 설정은 저장해 두고, 다른 사람에게 보여 주는 기능이 생기면 적용돼요.
              </p>
            </fieldset>
            <div className="flex flex-col gap-[4px] rounded-[8px] bg-white/[0.06] p-[12px]">
              {song}
              <p className="text-[9px] text-accent-bright">만들면서 이 곡이 첫 곡으로 담겨요</p>
            </div>
            {error && <p className="text-[10px] text-accent-bright">{error}</p>}
            <div className="flex justify-end gap-[10px]">
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setError(null);
                }}
                className="cursor-pointer rounded-pill border border-on-dark/50 px-[14px] py-[7px] text-[11px]"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={!name.trim() || busy !== null}
                className="cursor-pointer rounded-pill bg-accent-bright px-[14px] py-[7px] text-[11px] text-black disabled:opacity-40"
              >
                만들고 담기
              </button>
            </div>
          </form>
        ) : (
          <>
            <div className="shrink-0 rounded-[8px] bg-white/[0.06] p-[12px]">{song}</div>

            <button
              type="button"
              onClick={() => {
                setCreating(true);
                setError(null);
              }}
              className="flex shrink-0 cursor-pointer items-center gap-[12px] text-left"
            >
              <span className="flex size-[40px] shrink-0 items-center justify-center rounded-pill bg-accent text-[20px] text-black">
                +
              </span>
              <span className="flex flex-col gap-px">
                <span className="text-[13px]">새 플레이리스트 만들기</span>
                <span className="text-[9px] text-on-dark-muted">이 곡을 첫 곡으로 담아요</span>
              </span>
            </button>

            <p className="shrink-0 text-[9px] text-on-dark-muted">내 플레이리스트</p>
            {error && <p className="shrink-0 text-[10px] text-accent-bright">{error}</p>}
            <ul className="scroll-y -mt-[6px] flex min-h-0 flex-col overflow-y-auto">
              {playlists?.length === 0 && (
                <li className="py-[8px] text-[10px] text-on-dark-muted">아직 만든 플레이리스트가 없어요.</li>
              )}
              {playlists === null && !error && (
                <li className="py-[8px] text-[10px] text-on-dark-muted">불러오는 중…</li>
              )}
              {playlists?.map((p) => (
                <li key={p.id} className="flex items-center gap-[12px] py-[5px]">
                  <PlaylistCover palette={p.palette} size={40} />
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[13px]">{p.name}</span>
                    <span className="text-[9px] text-on-dark-muted">
                      {p.count}곡 · {p.isPublic ? "공개" : "비공개"}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={() => void toggle(p)}
                    disabled={busy !== null}
                    aria-pressed={p.has}
                    className={`shrink-0 cursor-pointer rounded-pill px-[14px] py-[7px] text-[10px] transition-opacity disabled:opacity-50 ${
                      p.has ? "border border-on-dark/35 text-on-dark/75" : "bg-paper-solid text-black"
                    }`}
                  >
                    {p.has ? "✓ 담김" : "담기"}
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      {toast && (
        <div
          role="status"
          className="fixed bottom-[96px] left-1/2 flex -translate-x-1/2 items-center gap-[14px] rounded-pill bg-paper-solid py-[11px] pl-[20px] pr-[16px] text-[11px] text-black shadow-[0_6px_18px_rgba(0,0,0,0.3)]"
        >
          {toast.text}
          {toast.undo && (
            <button type="button" onClick={toast.undo} className="cursor-pointer text-accent-bright">
              실행 취소
            </button>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}
