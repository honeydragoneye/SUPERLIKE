"use client";

import Image from "next/image";
import { useState } from "react";
import { useSpotify } from "@/components/player/spotify-provider";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { StationButton } from "@/components/ui/station-button";
import { clock } from "@/lib/time";
import type { ArtistPage as Artist, SearchArtist } from "@/lib/data";
import { pickEntities } from "@/lib/suggest";
import { DetailShell, DetailStatus } from "./detail-shell";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useDetail } from "./use-detail";

const ALBUM_TYPE_LABEL: Record<string, string> = {
  album: "정규",
  single: "싱글",
  compilation: "컴필레이션",
};

export function ArtistPage({ id }: { id: string }) {
  const { data, loading, error } = useDetail<Artist>(`/api/spotify/artist/${id}`);
  const { play, startStation } = useSpotify();
  const router = useRouter();

  // Spotify deprecated both, so they are often absent — say nothing rather than 0
  const facts = [
    data?.followers != null ? `팔로워 ${data.followers.toLocaleString("ko-KR")}` : null,
    data?.popularity != null ? `인기도 ${data.popularity}` : null,
    data?.albums.length ? `앨범 ${data.albums.length}` : null,
  ].filter(Boolean);

  return (
    <DetailShell
      eyebrow="ARTIST"
      title={data?.name ?? <LoadingDots size={8} />}
      subtitle={facts.length ? facts.join(" · ") : undefined}
      aside={
        data?.topTracks.length ? (
          <>
            {/* the station starts from the artist's first top track, as the button at the foot of the page did */}
            <button
              type="button"
              title={`${data.name} 기준으로 스테이션 시작`}
              onClick={() =>
                void startStation({
                  id: data.topTracks[0].id,
                  uri: data.topTracks[0].uri,
                  name: data.topTracks[0].name,
                  artist: data.name,
                  artwork: data.topTracks[0].artwork,
                  durationMs: data.topTracks[0].durationMs,
                })
              }
              className="shrink-0 whitespace-nowrap rounded-pill bg-accent px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-paper-solid transition-colors hover:bg-ink"
            >
              스테이션 시작
            </button>
            <button
              type="button"
              onClick={() =>
                void play({
                  uris: data.topTracks.map((t) => t.uri),
                  tracks: data.topTracks.map((t) => ({
                    uri: t.uri,
                    title: t.name,
                    artist: data.name,
                    artwork: t.artwork,
                    durationMs: t.durationMs,
                  })),
                })
              }
              className="shrink-0 whitespace-nowrap rounded-pill bg-ink px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-paper-solid"
            >
              인기곡 재생
            </button>
          </>
        ) : null
      }
    >
      <DetailStatus loading={loading} error={error} />

      {data && (
        <div className="flex w-full flex-1 flex-col gap-[14px]">
          <div className="flex w-full shrink-0 items-center gap-[14px]">
            <span className="relative size-[96px] shrink-0 overflow-hidden rounded-pill bg-ink">
              {data.image && (
                <Image src={data.image} alt="" fill sizes="96px" className="object-cover" unoptimized />
              )}
            </span>
            <span className="flex min-w-0 flex-1 flex-col gap-[6px]">
              {data.genres.length > 0 && (
                <span className="flex flex-wrap gap-[6px]">
                  {data.genres.slice(0, 6).map((g) => (
                    <span
                      key={g}
                      className="shrink-0 rounded-pill bg-soft px-[10px] py-[4px] text-[8px] tracking-[0.6px] text-ink rule"
                    >
                      {g}
                    </span>
                  ))}
                </span>
              )}
              {/* the listener deserves to know when a field is not Spotify's */}
              <span className="text-[8px] tracking-[0.5px] text-on-bright-muted">
                {data.genreSource === "lastfm"
                  ? "장르 출처: Last.fm"
                  : data.genreSource === "none"
                    ? "장르 정보 없음"
                    : "장르 출처: Spotify"}
              </span>
            </span>
          </div>

          <Section
            title={data.topSource === "lastfm" ? "인기곡 (Last.fm 기준)" : "인기곡"}
          >
            <ul className="flex w-full flex-col">
              {data.topTracks.map((t, i) => (
                <li key={t.id} className="group relative rule-b">
                  <button
                    type="button"
                    onClick={() => void play({ uris: [t.uri] })}
                    className="flex h-[46px] w-full cursor-pointer items-center gap-[12px] text-left"
                  >
                    <span className="tnum w-[24px] shrink-0 text-[14px] font-black">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="relative size-[32px] shrink-0 overflow-hidden rounded-[4px]">
                      {t.artwork ? (
                        <Image src={t.artwork} alt="" fill sizes="32px" className="object-cover" unoptimized />
                      ) : (
                        <Icon name="chart-art" size={32} />
                      )}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-px">
                      <span className="truncate text-[13px]">
                        {t.name}
                        {t.explicit && " · E"}
                      </span>
                      <span className="truncate text-[9px] text-on-bright-muted">{t.albumName}</span>
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
                      artist: data.name,
                      artwork: t.artwork,
                      durationMs: t.durationMs,
                    })}
                  />
                </li>
              ))}
            </ul>
          </Section>

          <Section title="디스코그래피">
            <div className="scroll-x flex w-full gap-[10px] pb-[4px]">
              {data.albums.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => router.push(`/album/${a.id}`)}
                  title={a.name}
                  className="flex w-[120px] shrink-0 cursor-pointer flex-col gap-[6px] text-left"
                >
                  <span className="relative aspect-square w-full overflow-hidden rounded-[4px] bg-ink">
                    {a.artwork && (
                      <Image src={a.artwork} alt="" fill sizes="120px" className="object-cover" unoptimized />
                    )}
                  </span>
                  <span className="truncate text-[11px]">{a.name}</span>
                  <span className="truncate text-[8px] tracking-[0.5px] text-on-bright-muted">
                    {a.releaseDate.slice(0, 4)} · {ALBUM_TYPE_LABEL[a.albumType] ?? a.albumType}
                  </span>
                </button>
              ))}
            </div>
          </Section>

          {data.similar.length > 0 && (
            <Section title="비슷한 아티스트">
              <div className="flex w-full flex-wrap gap-[6px]">
                {data.similar.map((s) => (
                  <SimilarArtist key={s.name} name={s.name} match={s.match} />
                ))}
              </div>
              <p className="text-[8px] tracking-[0.5px] text-on-bright-muted">
                출처: Last.fm — Spotify의 Related Artists는 2024년 11월부터 신규 앱에 제공되지 않습니다
              </p>
            </Section>
          )}

        </div>
      )}
    </DetailShell>
  );
}

