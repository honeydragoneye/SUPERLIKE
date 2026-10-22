"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { useSpotify, type QueueTrack } from "@/components/player/spotify-provider";
import { Icon } from "@/components/ui/icon";
import { LoadingDots } from "@/components/ui/loading-dots";
import { StationButton } from "@/components/ui/station-button";
import {
  loadPlaylist,
  onPlaylistsChanged,
  playlistErrorText,
  removeFromPlaylist,
  removePlaylist,
  renamePlaylist,
  PlaylistRequestError,
  type PlaylistDetail,
} from "@/lib/playlists";
import { clock } from "@/lib/time";
import { DetailShell } from "./detail-shell";

/** The longest list one play request has been seen to carry (see mypage/liked-tracks). */
const MAX_URIS = 100;

/**
 * A playlist made in Superlike.
 *
 * Its songs are stored here, so playing hands Spotify the uris in order rather
 * than a context, and UP NEXT shows exactly that list. Only the signed-in owner
 * can open it; anyone else is told it cannot be found.
 */
export function SuperlikePlaylistPage({ id }: { id: string }) {
  const router = useRouter();
  const { play, startStation } = useSpotify();
  const [data, setData] = useState<PlaylistDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = useCallback(
    () =>
      loadPlaylist(id).then(
        (d) => {
          setData(d);
          setError(null);
        },
        (e) =>
          setError(
            e instanceof PlaylistRequestError && e.status === 404
              ? "찾을 수 없습니다"
              : e instanceof PlaylistRequestError && e.status === 401
                ? "Spotify를 연결해 주세요"
                : playlistErrorText(e),
          ),
      ),
    [id],
  );

  useEffect(() => {
    void load();
    return onPlaylistsChanged(() => void load());
  }, [load]);

  const tracks = data?.tracks ?? [];
  const rows: QueueTrack[] = tracks.map((t) => ({
    uri: t.uri,
    title: t.title,
    artist: t.artist,
    artwork: t.artwork,
    durationMs: t.durationMs,
  }));
  const runtime = tracks.reduce((a, t) => a + t.durationMs, 0);

  const playFrom = (at: number) => {
    const rest = rows.slice(at, at + MAX_URIS);
    if (rest.length) void play({ uris: rest.map((t) => t.uri), tracks: rest });
  };

  const save = async () => {
    const next = name.trim();
    setEditing(false);
    if (!next || next === data?.name) return;
    try {
      await renamePlaylist(id, { name: next });
    } catch (e) {
      setError(playlistErrorText(e));
    }
  };

  const first = tracks[0];

  return (
    <DetailShell
      eyebrow="PLAYLIST · SUPERLIKE"
      title={
        editing ? (
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onBlur={() => void save()}
            onKeyDown={(e) => {
              if (e.key === "Enter") void save();
              if (e.key === "Escape") setEditing(false);
            }}
            maxLength={60}
            aria-label="플레이리스트 이름"
            className="w-full rounded-[4px] border-[1.5px] border-ink bg-paper-solid px-[8px] text-[26px] font-black tracking-[-1px] outline-none"
          />
        ) : (
          (data?.name ?? (error ? "플레이리스트" : <LoadingDots size={8} />))
        )
      }
      subtitle={
        data
          ? `${tracks.length}곡 · ${clock(runtime)} · ${data.isPublic ? "공개" : "비공개"}`
          : undefined
      }
      aside={
        data && (
          <>
            {tracks.length > 0 && (
              <button
                type="button"
                onClick={() => playFrom(0)}
                className="shrink-0 whitespace-nowrap rounded-pill bg-ink px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-paper-solid"
              >
                전체 재생
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                setName(data.name);
                setEditing(true);
              }}
              className="shrink-0 whitespace-nowrap rounded-pill bg-paper px-[12px] py-[6px] text-[8px] tracking-[0.7px] transition-colors hover:bg-gold rule"
            >
              이름 바꾸기
            </button>
            <button
              type="button"
              onClick={() => {
                if (!confirmDelete) return setConfirmDelete(true);
                void removePlaylist(id).then(
                  () => router.replace("/"),
                  (e) => setError(playlistErrorText(e)),
                );
              }}
              onBlur={() => setConfirmDelete(false)}
              className={`shrink-0 whitespace-nowrap rounded-pill px-[12px] py-[6px] text-[8px] tracking-[0.7px] transition-colors rule ${
                confirmDelete ? "bg-pink-bright text-black" : "bg-paper hover:bg-gold"
              }`}
            >
              {confirmDelete ? "정말 삭제" : "삭제"}
            </button>
          </>
        )
      }
    >
      {error && <p className="shrink-0 text-[10px] tracking-[0.5px] text-on-bright-muted">{error}</p>}
      {!data && !error && (
        <p className="flex shrink-0 items-center gap-[8px] text-[10px] tracking-[0.5px] text-on-bright-muted">
          불러오는 중
          <LoadingDots size={4} />
        </p>
      )}

      {data && (
        <div className="flex w-full flex-1 flex-col gap-[14px]">
          {first && (
            <button
              type="button"
              onClick={() =>
                void startStation({
                  id: first.id,
                  uri: first.uri,
                  name: first.title,
                  artist: first.artist,
                  artwork: first.artwork,
                  durationMs: first.durationMs,
                })
              }
              className="w-fit shrink-0 rounded-pill bg-pink px-[12px] py-[6px] text-[9px] tracking-[0.6px] text-paper-solid transition-colors hover:bg-ink rule"
            >
              이 목록 기준으로 스테이션 시작
            </button>
          )}
          {tracks.length === 0 && (
            <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">
              아직 담은 곡이 없습니다. 재생 바의 + 로 지금 듣는 곡을 담을 수 있어요.
            </p>
          )}

          <ul className="flex w-full shrink-0 flex-col">
            {tracks.map((t, i) => (
              <li key={t.id} className="group relative shrink-0 rule-b">
                <button
                  type="button"
                  onClick={() => playFrom(i)}
                  className="flex h-[46px] w-full cursor-pointer items-center gap-[12px] text-left"
                >
                  <span className="tnum w-[32px] shrink-0 text-[14px] font-black">{i + 1}</span>
                  <span className="relative size-[32px] shrink-0 overflow-hidden rounded-[4px]">
                    {t.artwork ? (
                      <Image src={t.artwork} alt="" fill sizes="32px" className="object-cover" unoptimized />
                    ) : (
                      <Icon name="chart-art" size={32} />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[13px]">{t.title}</span>
                    <span className="truncate text-[9px] text-on-bright-muted">{t.artist}</span>
                  </span>
                  <span className="tnum mr-[36px] w-[40px] shrink-0 text-right text-[10px]">
                    {clock(t.durationMs)}
                  </span>
                </button>
                <StationButton
                  label={t.title}
                  className="right-[100px]"
                  seed={async () => ({
                    id: t.id,
                    uri: t.uri,
                    name: t.title,
                    artist: t.artist,
                    artwork: t.artwork,
                    durationMs: t.durationMs,
                  })}
                />
                <button
                  type="button"
                  aria-label={`${t.title} 목록에서 빼기`}
                  title="목록에서 빼기"
                  onClick={() => void removeFromPlaylist(id, t.id).catch((e) => setError(playlistErrorText(e)))}
                  className="absolute right-[6px] top-1/2 -translate-y-1/2 cursor-pointer p-[6px] text-[11px] text-on-bright-muted opacity-0 transition-opacity hover:text-on-bright focus-visible:opacity-100 group-hover:opacity-100"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DetailShell>
  );
}
