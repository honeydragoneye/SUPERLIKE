"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { SectionHead } from "@/components/mypage/section-head";
import { useSpotify } from "@/components/player/spotify-provider";
import { Icon } from "@/components/ui/icon";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useHydrated } from "@/components/ui/use-hydrated";
import { SLEEVE_TONES } from "@/lib/data";
import { findSpotifyAlbum as spotifyAlbum } from "@/lib/spotify-album";
import type { Country, Release } from "@/lib/releases";

const TABS: { key: Country; label: string }[] = [
  { key: "KR", label: "한국" },
  { key: "JP", label: "일본" },
  { key: "US", label: "미국" },
];

type State = { kind: "loading" } | { kind: "error" } | { kind: "ok"; albums: Release[] };

const sleeve: Record<string, string> = {
  mint: "bg-mint",
  gold: "bg-soft",
  pink: "bg-accent",
  violet: "bg-violet",
};

/** "2026-10-19" → "10.19" */
const day = (iso: string) => iso.slice(5).replace("-", ".");

/**
 * "최근 발매": albums that came out in the last month and are charting in
 * Korea, Japan or the United States. The data is Apple Music's public chart
 * (lib/releases); a card opens the album's page once Spotify has found it.
 */
export function ReleasesBlock() {
  const [country, setCountry] = useState<Country>("KR");
  const [loaded, setLoaded] = useState<Partial<Record<Country, State>>>({});
  const state = loaded[country] ?? { kind: "loading" as const };

  useEffect(() => {
    if (loaded[country]) return;
    let live = true;
    fetch(`/api/releases?country=${country}`)
      .then(async (res): Promise<State> => (res.ok ? { kind: "ok", albums: ((await res.json()) as { albums: Release[] }).albums } : { kind: "error" }))
      .catch((): State => ({ kind: "error" }))
      .then((s) => live && setLoaded((all) => ({ ...all, [country]: s })));
    return () => {
      live = false;
    };
  }, [country, loaded]);

  return (
    <section className="flex w-full shrink-0 flex-col gap-[16px] px-[24px] pb-[24px] pt-[20px]">
      <SectionHead
        title="최근 발매"
        hint="출처: Apple Music"
      >
        <div className="flex items-center gap-[6px]" role="group" aria-label="나라">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              aria-pressed={key === country}
              onClick={() => setCountry(key)}
              className={`shrink-0 cursor-pointer whitespace-nowrap rounded-pill px-[14px] py-[7px] text-[9px] tracking-[0.7px] rule ${
                key === country ? "bg-ink text-on-ink" : "bg-soft text-on-bright"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </SectionHead>

      {state.kind === "loading" ? (
        <p className="flex items-center gap-[8px] text-[10px] tracking-[0.5px] text-on-bright-muted">
          <LoadingDots size={4} label="최근 발매 불러오는 중" />
          불러오는 중
        </p>
      ) : state.kind === "error" ? (
        <div className="flex flex-col items-start gap-[8px]">
          <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">최근 발매를 불러오지 못했어요.</p>
          <button
            type="button"
            onClick={() => setLoaded((all) => ({ ...all, [country]: undefined }))}
            className="cursor-pointer rounded-pill bg-ink px-[12px] py-[6px] text-[8px] tracking-[0.8px] text-on-ink transition-colors hover:bg-accent-bright hover:text-paper-solid"
          >
            다시 시도
          </button>
        </div>
      ) : state.albums.length === 0 ? (
        <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">지금 차트에 오른 최근 발매가 없어요.</p>
      ) : (
        <div className="scroll-x flex w-full shrink-0 gap-[10px] pb-[8px]" role="region" aria-label="최근 발매 앨범" tabIndex={0}>
          {state.albums.map((album, i) => (
            <ReleaseCard key={album.id} album={album} index={i} />
          ))}
        </div>
      )}
    </section>
  );
}

function ReleaseCard({ album, index }: { album: Release; index: number }) {
  const router = useRouter();
  const { connected } = useSpotify();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [missing, setMissing] = useState(false);
  const tone = SLEEVE_TONES[index % SLEEVE_TONES.length];
  const ready = hydrated && connected;

  const open = async () => {
    if (!ready || busy || missing) return;
    setBusy(true);
    try {
      const id = await spotifyAlbum(album);
      if (id) router.push(`/album/${id}`);
      else setMissing(true);
    } catch {
      // a failed search leaves the card as it was: pressing again tries again
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="flex w-[150px] shrink-0 snap-start flex-col gap-[8px]">
      <button
        type="button"
        disabled={!ready || missing}
        onClick={() => void open()}
        aria-label={`${album.title} 앨범 열기`}
        title={
          !ready
            ? "Spotify를 연결하면 앨범을 열 수 있어요"
            : missing
              ? "Spotify에서 이 앨범을 찾지 못했어요"
              : "앨범 열기"
        }
        className={`group relative aspect-square w-full shrink-0 overflow-hidden rounded-[4px] enabled:cursor-pointer disabled:cursor-default ${sleeve[tone]}`}
      >
        {album.artwork ? (
          <Image src={album.artwork} alt="" fill sizes="150px" className="object-cover" unoptimized />
        ) : (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Icon name="release-disc" size={77} />
            <Icon name="release-ring" size={32} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
            <Icon name="release-hole" size={9} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
          </span>
        )}
        <span className="tnum absolute bottom-[8px] left-[8px] rounded-pill bg-ink px-[8px] py-[3px] text-[8px] tracking-[0.4px] text-on-ink">
          {day(album.releaseDate)}
        </span>
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50">
            <LoadingDots size={4} label="앨범 찾는 중" />
          </span>
        )}
      </button>
      <div className="flex flex-col gap-[2px]">
        <p className="truncate text-[12px]" title={album.title}>
          {album.title}
        </p>
        <p className="truncate text-[9px] uppercase tracking-[0.4px] text-on-bright-muted" title={album.artist}>
          {album.artist}
        </p>
      </div>
    </article>
  );
}
