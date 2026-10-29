"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useSpotify } from "@/components/player/spotify-provider";
import { PlaylistCover } from "@/components/playlists/add-to-playlist-modal";
import { useHydrated } from "@/components/ui/use-hydrated";
import {
  createPlaylist,
  listPlaylists,
  onPlaylistsChanged,
  playlistErrorText,
  type PlaylistSummary,
} from "@/lib/playlists";
import { SectionHead } from "./section-head";

/**
 * The playlists this account keeps in Superlike, on the same rail as the liked
 * covers.
 *
 * Made from the + on the player bar, or empty from the card at the end of the
 * row. They are Superlike's own and play through Spotify; Spotify's playlists
 * are not read here.
 */
export function PlaylistShelf() {
  const { connected: session } = useSpotify();
  /**
   * Whether there is a session is something only the browser knows, and the
   * provider may already say yes on the first client render while the server
   * HTML said no. Until hydration is done this renders what the server did.
   */
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
      await createPlaylist(title, false);
      setName("");
      setNaming(false);
    } catch (e) {
      setError(playlistErrorText(e));
    } finally {
      setBusy(false);
    }
  };

  const mine = connected ? playlists : null;

  return (
    <section className="flex min-h-[306px] w-full flex-1 flex-col gap-[16px] px-[24px] pb-[24px] pt-[20px]">
      <SectionHead
        title="내 플레이리스트"
        hint={mine ? `${mine.length}개` : undefined}
      />

      {!connected ? (
        <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">
          Spotify를 연결하면 플레이리스트를 만들 수 있습니다.
        </p>
      ) : (
        <>
          {error && <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">{error}</p>}
          {mine?.length === 0 && !naming && (
            <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">
              아직 만든 플레이리스트가 없습니다. 재생 바의 + 로 곡을 담거나, 빈 목록을 먼저 만들 수 있어요.
            </p>
          )}
          <ul className="flex flex-wrap gap-[16px]">
            {mine?.map((p) => (
              <li key={p.id} className="w-[150px]">
                <Link href={`/mypage?playlist=${p.id}`} className="group flex flex-col gap-[8px]">
                  <PlaylistCover palette={p.palette} size={150} tone="bg-ink/10 text-ink" />
                  <span className="flex min-w-0 flex-col gap-px">
                    <span className="truncate text-[13px] group-hover:underline">{p.name}</span>
                    <span className="text-[8px] tracking-[0.8px] text-on-bright-muted">
                      {p.count}곡 · {p.isPublic ? "공개" : "비공개"}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            <li className="w-[150px]">
              {naming ? (
                <form
                  className="flex flex-col gap-[8px]"
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
                    placeholder="이름"
                    aria-label="새 플레이리스트 이름"
                    className="rounded-[6px] border-[1.5px] border-rule bg-card px-[10px] py-[8px] text-[12px] outline-none"
                  />
                  <div className="flex gap-[6px]">
                    <button
                      type="submit"
                      disabled={!name.trim() || busy}
                      className="cursor-pointer rounded-pill bg-ink px-[12px] py-[6px] text-[9px] text-on-ink disabled:opacity-40"
                    >
                      만들기
                    </button>
                    <button
                      type="button"
                      onClick={() => setNaming(false)}
                      className="cursor-pointer rounded-pill px-[10px] py-[6px] text-[9px] rule"
                    >
                      취소
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => setNaming(true)}
                  className="flex size-[150px] cursor-pointer flex-col items-center justify-center gap-[6px] rounded-[4px] border-[1.5px] border-dashed border-rule/50 text-[10px] tracking-[0.5px] text-on-bright-muted transition-colors hover:border-rule hover:text-on-bright"
                >
                  <span className="text-[22px] leading-none">+</span>
                  새 플레이리스트
                </button>
              )}
            </li>
          </ul>
        </>
      )}
    </section>
  );
}
