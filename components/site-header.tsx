"use client";

import Link from "next/link";
import { Icon } from "./ui/icon";
import { ConnectButton } from "./player/connect-button";
import { useSearchFocus } from "./search/search-focus";

/**
 * One of the header's round controls.
 *
 * Renders an anchor when it goes somewhere and a button when it does something,
 * so a destination keeps the behaviour a link is expected to have — middle
 * click, cmd-click, copy link address — rather than reimplementing navigation
 * on a button that offers none of it.
 */
function IconButton({
  name,
  label,
  onClick,
  href,
}: {
  name: string;
  label: string;
  onClick?: () => void;
  href?: string;
}) {
  /* the ones with nothing behind them yet stay flat: a hover highlight on a
     control that does nothing reads as a fault, not an affordance */
  const className = `flex size-[36px] shrink-0 items-center justify-center rounded-pill bg-paper rule${
    href || onClick ? " cursor-pointer transition-colors hover:bg-pink" : ""
  }`;

  if (href) {
    return (
      <Link href={href} aria-label={label} title={label} className={className}>
        <Icon name={name} size={16} />
      </Link>
    );
  }

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={className}
    >
      <Icon name={name} size={16} />
    </button>
  );
}

export function SiteHeader() {
  const { focus } = useSearchFocus();

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

      <IconButton name="search" label="검색" onClick={focus} />
      {/* the list, not the switch: liking a track is the Now Playing panel's
          heart, which is beside the track it would act on */}
      <IconButton name="heart-outline" label="좋아요한 음악" href="/mypage" />
      <IconButton name="queue" label="재생 목록" />

      <ConnectButton />
    </header>
  );
}
