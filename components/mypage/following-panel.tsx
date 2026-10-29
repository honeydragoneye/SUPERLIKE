"use client";

import Image from "next/image";
import Link from "next/link";
import { dayOf } from "@/components/follow/update-row";
import { FollowButton } from "@/components/follow/follow-button";
import { useFollowState } from "@/components/follow/follow-store";

/** The artists the listener follows, in the column on the right of the mypage. */
export function FollowingPanel({ onClose }: { onClose: () => void }) {
  const { artists, status } = useFollowState();

  return (
    <section
      aria-label="팔로우 중인 가수"
      className="sticky top-0 flex max-h-[calc(100dvh-290px)] min-h-[355px] w-full flex-col gap-[14px] overflow-y-auto px-[24px] pb-[24px] pt-[20px]"
    >
      <div className="flex w-full shrink-0 items-start justify-between gap-[12px]">
        <div className="flex min-w-0 flex-col gap-px">
          <p className="text-[8px] tracking-[0.9px] text-on-bright-muted">FOLLOWING</p>
          <h2 className="truncate text-[19px] font-black tracking-[-0.4px]">팔로우 중인 가수</h2>
          <p className="truncate text-[9px] tracking-[0.4px] text-on-bright-muted">{artists.length}명 · 새 앨범이 나온 순</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 cursor-pointer whitespace-nowrap text-[8px] tracking-[0.7px] transition-colors hover:text-accent-bright"
        >
          닫기 ✕
        </button>
      </div>

      {artists.length === 0 ? (
        <p className="text-[10px] leading-[16px] tracking-[0.5px] text-on-bright-muted">
          {status === "loading" ? "불러오는 중" : "아직 팔로우한 가수가 없어요. 아티스트 페이지에서 팔로우할 수 있어요."}
        </p>
      ) : (
        <ul className="flex w-full shrink-0 flex-col border-t-[1.5px] border-rule">
          {artists.map((a) => (
            <li key={a.id} className="flex h-[58px] items-center gap-[12px] rule-b">
              <Link href={`/artist/${a.id}`} className="flex min-w-0 flex-1 items-center gap-[12px]">
                <span className="relative size-[40px] shrink-0 overflow-hidden rounded-pill bg-artwork">
                  {a.image && <Image src={a.image} alt="" fill sizes="40px" className="object-cover" unoptimized />}
                </span>
                <span className="flex min-w-0 flex-col gap-px">
                  <span className="truncate text-[13px] hover:underline">{a.name}</span>
                  <span className="truncate text-[9px] tracking-[0.4px] text-on-bright-muted">
                    {a.lastRelease ? `마지막 새 앨범 · ${dayOf(a.lastRelease)}` : "아직 새 앨범이 없어요"}
                  </span>
                </span>
              </Link>
              <FollowButton artist={{ id: a.id, name: a.name, image: a.image }} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
