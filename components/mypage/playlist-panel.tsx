"use client";

import Image from "next/image";
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
  PlaylistRequestError,
  type PlaylistDetail,
} from "@/lib/playlists";
import { clock } from "@/lib/time";

/** The longest list one play request has been seen to carry (see mypage/liked-tracks). */
const MAX_URIS = 100;

/**
 * The playlist chosen with 열기, in the column on the right of the mypage.
 *
 * Its songs are stored here, so playing hands Spotify the uris in order rather
 * than a context, and UP NEXT shows exactly that list. Only the signed-in owner
 * can open it; anyone else is told it cannot be found. Renaming and deleting
 * stay on the list on the left.
 *
 * The caller gives it a `key` of the playlist id, so a different playlist
 * starts from an empty state instead of showing the last one's songs.
 */
export function PlaylistPanel({ id, onClose }: { id: string; onClose: () => void }) {
  const { play, startStation } = useSpotify();
  const [data, setData] = useState<PlaylistDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

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
  const first = tracks[0];

  const playFrom = (at: number) => {
    const rest = rows.slice(at, at + MAX_URIS);
    if (rest.length) void play({ uris: rest.map((t) => t.uri), tracks: rest });
  };

  return (
    // sticky, so the panel stays in view when 열기 was pressed far down a long page
    <section
      aria-label="플레이리스트"
      className="sticky top-0 flex max-h-[calc(100dvh-290px)] min-h-[355px] w-full flex-col gap-[14px] overflow-y-auto px-[24px] pb-[24px] pt-[20px]"
    >
      <div className="flex w-full shrink-0 items-start justify-between gap-[12px]">
        <div className="flex min-w-0 flex-col gap-px">
          <p className="text-[8px] tracking-[0.9px] text-on-bright-muted">PLAYLIST · SUPERLIKE</p>
          <h2 className="truncate text-[19px] font-black tracking-[-0.4px]" title={data?.name}>
            {data?.name ?? (error ? "플레이리스트" : <LoadingDots size={6} />)}
          </h2>
          {data && (
            <p className="truncate text-[9px] tracking-[0.4px] text-on-bright-muted">
              {tracks.length}곡 · {clock(runtime)} · {data.isPublic ? "공개" : "비공개"}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 cursor-pointer whitespace-nowrap text-[8px] tracking-[0.7px] transition-colors hover:text-accent-bright"
        >
          닫기 ✕
        </button>
      </div>

      {error && <p className="shrink-0 text-[10px] tracking-[0.5px] text-on-bright-muted">{error}</p>}
      {!data && !error && (
        <p className="flex shrink-0 items-center gap-[8px] text-[10px] tracking-[0.5px] text-on-bright-muted">
          불러오는 중
          <LoadingDots size={4} />
        </p>
      )}

      {data && (
        <>
          {first && (
            <div className="flex shrink-0 items-center gap-[8px]">
              <button
                type="button"
                onClick={() => playFrom(0)}
                className="cursor-pointer whitespace-nowrap rounded-pill bg-ink px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-on-ink transition-colors hover:bg-accent-bright hover:text-paper-solid"
              >
                전체 재생
              </button>
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
                title="첫 곡 기준으로 스테이션 시작"
                className="cursor-pointer whitespace-nowrap rounded-pill bg-accent-bright px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-paper-solid transition-colors hover:bg-ink hover:text-on-ink"
              >
                스테이션 시작
              </button>
            </div>
          )}
          {tracks.length === 0 && (
            <p className="text-[10px] leading-[16px] tracking-[0.5px] text-on-bright-muted">
              아직 담은 곡이 없습니다. 재생 바의 + 로 지금 듣는 곡을 담을 수 있어요.
            </p>
          )}

          <ul className="flex w-full shrink-0 flex-col border-t-[1.5px] border-rule">
            {tracks.map((t, i) => (
              <li key={t.id} className="group relative shrink-0 rule-b">
                <button
                  type="button"
                  onClick={() => playFrom(i)}
                  className="flex h-[46px] w-full cursor-pointer items-center gap-[10px] text-left"
                >
                  <span className="tnum w-[22px] shrink-0 text-[12px] font-black">{String(i + 1).padStart(2, "0")}</span>
                  <span className="relative size-[32px] shrink-0 overflow-hidden rounded-[4px]">
                    {t.artwork ? (
                      <Image src={t.artwork} alt="" fill sizes="32px" className="object-cover" unoptimized />
                    ) : (
                      <Icon name="chart-art" size={32} />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[12px]">{t.title}</span>
                    <span className="truncate text-[9px] text-on-bright-muted">{t.artist}</span>
                  </span>
                  <span className="tnum mr-[28px] w-[34px] shrink-0 text-right text-[10px]">{clock(t.durationMs)}</span>
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
                  className="absolute right-[0px] top-1/2 -translate-y-1/2 cursor-pointer p-[6px] text-[11px] text-on-bright-muted opacity-0 transition-opacity hover:text-on-bright focus-visible:opacity-100 group-hover:opacity-100"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          {tracks.length > 0 && (
            <p className="shrink-0 text-[9px] tracking-[0.5px] text-on-bright-muted">
              곡을 누르면 그 곡부터 이 목록 순서대로 재생합니다.
            </p>
          )}
        </>
      )}
    </section>
  );
}
