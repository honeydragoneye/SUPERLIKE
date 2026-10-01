"use client";

import Link from "next/link";
import { Icon } from "./ui/icon";
import { ConnectButton } from "./player/connect-button";

function IconButton({ name, label }: { name: string; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      className="flex size-[36px] shrink-0 items-center justify-center rounded-pill bg-paper rule"
    >
      <Icon name={name} size={16} />
    </button>
  );
}

export function SiteHeader() {
  return (
    <header className="flex h-[84px] shrink-0 items-center gap-[18px] overflow-hidden bg-white pl-[20px] pr-[14px] rule">
      <Link
        href="/"
        aria-label="홈으로"
        title="홈으로"
        className="shrink-0"
      >
        <span className="whitespace-nowrap text-[36px] font-black tracking-[-1.6px]">
          Superlike®
        </span>
      </Link>

      <div className="min-w-px flex-1" />

      <Link href="/mypage" className="shrink-0 rounded-pill">
        <span className="whitespace-nowrap text-[24px] tracking-[-0.3px]">
          MYPAGE
        </span>
      </Link>

      <IconButton name="search" label="검색" />
      <IconButton name="heart-outline" label="좋아요한 음악" />
      <IconButton name="queue" label="재생 목록" />

      <ConnectButton />
    </header>
  );
}
