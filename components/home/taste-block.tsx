"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useChat } from "@/components/chat/chat-provider";
import { SectionHead } from "@/components/mypage/section-head";
import { useSpotify } from "@/components/player/spotify-provider";
import { EXPLICIT_NOTE, LOCKED_LOOK, useExplicitLock } from "@/components/ui/explicit";
import { Icon } from "@/components/ui/icon";
import { LoadingDots } from "@/components/ui/loading-dots";
import { lookUp, type Found } from "@/components/ui/track-card";
import { useHydrated } from "@/components/ui/use-hydrated";
import { SLEEVE_TONES } from "@/lib/data";
import type { RecentAlbum } from "@/lib/db/albums";

type Rec = { title: string; artist: string; because: string };
type Taste = {
  ready: boolean;
  days: number;
  minPlays: number;
  totalPlays: number;
  artists: { name: string; plays: number }[];
  recs: Rec[];
  recsError: string | null;
};
type State =
  | { kind: "loading" }
  | { kind: "signed-out" }
  | { kind: "error" }
  | { kind: "ok"; taste: Taste };

const sleeve: Record<string, string> = {
  mint: "bg-mint",
  gold: "bg-soft",
  pink: "bg-accent",
  violet: "bg-violet",
};

/**
 * "당신의 취향": the artists this listener played most in the last four weeks,
 * and songs by artists that sound like them.
 *
 * The numbers come from the plays the database keeps (see lib/db/taste), not
 * from a model, so this block sends nothing anywhere but the artist names it
 * asks Last.fm about. A listener who is not connected has no plays on record
 * here and is told so rather than shown someone else's.
 */
