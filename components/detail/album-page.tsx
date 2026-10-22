"use client";

import Image from "next/image";
import { useSpotify } from "@/components/player/spotify-provider";
import { useRouter } from "next/navigation";
import { StationButton } from "@/components/ui/station-button";
import { clock, releaseLabel } from "@/lib/time";
import type { AlbumPage as Album } from "@/lib/data";
import { DetailShell, DetailStatus } from "./detail-shell";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useDetail } from "./use-detail";

const ALBUM_TYPE_LABEL: Record<string, string> = {
  album: "정규",
  single: "싱글",
  compilation: "컴필레이션",
};

/** The album screen for an id: fetches the album, then shows it. */
export function AlbumPage({ id }: { id: string }) {
  const { data, loading, error } = useDetail<Album>(`/api/spotify/album/${id}`);
  return <AlbumView data={data} loading={loading} error={error} />;
}

/**
 * An album already in hand, shown as the album screen.
 *
 * Split from the fetching so Editor's Pick can show the copy the database
 * keeps — a visitor who is not connected to Spotify has no token to fetch with.
 */
export function AlbumView({
  data,
  loading,
  error,
  eyebrow = "ALBUM",
  note,
}: {
  data: Album | null;
  loading: boolean;
  error: string | null;
  eyebrow?: string;
  /** a line above the album, e.g. why it is being shown */
  note?: string;
}) {
  const { play } = useSpotify();
  const router = useRouter();

  const runtime = data?.tracks.reduce((a, t) => a + t.durationMs, 0) ?? 0;
  const multiDisc = (data?.tracks ?? []).some((t) => t.discNumber > 1);

  /**
   * The same rows in the shape the player wants them, handed over with the
   * context so UP NEXT lists the album rather than Spotify's two-entry window.
   * The cover stands in for per-track artwork, which an album's tracks do not
   * carry — they all share this one.
   */
  const rows =
    data?.tracks.map((t) => ({
      uri: t.uri,
      title: t.name,
      artist: t.artist,
      artwork: data.artwork,
      durationMs: t.durationMs,
    })) ?? [];

  return (
    <DetailShell
      eyebrow={eyebrow}
      title={data?.name ?? (loading ? <LoadingDots size={8} /> : "")}
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
            onClick={() => void play({ contextUri: data.uri, tracks: rows })}
            className="shrink-0 whitespace-nowrap rounded-pill bg-ink px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-paper-solid"
          >
            앨범 재생
          </button>
        ) : null
      }
    >
      <DetailStatus loading={loading} error={error} />
      {note && data && <p className="shrink-0 text-[10px] tracking-[0.3px] text-on-bright-muted">{note}</p>}

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
                    className="shrink-0 cursor-pointer rounded-pill bg-paper px-[10px] py-[5px] text-[9px] transition-colors hover:bg-soft rule"
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
                    void play({ contextUri: data.uri, offsetUri: t.uri, tracks: rows })
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
