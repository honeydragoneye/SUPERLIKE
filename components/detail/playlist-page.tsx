"use client";

import Image from "next/image";
import { useSpotify } from "@/components/player/spotify-provider";
import { Icon } from "@/components/ui/icon";
import { LoadingDots } from "@/components/ui/loading-dots";
import { clock } from "@/lib/time";
import type { PlaylistPage as Playlist } from "@/lib/data";
import { DetailShell, DetailStatus } from "./detail-shell";
import { useDetail } from "./use-detail";

/**
 * One of the listener's own playlists.
 *
 * Tracks play through the playlist's context rather than as a bare uri list, so
 * what follows the track picked is the rest of the playlist — the same way
 * picking a row in an album behaves.
 */
export function PlaylistPage({ id }: { id: string }) {
  const { data, loading, error } = useDetail<Playlist>(`/api/spotify/playlist/${id}`);
  const { play, startStation } = useSpotify();

  const runtime = data?.tracks.reduce((a, t) => a + t.durationMs, 0) ?? 0;
  const first = data?.tracks[0];

  return (
    <DetailShell
      eyebrow="PLAYLIST"
      title={data?.name ?? <LoadingDots size={8} />}
      subtitle={
        data
          ? [
              data.owner,
              `${data.totalTracks}곡`,
              clock(runtime),
              data.collaborative ? "공동 작업" : null,
              data.isPublic === false ? "비공개" : null,
            ]
              .filter(Boolean)
              .join(" · ")
          : undefined
      }
      aside={
        data?.tracks.length ? (
          <button
            type="button"
            onClick={() => void play({ contextUri: data.uri })}
            className="shrink-0 whitespace-nowrap rounded-pill bg-ink px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-paper-solid"
          >
            전체 재생
          </button>
        ) : null
      }
    >
      <DetailStatus loading={loading} error={error} />

      {data && (
        <div className="flex w-full flex-1 flex-col gap-[14px]">
          <div className="flex w-full shrink-0 items-start gap-[14px]">
            <span className="relative size-[132px] shrink-0 overflow-hidden rounded-[4px] bg-ink">
              {data.cover && (
                <Image
                  src={data.cover}
                  alt=""
                  fill
                  sizes="132px"
                  className="object-cover"
                  unoptimized
                />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[8px]">
              {data.description && (
                <span className="text-[10px] leading-[15px] text-on-bright-muted">
                  {data.description}
                </span>
              )}
              {data.followers != null && data.followers > 0 && (
                <span className="tnum text-[9px] text-on-bright-muted">
                  팔로워 {data.followers.toLocaleString("ko-KR")}
                </span>
              )}
              {first && (
                <button
                  type="button"
                  onClick={() =>
                    void startStation({
                      id: first.id,
                      uri: first.uri,
                      name: first.name,
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
            </span>
          </div>

          {data.totalTracks > data.tracks.length && (
            <p className="shrink-0 text-[9px] text-on-bright-muted">
              {data.tracks.length} / {data.totalTracks}곡을 불러왔습니다
            </p>
          )}

          <ul className="flex w-full shrink-0 flex-col">
            {data.tracks.map((t) => (
              <li key={`${t.id}-${t.index}`} className="shrink-0 rule-b">
                <button
                  type="button"
                  onClick={() => void play({ contextUri: data.uri, offsetUri: t.uri })}
                  className="flex h-[46px] w-full cursor-pointer items-center gap-[12px] text-left"
                >
                  <span className="tnum w-[32px] shrink-0 text-[14px] font-black">
                    {t.index}
                  </span>
                  <span className="relative size-[32px] shrink-0 overflow-hidden rounded-[4px]">
                    {t.artwork ? (
                      <Image
                        src={t.artwork}
                        alt=""
                        fill
                        sizes="32px"
                        className="object-cover"
                        unoptimized
                      />
                    ) : (
                      <Icon name="chart-art" size={32} />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[13px]">
                      {t.name}
                      {t.explicit && " · E"}
                    </span>
                    <span className="truncate text-[9px] text-on-bright-muted">
                      {t.artist}
                    </span>
                  </span>
                  <span className="w-[220px] shrink-0 truncate text-[10px] text-on-bright-muted">
                    {t.album}
                  </span>
                  <span className="tnum w-[40px] shrink-0 text-right text-[10px]">
                    {clock(t.durationMs)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </DetailShell>
  );
}