/**
 * One of Last.fm's neighbours, as a button to that artist's page.
 *
 * Last.fm names the artist but has no Spotify id, so the id is looked up when
 * the chip is pressed — one search, for the one the listener asked about,
 * instead of eight in advance. The same name rules as the search panel pick
 * the artist (an exact spelling over a near one, the best known of namesakes).
 * When Spotify has no artist by that name the chip says so for a moment.
 */
function SimilarArtist({ name, match }: { name: string; match: number }) {
  const router = useRouter();
  const [state, setState] = useState<"idle" | "finding" | "missing">("idle");

  const open = async () => {
    if (state === "finding") return;
    setState("finding");
    try {
      const res = await fetch(`/api/spotify/search?q=${encodeURIComponent(name)}&type=artist&limit=6`, {
        cache: "no-store",
      });
      const found = res.ok
        ? pickEntities(name, ((await res.json()) as { artists?: SearchArtist[] }).artists ?? [], []).artist
        : null;
      if (found) {
        // the page may stay mounted for the next artist, so the chip must not stay on "찾는 중…"
        setState("idle");
        return router.push(`/artist/${found.id}`);
      }
    } catch {
      // treated like not found: the chip goes back to what it was
    }
    setState("missing");
    setTimeout(() => setState("idle"), 3000);
  };

  return (
    <button
      type="button"
      onClick={() => void open()}
      disabled={state !== "idle"}
      title={`유사도 ${match.toFixed(2)}`}
      className={`shrink-0 cursor-pointer rounded-pill px-[10px] py-[5px] text-[9px] rule transition-colors ${
        state === "missing"
          ? "!border-dashed bg-paper text-on-bright-muted"
          : "bg-paper enabled:hover:bg-soft"
      } ${state === "finding" ? "opacity-60" : ""}`}
    >
      {state === "finding" ? "찾는 중…" : state === "missing" ? "찾지 못했어요" : name}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex w-full shrink-0 flex-col gap-[8px]">
      <h3 className="text-[10px] tracking-[1px] text-on-bright-muted">{title}</h3>
      {children}
    </div>
  );
}
