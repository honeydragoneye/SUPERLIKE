"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { TrackCard } from "@/components/ui/track-card";
import type { WeeklyArtist } from "@/lib/db/weekly";
import type { WeeklyChartTrack } from "@/lib/chart";
import { DetailShell, DetailStatus } from "./detail-shell";
import { useDetail } from "./use-detail";

type Chart = { tracks: WeeklyChartTrack[]; source: string };

function Section({ title, note, children }: { title: string; note?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex w-full shrink-0 flex-col gap-[8px]">
      <div className="flex items-baseline justify-between gap-[12px]">
        <h3 className="text-[15px] font-black tracking-[-0.3px]">{title}</h3>
        {note && <p className="text-[8px] tracking-[0.5px] text-on-bright-muted">{note}</p>}
      </div>
      {children}
    </section>
  );
}

/**
 * Artist of the Week and the week's top songs.
 *
 * Both come from the database, so a visitor who has not connected Spotify sees
 * them too; playing a song still needs a connection, which the cards ask for.
 */
export function WeeklyArtistPage() {
  const router = useRouter();
  const artistState = useDetail<WeeklyArtist>("/api/weekly-artist");
  const chartState = useDetail<Chart>("/api/chart");
  const pick = artistState.data;
  const artist = pick?.artist;
  const when = pick?.previous ? "지난주" : "이번 주";

  return (
    <DetailShell
      eyebrow={pick?.previous ? "ARTIST OF THE WEEK · 지난주" : "ARTIST OF THE WEEK"}
      title={artist?.name ?? "이번 주 아티스트"}
      subtitle={artist ? [artist.genres.slice(0, 3).join(" · "), `${when} ${pick.plays}회 재생`].filter(Boolean).join(" · ") : undefined}
      aside={
        artist ? (
          <button
            type="button"
            onClick={() => router.push(`/artist/${artist.id}`)}
            className="shrink-0 whitespace-nowrap rounded-pill bg-ink px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-paper-solid"
          >
            아티스트 페이지
          </button>
        ) : null
      }
    >
      <div className="flex w-full flex-1 flex-col gap-[20px]">
        {artist ? (
          <div className="flex w-full shrink-0 items-start gap-[14px]">
            <span
              className="relative size-[132px] shrink-0 overflow-hidden rounded-[4px] bg-ink"
              style={artist.palette ? { backgroundColor: artist.palette.bg } : undefined}
            >
              {artist.image && <Image src={artist.image} alt="" fill sizes="132px" className="object-cover" unoptimized />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-[14px]">
              {pick.heard.length > 0 && (
                <Section title={`${when} 들은 곡`}>
                  <ul className="flex flex-col">
                    {pick.heard.map((t) => (
                      <li key={t.title} className="flex items-center justify-between gap-[12px] rule-b py-[5px]">
                        <span className="truncate text-[11px]">{t.title}</span>
                        <span className="tnum shrink-0 text-[10px] text-on-bright-muted">{t.count}회</span>
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {artist.topTracks.length > 0 && (
                <Section title="대표곡" note="Last.fm">
                  <p className="text-[10px] leading-[16px] text-on-bright">{artist.topTracks.map((t) => t.title).join(" · ")}</p>
                </Section>
              )}
            </div>
          </div>
        ) : (
          <DetailStatus
            loading={artistState.loading}
            error={artistState.error === "찾을 수 없습니다" ? "아직 이번 주 아티스트가 없습니다" : artistState.error}
          />
        )}

        <Section title="이번주 인기곡 TOP10" note="출처 Apple Music">
          <DetailStatus
            loading={chartState.loading}
            error={chartState.error === "찾을 수 없습니다" ? "아직 집계된 인기곡이 없습니다" : chartState.error}
          />
          {chartState.data && (
            <ul className="flex flex-col gap-[6px]">
              {chartState.data.tracks.map((t) => (
                <TrackCard key={`${t.title}|${t.artist}`} rank={t.rank} track={{ title: t.title, artist: t.artist, artwork: t.artwork }} />
              ))}
            </ul>
          )}
        </Section>
      </div>
    </DetailShell>
  );
}
