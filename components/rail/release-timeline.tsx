"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ArtistAlbum } from "@/lib/data";
import { squash } from "@/lib/names";

const TYPE_LABEL: Record<string, string> = { album: "정규", single: "싱글", compilation: "컴필레이션" };

/** How many releases show before 더 보기: eight rows fill the column without scrolling. */
const SHOWN = 8;

/**
 * An artist's releases in the order they came out, newest on top, one line
 * each: the year, a dot on a single vertical line, the cover and the name.
 *
 * The name is the button — it opens that album. The one being looked at (when
 * the column sits beside an album) is marked and does not navigate.
 */
export function ReleaseTimeline({ albums, currentId }: { albums: ArtistAlbum[]; currentId?: string }) {
  const router = useRouter();
  const [all, setAll] = useState(false);

  // the same release under two editions (deluxe, a re-issue) is one line; the one being looked at is the one that stays
  const keyOf = (a: ArtistAlbum) => `${squash(a.name)}|${a.releaseDate.slice(0, 4)}`;
  const currentKey = albums.find((a) => a.id === currentId);
  const seen = new Set<string>(currentKey ? [keyOf(currentKey)] : []);
  const releases = [...albums]
    .sort((a, b) => b.releaseDate.localeCompare(a.releaseDate))
    .filter((a) => {
      if (a.id === currentId) return true;
      const key = keyOf(a);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  const shown = all ? releases : releases.slice(0, SHOWN);
  // the album being looked at stays on the list even when it is older than the cut
  const visible =
    currentId && !shown.some((a) => a.id === currentId)
      ? [...shown, ...releases.filter((a) => a.id === currentId)]
      : shown;

  if (releases.length === 0) return <p className="text-[10px] font-medium text-on-bright-muted">발매 앨범이 없습니다</p>;

  return (
    <div className="flex shrink-0 flex-col gap-[8px]">
      <ol className="relative flex flex-col">
        {/* the line the dots sit on */}
        <span aria-hidden className="absolute bottom-[22px] left-[40px] top-[22px] w-[1.5px] -translate-x-1/2 bg-ink/80" />
        {visible.map((a) => {
          const current = a.id === currentId;
          return (
            <li key={a.id} className="relative flex h-[44px] items-center">
              <span
                className={`tnum w-[30px] shrink-0 text-right text-[9px] ${current ? "text-on-bright" : "text-on-bright-muted"}`}
              >
                {a.releaseDate.slice(0, 4)}
              </span>
              <span
                aria-hidden
                className={`z-[1] block shrink-0 rounded-full border-2 border-chart ${
                  current ? "ml-[5px] size-[10px] bg-accent-bright" : "ml-[6px] size-[8px] bg-ink/80"
                }`}
                style={{ marginRight: current ? 13 : 14 }}
              />
              <button
                type="button"
                disabled={current}
                aria-current={current ? "page" : undefined}
                onClick={() => router.push(`/album/${a.id}`)}
                title={a.name}
                className="group flex min-w-0 flex-1 cursor-pointer items-center gap-[10px] text-left disabled:cursor-default"
              >
                <span
                  className={`relative size-[34px] shrink-0 overflow-hidden rounded-[3px] bg-artwork ${
                    current ? "ring-2 ring-accent-bright ring-offset-0" : ""
                  }`}
                >
                  {a.artwork && <Image src={a.artwork} alt="" fill sizes="34px" className="object-cover" unoptimized />}
                </span>
                <span className="flex min-w-0 flex-col gap-px">
                  <span
                    className={`truncate text-[11px] ${current ? "font-black" : "font-medium group-enabled:group-hover:underline"}`}
                  >
                    {a.name}
                  </span>
                  <span className={`text-[8px] ${current ? "text-accent-bright" : "text-on-bright-muted"}`}>
                    {current ? "지금 보는 앨범" : (TYPE_LABEL[a.albumType] ?? a.albumType)}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {releases.length > SHOWN && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          aria-expanded={all}
          className="w-fit cursor-pointer text-[9px] text-on-bright-muted transition-colors hover:text-on-bright"
        >
          {all ? "접기 ↑" : `더 보기 (${releases.length - SHOWN}) ↓`}
        </button>
      )}
    </div>
  );
}