export function TasteBlock() {
  const { connected: session } = useSpotify();
  const hydrated = useHydrated();
  const connected = hydrated && session;
  const chat = useChat();

  const [state, setState] = useState<State>({ kind: "loading" });
  const [round, setRound] = useState(0);
  const [again, setAgain] = useState(false);
  /** null until the first answer; the albums do not hold the taste back */
  const [albums, setAlbums] = useState<RecentAlbum[] | null>(null);

  const load = useCallback(async (next: number): Promise<State> => {
    try {
      const res = await fetch(`/api/me/taste?round=${next}`, { cache: "no-store" });
      if (res.status === 401) return { kind: "signed-out" };
      if (!res.ok) return { kind: "error" };
      return { kind: "ok", taste: (await res.json()) as Taste };
    } catch {
      return { kind: "error" };
    }
  }, []);

  useEffect(() => {
    if (!connected) return;
    let live = true;
    void load(0).then((s) => live && setState(s));
    fetch("/api/me/albums", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { albums?: RecentAlbum[] } | null) => live && setAlbums(body?.albums ?? []))
      .catch(() => live && setAlbums([]));
    return () => {
      live = false;
    };
  }, [connected, load]);

  const refresh = async () => {
    if (again) return;
    setAgain(true);
    const next = round + 1;
    const s = await load(next);
    // a failed second try keeps what is already on screen
    if (s.kind === "ok") {
      setRound(next);
      setState(s);
    }
    setAgain(false);
  };

  const taste = state.kind === "ok" ? state.taste : null;
  const note = "재생 기록 기준 · 최근 들은 앨범";

  return (
    <section className="flex w-full shrink-0 flex-col gap-[16px] border-b-[1.5px] border-rule px-[24px] pb-[24px] pt-[20px]">
      <SectionHead title="당신의 취향" note={note} />

      {!hydrated || (connected && state.kind === "loading") ? (
        <p className="flex items-center gap-[8px] text-[10px] tracking-[0.5px] text-on-bright-muted">
          <LoadingDots size={4} label="취향 불러오는 중" />
          재생 기록을 보고 있어요
        </p>
      ) : !connected || state.kind === "signed-out" ? (
        <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">
          Spotify를 연결하면 내가 들은 기록으로 취향을 알려 드려요.
        </p>
      ) : state.kind === "error" ? (
        <div className="flex flex-col items-start gap-[8px]">
          <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">취향을 불러오지 못했어요.</p>
          <button
            type="button"
            onClick={() => {
              setState({ kind: "loading" });
              void load(0).then(setState);
            }}
            className="cursor-pointer rounded-pill bg-ink px-[12px] py-[6px] text-[8px] tracking-[0.8px] text-on-ink transition-colors hover:bg-accent-bright hover:text-paper-solid"
          >
            다시 시도
          </button>
        </div>
      ) : taste && !taste.ready ? (
        <div className="flex w-full flex-col items-start gap-[10px] rounded-[8px] border-[1.2px] border-dashed border-rule/45 p-[24px]">
          <p className="text-[15px] font-black tracking-[-0.2px]">아직 취향을 알 만큼 들은 기록이 없어요</p>
          <p className="text-[10px] leading-[15px] text-on-bright-muted">
            20초 이상 들은 곡이 {taste.minPlays}번 쌓이면, 가장 많이 들은 가수와 비슷한 곡을 골라 드려요.
          </p>
          <button
            type="button"
            onClick={() => {
              if (!chat.open) chat.toggle();
            }}
            className="cursor-pointer whitespace-nowrap rounded-pill bg-card px-[14px] py-[7px] text-[9px] tracking-[0.6px] transition-colors rule hover:bg-soft"
          >
            챗봇에게 추천받기
          </button>
        </div>
      ) : taste ? (
        <>
          {albums === null ? (
            <p className="flex items-center gap-[8px] text-[10px] tracking-[0.5px] text-on-bright-muted">
              <LoadingDots size={4} label="최근 들은 앨범 불러오는 중" />
              최근 들은 앨범을 보고 있어요
            </p>
          ) : albums.length === 0 ? (
            <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">
              앨범이 확인되는 재생 기록이 아직 없어요. 곡을 20초 이상 들으면 여기에 쌓여요.
            </p>
          ) : (
            <div className="scroll-x flex w-full shrink-0 gap-[10px] pb-[8px]" role="region" aria-label="최근 들은 앨범" tabIndex={0}>
              {albums.map((a, i) => (
                <AlbumCard key={a.id} album={a} index={i} />
              ))}
            </div>
          )}

          <div className="flex w-full items-start justify-between gap-[16px]">
            <div className="flex min-w-0 flex-col gap-px">
              <h3 className="text-[13px] font-black tracking-[-0.2px]">이 취향으로 골랐어요</h3>
            </div>
            <button
              type="button"
              disabled={again}
              onClick={() => void refresh()}
              className="flex shrink-0 cursor-pointer items-center gap-[6px] whitespace-nowrap rounded-pill bg-card px-[16px] py-[6px] text-[9px] tracking-[0.6px] transition-colors rule enabled:hover:bg-soft disabled:cursor-default"
            >
              {again ? (
                <>
                  찾는 중
                  <LoadingDots size={3} label="새 추천 찾는 중" />
                </>
              ) : (
                "새로 받기"
              )}
            </button>
          </div>

          {taste.recs.length === 0 ? (
            <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">
              {taste.recsError ? "추천을 가져오지 못했어요. 잠시 뒤 다시 받아 보세요." : "비슷한 곡을 찾지 못했어요."}
            </p>
          ) : (
            <div
              className={`scroll-x flex w-full shrink-0 gap-[10px] pb-[8px] transition-opacity ${again ? "opacity-50" : ""}`}
              role="region"
              aria-label="추천한 곡"
              tabIndex={0}
            >
              {taste.recs.map((rec, i) => (
                <RecCard key={`${rec.title}|${rec.artist}`} rec={rec} index={i} />
              ))}
            </div>
          )}
        </>
      ) : null}
    </section>
  );
}

/**
 * One recommended song as a sleeve.
 *
 * Last.fm names the song without a Spotify id, so the card looks it up once
 * (the same lookup the chatbot's cards use); until it is found the sleeve is
 * the plain disc, and a song Spotify does not have stays unplayable.
 */
