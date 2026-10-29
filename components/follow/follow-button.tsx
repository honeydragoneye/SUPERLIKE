"use client";

import { useConnectDialog } from "@/components/player/connect-dialog";
import { useSpotify } from "@/components/player/spotify-provider";
import { useHydrated } from "@/components/ui/use-hydrated";
import { showToast } from "@/components/ui/toast";
import { lastFailure, setFollowing, useFollowState, type FollowTarget } from "./follow-store";

/**
 * "+ 팔로우" / "✓ 팔로우 중" for an artist. Following is a press away; the
 * button says "팔로우 취소" while the cursor is on it. Without a Spotify
 * connection it opens the connect step first, since a follow belongs to an account.
 */
export function FollowButton({ artist, className = "" }: { artist: FollowTarget; className?: string }) {
  const { connected: session } = useSpotify();
  const hydrated = useHydrated();
  const connected = hydrated && session;
  const { artists } = useFollowState();
  const { ask, dialog } = useConnectDialog();
  const on = connected && artists.some((a) => a.id === artist.id);

  const press = async () => {
    if (!connected) return ask();
    if (on) {
      if (await setFollowing(artist, false)) {
        showToast(`${artist.name} 팔로우를 취소했어요`, {
          label: "다시 팔로우",
          run: () => void setFollowing(artist, true),
        });
      } else showToast(lastFailure() ?? "팔로우를 취소하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (await setFollowing(artist, true)) {
      showToast(`${artist.name}를 팔로우했어요 · 새 앨범이 나오면 마이페이지에서 알려 드려요`, {
        label: "실행 취소",
        run: () => void setFollowing(artist, false),
      });
    } else showToast(lastFailure() ?? "팔로우하지 못했어요. 잠시 후 다시 시도해 주세요.");
  };

  return (
    <>
      <button
        type="button"
        aria-pressed={on}
        onClick={(e) => {
          e.stopPropagation();
          void press();
        }}
        className={`group/follow shrink-0 cursor-pointer whitespace-nowrap rounded-pill px-[12px] py-[6px] text-[8px] tracking-[0.7px] transition-colors rule ${
          on ? "bg-ink text-on-ink hover:bg-paper hover:text-ink" : "bg-paper hover:bg-soft"
        } ${className}`}
      >
        {on ? (
          <>
            <span className="group-hover/follow:hidden">✓ 팔로우 중</span>
            <span className="hidden group-hover/follow:inline">팔로우 취소</span>
          </>
        ) : (
          "+ 팔로우"
        )}
      </button>
      {dialog}
    </>
  );
}
