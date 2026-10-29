"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { findSpotifyAlbum } from "@/lib/spotify-album";
import type { UpdateItem } from "@/lib/db/follows";
import { markRead } from "./follow-store";

const KIND: Record<UpdateItem["kind"], string> = { album: "앨범", ep: "EP", single: "싱글" };

/** "2026-10-24" → "10.24" */
export const dayOf = (iso: string) => iso.slice(5).replace("-", ".");

/** "소녀시대 · 앨범 · 10.24 발매" */
export const updateNote = (u: UpdateItem) => `${u.artist} · ${KIND[u.kind]} · ${dayOf(u.releaseDate)} 발매`;

/** "오늘 11:40", or "10.28 11:40" for another day: when the releases were last looked up. */
export function checkedLabel(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = (x: Date) => x.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  const time = d.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit", hour12: false });
  return day(d) === day(new Date()) ? `오늘 ${time}` : `${dayOf(day(d))} ${time}`;
}

/**
 * One release in 소식. Pressing it marks it read and opens the album on Spotify;
 * when Spotify has no album by that name it opens the artist instead, which is
 * still where the listener was headed.
 *
 * `tone` is the surface it sits on: the popup is dark, the panel is light.
 */
export function UpdateRow({ item, dark, onOpen }: { item: UpdateItem; dark: boolean; onOpen?: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const open = async () => {
    if (busy) return;
    setBusy(true);
    void markRead([item.id]);
    try {
      const id = await findSpotifyAlbum({ id: item.id, title: item.title, artist: item.artist });
      onOpen?.();
      router.push(id ? `/album/${id}` : `/artist/${item.artistId}`);
    } catch {
      onOpen?.();
      router.push(`/artist/${item.artistId}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li>
      <button
        type="button"
        onClick={() => void open()}
        className={`flex w-full cursor-pointer items-center gap-[12px] rounded-[4px] py-[4px] text-left transition-colors ${
          dark ? "hover:bg-white/10" : "hover:bg-soft"
        }`}
      >
        <span className="relative size-[44px] shrink-0 overflow-hidden rounded-[4px] bg-artwork">
          {item.artwork && <Image src={item.artwork} alt="" fill sizes="44px" className="object-cover" unoptimized />}
        </span>
        <span className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <span className={`truncate text-[12px] ${dark ? "text-on-dark" : ""}`}>{item.title}</span>
          <span className={`truncate text-[9px] tracking-[0.4px] ${dark ? "text-on-dark-muted" : "text-on-bright-muted"}`}>
            {updateNote(item)}
          </span>
        </span>
        <span
          aria-label={item.unread ? "읽지 않음" : undefined}
          className={`mr-[2px] size-[6px] shrink-0 rounded-full ${item.unread ? (dark ? "bg-[#9eb3ff]" : "bg-accent-bright") : "bg-transparent"}`}
        />
      </button>
    </li>
  );
}
