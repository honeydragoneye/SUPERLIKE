"use client";

import { useCallback, useEffect, useState } from "react";
import { useSpotify } from "@/components/player/spotify-provider";
import { PlaylistCover } from "@/components/playlists/add-to-playlist-modal";
import { useHydrated } from "@/components/ui/use-hydrated";
import {
  createPlaylist,
  listPlaylists,
  onPlaylistsChanged,
  playlistErrorText,
  removePlaylist,
  renamePlaylist,
  type PlaylistSummary,
} from "@/lib/playlists";
import { playedAgo } from "@/lib/time";
import { SectionHead } from "./section-head";

/** What one account may keep (lib/db/playlists MAX_PLAYLISTS), shown beside the count. */
const LIMIT = 50;

/** A text-only action: no outline, blue under the cursor. */
const ACTION =
  "shrink-0 cursor-pointer whitespace-nowrap px-[8px] py-[6px] text-[8px] tracking-[0.7px] transition-colors hover:text-accent-bright";

/**
 * 플레이리스트: the playlists this account keeps in Superlike, one per line,
 * with what can be done to each — open (in the panel on the right), rename,
 * switch between 공개 and 비공개, delete.
 */
export function PlaylistManager({
  openId,
  onOpen,
}: {
  /** the playlist shown in the right-hand panel */
  openId: string | null;
  onOpen: (id: string | null) => void;
}) {
  const { connected: session } = useSpotify();
  /** browser-only knowledge, held back until hydration is done (see PlaylistShelf) */
  const connected = useHydrated() && session;
  const [playlists, setPlaylists] = useState<PlaylistSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(
    () =>
      listPlaylists().then(
        (list) => {
          setPlaylists(list);
          setError(null);
        },
        (e) => setError(playlistErrorText(e)),
      ),
    [],
  );

  useEffect(() => {
    if (!connected) return;
    void load();
    return onPlaylistsChanged(() => void load());
  }, [connected, load]);

  const make = async () => {
    const title = name.trim();
    if (!title || busy) return;
    setBusy(true);
    try {
      const id = await createPlaylist(title, false);
      setName("");
      setNaming(false);
      onOpen(id);
    } catch (e) {
      setError(playlistErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const mine = connected ? playlists : null;

  return (
    <section className="flex w-full shrink-0 flex-col gap-[16px] bg-chart px-[24px] pb-[24px] pt-[20px]">
      <SectionHead title="플레이리스트" hint="Superlike에 만든 플레이리스트 · 재생은 Spotify로 합니다">
        {connected && (
          <>
            <span className="tnum text-[9px] tracking-[0.8px] text-on-bright-muted">
              {mine?.length ?? 0} / {LIMIT}
            </span>
            <button
              type="button"
              onClick={() => setNaming(true)}
              className="cursor-pointer whitespace-nowrap rounded-pill bg-ink px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-on-ink transition-colors hover:bg-accent-bright hover:text-paper-solid"
            >
              새 플레이리스트
            </button>
          </>
        )}
      </SectionHead>

      {!connected ? (
        <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">
          Spotify를 연결하면 플레이리스트를 만들고 관리할 수 있습니다.
        </p>
      ) : (
        <>
          {error && <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">{error}</p>}

          {naming && (
            <form
              className="flex items-center gap-[8px]"
              onSubmit={(e) => {
                e.preventDefault();
                void make();
              }}
            >
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setNaming(false)}
                maxLength={60}
                placeholder="새 플레이리스트 이름"
                aria-label="새 플레이리스트 이름"
                className="h-[30px] w-[300px] rounded-[4px] border-[1.5px] border-rule bg-card px-[10px] text-[13px] outline-none"
              />
              <button
                type="submit"
                disabled={!name.trim() || busy}
                className="cursor-pointer rounded-pill bg-ink px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-on-ink disabled:opacity-40"
              >
                만들기
              </button>
              <button
                type="button"
                onClick={() => setNaming(false)}
                className="cursor-pointer rounded-pill bg-paper px-[12px] py-[6px] text-[8px] tracking-[0.7px] rule"
              >
                취소
              </button>
            </form>
          )}

          {mine?.length === 0 && !naming && (
            <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">
              아직 만든 플레이리스트가 없습니다. 재생 바의 + 로 곡을 담거나, ‘새 플레이리스트’로 빈 목록을 먼저 만들 수 있어요.
            </p>
          )}

          {mine && mine.length > 0 && (
            <ul className="flex w-full flex-col">
              <li className="flex items-center gap-[12px] pb-[6px] text-[8px] tracking-[0.8px] text-on-bright-muted rule-b">
                <span className="w-[40px] shrink-0" />
                <span className="min-w-0 flex-1">이름</span>
                <span className="w-[70px] shrink-0">곡 수</span>
                <span className="w-[80px] shrink-0">수정</span>
                <span className="w-[76px] shrink-0">공개</span>
                <span className="w-[190px] shrink-0" />
              </li>
              {mine.map((p) => (
                <Row key={p.id} p={p} open={p.id === openId} onOpen={onOpen} onError={setError} />
              ))}
            </ul>
          )}

        </>
      )}
    </section>
  );
}

function Row({
  p,
  open,
  onOpen,
  onError,
}: {
  p: PlaylistSummary;
  open: boolean;
  onOpen: (id: string | null) => void;
  onError: (message: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(p.name);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fail = (e: unknown) => onError(playlistErrorText(e));

  const save = async () => {
    const next = name.trim();
    setEditing(false);
    if (!next || next === p.name) return;
    try {
      await renamePlaylist(p.id, { name: next });
    } catch (e) {
      fail(e);
    }
  };

  return (
    <li
      className={`flex h-[58px] items-center gap-[12px] rule-b ${
        open ? "-ml-[3px] border-l-[3px] border-accent-bright bg-accent-bright/10 pl-0" : ""
      }`}
    >
      <PlaylistCover palette={p.palette} size={40} tone="bg-ink/10 text-ink" />

      <span className="flex min-w-0 flex-1 items-center">
        {editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") setEditing(false);
            }}
            maxLength={60}
            aria-label="플레이리스트 이름"
            className="h-[30px] w-full max-w-[300px] rounded-[4px] border-[1.5px] border-rule bg-card px-[10px] text-[13px] outline-none"
          />
        ) : (
          <button
            type="button"
            onClick={() => onOpen(open ? null : p.id)}
            className="min-w-0 cursor-pointer truncate text-left text-[13px] hover:underline"
          >
            {p.name}
          </button>
        )}
      </span>

      <span className="tnum w-[70px] shrink-0 text-[10px] font-black">{p.count}곡</span>
      <span className="w-[80px] shrink-0 text-[10px] text-on-bright-muted">{playedAgo(p.updatedAt)}</span>

      <span className="w-[76px] shrink-0">
        <button
          type="button"
          aria-pressed={p.isPublic}
          title={p.isPublic ? "공개 중 — 누르면 비공개로" : "비공개 — 누르면 공개로"}
          onClick={() => void renamePlaylist(p.id, { isPublic: !p.isPublic }).catch(fail)}
          className={`cursor-pointer whitespace-nowrap rounded-pill px-[12px] py-[6px] text-[8px] tracking-[0.7px] rule ${
            p.isPublic ? "bg-accent-bright text-paper-solid" : "bg-paper"
          }`}
        >
          {p.isPublic ? "공개" : "비공개"}
        </button>
      </span>

      <span className="flex w-[190px] shrink-0 items-center justify-end">
        {editing ? (
          <>
            <button
              type="button"
              onClick={() => void save()}
              className="cursor-pointer whitespace-nowrap rounded-pill bg-ink px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-on-ink"
            >
              저장
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="ml-[6px] cursor-pointer whitespace-nowrap rounded-pill bg-paper px-[12px] py-[6px] text-[8px] tracking-[0.7px] rule"
            >
              취소
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onOpen(open ? null : p.id)}
              aria-pressed={open}
              className={`${ACTION} ${open ? "text-accent-bright" : ""}`}
            >
              열기
            </button>
            <button
              type="button"
              onClick={() => {
                setName(p.name);
                setEditing(true);
              }}
              className={ACTION}
            >
              이름 바꾸기
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                void removePlaylist(p.id).then(() => open && onOpen(null), fail);
              }}
              onBlur={() => setConfirmDelete(false)}
              className={`${ACTION} ${confirmDelete ? "text-accent-bright" : ""}`}
            >
              {confirmDelete ? "정말 삭제" : "삭제"}
            </button>
          </>
        )}
      </span>
    </li>
  );
}
