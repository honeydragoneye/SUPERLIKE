"use client";

import Image from "next/image";
import { useDetail } from "@/components/detail/use-detail";
import { useSpotify } from "@/components/player/spotify-provider";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useTheme } from "@/components/theme/use-theme";
import { useHydrated } from "@/components/ui/use-hydrated";
import type { Profile } from "@/lib/data";

/**
 * The connected Spotify account, as the head of the screen.
 *
 * Dark like the player beside it, so the two read as one frame around the
 * paper below. The name takes the place a page title would: on this screen the
 * account is the subject.
 */
export function AccountBanner() {
  const { connected: session, ready: deviceReady } = useSpotify();
  /**
   * Browser-only knowledge, held back until React has finished comparing this
   * subtree against the server HTML. Gated here rather than in the provider,
   * which sits outside the Suspense boundary and opens before this is hydrated.
   */
  const hydrated = useHydrated();
  const connected = hydrated && session;
  const ready = hydrated && deviceReady;

  const { data, loading, error } = useDetail<Profile>("/api/spotify/me");
  // a profile fetched before disconnecting must not outlive the session
  const profile = connected ? data : null;
  const premium = profile?.product === "premium";
  const { theme, setTheme } = useTheme();

  return (
    <section className="flex h-[132px] w-full shrink-0 items-start gap-[20px] border-b-[1.5px] border-rule bg-panel pl-[24px] pr-[56px] pt-[28px]">
      <span className="relative size-[76px] shrink-0 overflow-hidden rounded-pill bg-artwork">
        {profile?.avatar && (
          <Image
            src={profile.avatar}
            alt=""
            fill
            sizes="76px"
            className="object-cover"
            unoptimized
          />
        )}
      </span>

      <div className="flex min-w-0 flex-1 flex-col pt-[2px]">
        <p className="text-[8px] tracking-[0.9px] text-on-dark-muted">SPOTIFY 계정</p>
        <h1
          className="flex h-[36px] items-center truncate text-[30px] font-black tracking-[-1.1px] text-on-dark"
          title={profile?.name}
        >
          {!connected ? (
            "연결되지 않음"
          ) : profile ? (
            profile.name
          ) : loading ? (
            <LoadingDots size={6} label="계정 정보를 불러오는 중" />
          ) : (
            "Spotify 계정"
          )}
        </h1>
        <p className="mt-[6px] flex items-center gap-[10px] whitespace-nowrap text-[8px] text-on-dark-muted">
          {!connected ? (
            <span className="tracking-[0.3px]">
              Spotify를 연결하면 계정 정보가 보입니다
            </span>
          ) : (
            <>
              {profile?.product && (
                <span
                  className={`tracking-[0.8px] ${premium ? "font-black text-spotify" : ""}`}
                >
                  {profile.product.toUpperCase()}
                </span>
              )}
              <span className="tracking-[0.3px]">
                {!profile && !loading && error
                  ? error
                  : ready
                    ? "· Superlike Web Player 연결됨"
                    : "· Superlike Web Player 연결 중"}
              </span>
            </>
          )}
        </p>
      </div>

      {/* the system decides until a press: the pressed one is what the page shows now, chosen or not */}
      <div role="group" aria-label="화면 모드" className="mt-[2px] flex shrink-0 items-center gap-[6px]">
        {(
          [
            ["light", "라이트"],
            ["dark", "다크"],
          ] as const
        ).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            onClick={() => setTheme(mode)}
            aria-pressed={theme === mode}
            className={`flex h-[28px] shrink-0 cursor-pointer items-center whitespace-nowrap rounded-pill px-[16px] text-[9px] tracking-[0.6px] ${
              theme === mode
                ? "bg-paper-solid text-black"
                : "border-[1.5px] border-on-dark-muted text-on-dark-muted transition-colors hover:text-on-dark"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}
