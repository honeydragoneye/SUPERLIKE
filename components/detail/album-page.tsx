"use client";

import Image from "next/image";
import { useSpotify } from "@/components/player/spotify-provider";
import { useRouter } from "next/navigation";
import { StationButton } from "@/components/ui/station-button";
import { clock } from "@/lib/time";
import type { AlbumPage as Album } from "@/lib/data";
import { DetailShell, DetailStatus } from "./detail-shell";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useDetail } from "./use-detail";

const ALBUM_TYPE_LABEL: Record<string, string> = {
  album: "정규",
  single: "싱글",
  compilation: "컴필레이션",
};

/** "2024-10-28" at day precision, "2024" when that is all Spotify stored. */
function releaseLabel(date: string, precision: string): string {
  if (precision === "year") return `${date.slice(0, 4)}년`;
  if (precision === "month") return `${date.slice(0, 4)}년 ${Number(date.slice(5, 7))}월`;
  return `${date.slice(0, 4)}년 ${Number(date.slice(5, 7))}월 ${Number(date.slice(8, 10))}일`;
}

export function AlbumPage({ id }: { id: string }) {
  const { data, loading, error } = useDetail<Album>(`/api/spotify/album/${id}`);
  const { play } = useSpotify();
  const router = useRouter();

  const runtime = data?.tracks.reduce((a, t) => a + t.durationMs, 0) ?? 0;
  const multiDisc = (data?.tracks ?? []).some((t) => t.discNumber > 1);

  return (
    <DetailShell
      eyebrow="ALBUM"
      title={data?.name ?? <LoadingDots size={8} />}
      subtitle={
        data
          ? [
              data.artists.map((a) => a.name).join(", "),
              releaseLabel(data.releaseDate, data.releaseDatePrecision),
              `${data.totalTracks}곡`,
              clock(runtime),
              ALBUM_TYPE_LABEL[data.albumType] ?? data.albumType,
            ].join(" · ")
          : undefined
      }
      aside={
        data?.tracks.length ? (
          <button
            type="button"
            onClick={() => void play({ contextUri: data.uri })}
            className="shrink-0 whitespace-nowrap rounded-pill bg-ink px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-paper-solid"
          >
            앨범 재생
          </button>
        ) : null
      }
    >
      <DetailStatus loading={loading} error={error} />

      {data && (
        <div className="flex w-full flex-1 flex-col gap-[14px]">
          <div className="flex w-full shrink-0 items-start gap-[14px]">
            <span className="relative size-[132px] shrink-0 overflow-hidden rounded-[4px] bg-ink">
              {data.artwork && (
                <Image src={data.artwork} alt="" fill sizes="132px" className="object-cover" unoptimized />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[8px]">
              <span className="flex flex-wrap gap-[6px]">
                {data.artists.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => router.push(`/artist/${a.id}`)}
                    className="shrink-0 cursor-pointer rounded-pill bg-paper px-[10px] py-[5px] text-[9px] transition-colors hover:bg-gold rule"
                  >
                    {a.name}
                  </button>
                ))}
              </span>
              {/* label is deprecated on Spotify's side, so it often is not there */}
              {data.label && (
                <span className="text-[9px] text-on-bright-muted">{data.label}</span>
              )}
              {data.upc && (
                <span className="tnum text-[8px] tracking-[0.5px] text-on-bright-muted">
                  UPC {data.upc}
                </span>
              )}
            </span>
          </div>

          <ul className="flex w-full shrink-0 flex-col">
            {data.tracks.map((t) => (
              <li key={t.id} className="group relative rule-b">
                <button
                  type="button"
                  onClick={() =>
                    void play({ contextUri: data.uri, offsetUri: t.uri })
                  }
                  className="flex h-[44px] w-full cursor-pointer items-center gap-[12px] text-left"
                >
                  <span className="tnum w-[32px] shrink-0 text-right text-[11px] text-on-bright-muted">
                    {multiDisc ? `${t.discNumber}-${t.trackNumber}` : t.trackNumber}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-px">
                    <span className="truncate text-[13px]">
                      {t.name}
                      {t.explicit && " · E"}
                    </span>
                    <span className="truncate text-[9px] text-on-bright-muted">{t.artist}</span>
                  </span>
                  <span className="tnum w-[40px] shrink-0 text-right text-[10px]">
                    {clock(t.durationMs)}
                  </span>
                </button>
                <StationButton
                  label={t.name}
                  className="right-[64px]"
                  seed={async () => ({
                    id: t.id,
                    uri: t.uri,
                    name: t.name,
                    artist: t.artist,
                    artwork: data.artwork,
                    durationMs: t.durationMs,
                  })}
                />
              </li>
            ))}
          </ul>

          {data.copyrights.length > 0 && (
            <div className="flex w-full shrink-0 flex-col gap-[2px]">
              {data.copyrights.map((c) => (
                <p key={c} className="text-[8px] leading-[12px] text-on-bright-muted">
                  {c}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </DetailShell>
  );
}