function RecCard({ rec, index }: { rec: Rec; index: number }) {
  const { connected, play } = useSpotify();
  const [seed, setSeed] = useState<Found | null>(null);
  const [looked, setLooked] = useState(false);
  const locked = useExplicitLock()(seed?.explicit);
  const tone = SLEEVE_TONES[index % SLEEVE_TONES.length];

  useEffect(() => {
    if (!connected) return;
    let live = true;
    lookUp({ title: rec.title, artist: rec.artist })
      .then((s) => live && (setSeed(s), setLooked(true)))
      .catch(() => live && setLooked(true));
    return () => {
      live = false;
    };
  }, [connected, rec.title, rec.artist]);

  return (
    <article className="flex w-[150px] shrink-0 snap-start flex-col gap-[8px]">
      <button
        type="button"
        disabled={!seed || locked}
        onClick={() => seed && void play({ uris: [seed.uri] })}
        aria-label={`${rec.title} 재생`}
        title={locked ? EXPLICIT_NOTE : looked && !seed ? "Spotify에서 이 곡을 찾지 못했어요" : "재생"}
        className={`group relative aspect-square w-full shrink-0 overflow-hidden rounded-[4px] enabled:cursor-pointer disabled:cursor-default ${sleeve[tone]} ${locked ? LOCKED_LOOK : ""}`}
      >
        {seed?.artworkLarge ? (
          <Image src={seed.artworkLarge} alt="" fill sizes="150px" className="object-cover" unoptimized />
        ) : (
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <Icon name="release-disc" size={77} />
            <Icon name="release-ring" size={32} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
            <Icon name="release-hole" size={9} className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" />
          </span>
        )}
        {seed && !locked && (
          <span className="absolute right-[8px] top-[110px] flex size-[32px] items-center justify-center rounded-full bg-accent-bright text-paper-solid transition-transform group-hover:scale-105">
            <svg width="11" height="11" viewBox="0 0 10 11" aria-hidden fill="currentColor" className="ml-[2px]">
              <path d="M0 0 10 5.5 0 11z" />
            </svg>
          </span>
        )}
      </button>
      <div className="flex flex-col gap-[2px]">
        <p className="truncate text-[12px]" title={rec.title}>
          {rec.title}
        </p>
        <p className="truncate text-[9px] uppercase tracking-[0.4px] text-on-bright-muted" title={rec.artist}>
          {rec.artist}
        </p>
      </div>
    </article>
  );
}

/**
 * One album the listener played lately: the cover opens the album page, the
 * round button over it plays the whole album from its first track.
 *
 * The two are siblings rather than a button inside a link, which HTML does
 * not allow. Until Spotify has been asked for the name and cover of an album
 * played before they were kept, the card shows the plain disc and still links.
 */
function AlbumCard({ album, index }: { album: RecentAlbum; index: number }) {
  const { connected, play } = useSpotify();
  const hydrated = useHydrated();
  const tone = SLEEVE_TONES[index % SLEEVE_TONES.length];
  const name = album.name ?? "앨범";

  return (
    <article className="group relative flex w-[150px] shrink-0 snap-start flex-col gap-[8px]">
      <Link
        href={`/album/${album.id}`}
        aria-label={`${name} 앨범 열기`}
        title="앨범 열기"
        className={`relative block aspect-square w-full shrink-0 overflow-hidden rounded-[4px] ${sleeve[tone]}`}
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
      </Link>
      <button
        type="button"
        disabled={!hydrated || !connected}
        onClick={() => void play({ contextUri: `spotify:album:${album.id}` })}
        aria-label={`${name} 앨범 전곡 재생`}
        title="앨범 전곡 재생"
        className="absolute right-[8px] top-[110px] flex size-[32px] cursor-pointer items-center justify-center rounded-full bg-accent-bright text-paper-solid transition-transform hover:scale-105 disabled:cursor-default disabled:opacity-50"
      >
        <svg width="11" height="11" viewBox="0 0 10 11" aria-hidden fill="currentColor" className="ml-[2px]">
          <path d="M0 0 10 5.5 0 11z" />
        </svg>
      </button>
      <div className="flex flex-col gap-[2px]">
        <p className="truncate text-[12px]" title={name}>
          {name}
        </p>
        <p className="truncate text-[9px] uppercase tracking-[0.4px] text-on-bright-muted" title={album.artist}>
          {album.artist}
        </p>
      </div>
    </article>
  );
}
