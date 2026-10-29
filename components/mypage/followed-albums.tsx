"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { checkedLabel, dayOf, updateNote } from "@/components/follow/update-row";
import { loadFollows, markRead, useFollowState } from "@/components/follow/follow-store";
import { useSpotify } from "@/components/player/spotify-provider";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useHydrated } from "@/components/ui/use-hydrated";
import { findSpotifyAlbum } from "@/lib/spotify-album";
import type { UpdateItem } from "@/lib/db/follows";
import { SectionHead } from "./section-head";

/** How far back a release still counts as "new" here; 소식 itself reaches further. */
const NEW_DAYS = 30;

const ghost = "rounded-[4px] bg-ink/10";

/**
 * 팔로우한 가수의 새 앨범: the last month's releases of the artists the
 * listener follows, as covers. A release not yet opened carries NEW.
 */
export function FollowedAlbums({ onManage }: { onManage: () => void }) {
  const { connected: session } = useSpotify();
  const connected = useHydrated() && session;
  const { items, artists, status, checkedAt, checkError } = useFollowState();

  // the window opens when the screen does; a screen left open overnight catches up at the next load
  const [since] = useState(() => new Date(Date.now() - NEW_DAYS * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }));
  const fresh = items.filter((i) => i.releaseDate >= since);
  const last = checkedLabel(checkedAt);
  const names = artists.slice(0, 3).map((a) => a.name).join(", ");

  return (
    <section className="flex w-full shrink-0 flex-col gap-[16px] bg-chart px-[24px] pb-[24px] pt-[20px]">
      <SectionHead
        title="팔로우한 가수의 새 앨범"
        hint={`출처: Apple Music · 최근 ${NEW_DAYS}일${last ? ` · 마지막 확인 ${last}` : ""}`}
      >
        {connected && artists.length > 0 && (
          <>
            <span className="text-[9px] tracking-[0.8px] text-on-bright-muted">{artists.length}명 팔로우 중</span>
            <button
              type="button"
              onClick={onManage}
              className="cursor-pointer whitespace-nowrap rounded-pill bg-ink px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-on-ink transition-colors hover:bg-accent-bright hover:text-paper-solid"
            >
              팔로우 관리
            </button>
          </>
        )}
      </SectionHead>

      {!connected ? (
        <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">
          Spotify를 연결하고 가수를 팔로우하면 새 앨범이 나올 때 여기에 알려 드려요.
        </p>
      ) : status === "loading" && artists.length === 0 ? (
        <div className="flex gap-[10px]" aria-label="새 앨범을 확인하는 중">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="flex w-[150px] shrink-0 flex-col gap-[8px]">
              <div className={`aspect-square w-full ${ghost}`} />
              <div className={`h-[10px] w-[100px] ${ghost}`} />
              <div className={`h-[8px] w-[60px] ${ghost}`} />
            </div>
          ))}
        </div>
      ) : status === "error" && artists.length === 0 ? (
        <div className="flex flex-col items-start gap-[8px]">
          <p className="text-[10px] tracking-[0.5px] text-alert">새 앨범을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.</p>
          <button
            type="button"
            onClick={() => void loadFollows(true)}
            className="cursor-pointer rounded-pill bg-ink px-[12px] py-[6px] text-[8px] tracking-[0.8px] text-on-ink transition-colors hover:bg-accent-bright hover:text-paper-solid"
          >
            다시 확인
          </button>
        </div>
      ) : artists.length === 0 ? (
        <div className="flex flex-col items-start gap-[8px]">
          <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">
            아티스트 페이지에서 팔로우하면, 그 가수의 새 앨범이 나올 때 여기에 알려 드려요.
          </p>
          <Link
            href="/search"
            className="whitespace-nowrap rounded-pill bg-ink px-[12px] py-[6px] text-[8px] tracking-[0.8px] text-on-ink transition-colors hover:bg-accent-bright hover:text-paper-solid"
          >
            가수 찾아보기 →
          </Link>
        </div>
      ) : fresh.length === 0 ? (
        <p className="text-[10px] leading-[16px] tracking-[0.5px] text-on-bright-muted">
          아직 새 앨범이 없어요. {names}
          {artists.length > 3 ? " 등" : ""}의 새 앨범이 나오면 알려 드려요.
        </p>
      ) : (
        <div className="scroll-x flex w-full shrink-0 gap-[10px] pb-[8px]" role="region" aria-label="팔로우한 가수의 새 앨범" tabIndex={0}>
          {fresh.map((u) => (
            <AlbumCard key={u.id} item={u} />
          ))}
        </div>
      )}

      {connected && checkError && artists.length > 0 && (
        <div className="flex items-center gap-[10px]">
          <p className="text-[10px] tracking-[0.5px] text-alert">새 앨범을 다 확인하지 못했어요.</p>
          <button
            type="button"
            onClick={() => void loadFollows(true)}
            className="cursor-pointer whitespace-nowrap rounded-pill bg-paper px-[10px] py-[4px] text-[8px] tracking-[0.7px] rule"
          >
            다시 확인
          </button>
        </div>
      )}
    </section>
  );
}

function AlbumCard({ item }: { item: UpdateItem }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    if (busy) return;
    setBusy(true);
    void markRead([item.id]);
    try {
      const id = await findSpotifyAlbum({ id: item.id, title: item.title, artist: item.artist });
      router.push(id ? `/album/${id}` : `/artist/${item.artistId}`);
    } catch {
      router.push(`/artist/${item.artistId}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className="flex w-[150px] shrink-0 snap-start flex-col gap-[8px]">
      <button
        type="button"
        onClick={() => void open()}
        aria-label={`${item.title} 앨범 열기`}
        title="앨범 열기"
        className="relative aspect-square w-full shrink-0 cursor-pointer overflow-hidden rounded-[4px] bg-artwork"
      >
        {item.artwork && <Image src={item.artwork} alt="" fill sizes="150px" className="object-cover" unoptimized />}
        {item.unread && (
          <span className="absolute left-[8px] top-[8px] rounded-pill bg-accent-bright px-[8px] py-[3px] text-[8px] tracking-[0.8px] text-paper-solid">
            NEW
          </span>
        )}
        <span className="tnum absolute bottom-[8px] left-[8px] rounded-pill bg-ink px-[8px] py-[3px] text-[8px] tracking-[0.4px] text-on-ink">
          {dayOf(item.releaseDate)}
        </span>
        {busy && (
          <span className="absolute inset-0 flex items-center justify-center bg-black/50">
            <LoadingDots size={4} label="앨범 찾는 중" />
          </span>
        )}
      </button>
      <div className="flex flex-col gap-[2px]">
        <p className="truncate text-[12px]" title={item.title}>
          {item.title}
        </p>
        <p className="truncate text-[9px] tracking-[0.4px] text-on-bright-muted" title={updateNote(item)}>
          {item.artist} · {dayOf(item.releaseDate)} 발매
        </p>
      </div>
    </article>
  );
}
