"use client";

import { useConnectDialog } from "@/components/player/connect-dialog";
import { useSpotify } from "@/components/player/spotify-provider";
import { showToast } from "@/components/ui/toast";
import { useHydrated } from "@/components/ui/use-hydrated";
import { lastPeopleFailure, setFollowingPerson } from "./people-store";

/**
 * "팔로우" / "팔로우 중 ✓" for another listener. The cursor on a followed
 * person says "팔로우 취소". Without a Spotify connection it opens the connect
 * step first, since a follow belongs to an account.
 */
export function PersonFollowButton({
  id,
  name,
  following,
  big = false,
  className = "",
  onChange,
}: {
  id: string;
  name: string;
  following: boolean;
  /** the profile's button, a size up from the one in a list */
  big?: boolean;
  className?: string;
  /** called once a follow or an unfollow has gone through */
  onChange?: () => void;
}) {
  const { connected: session } = useSpotify();
  const connected = useHydrated() && session;
  const { ask, dialog } = useConnectDialog();
  const on = connected && following;

  const press = async () => {
    if (!connected) return ask();
    if (on) {
      if (await setFollowingPerson(id, false)) {
        onChange?.();
        showToast(`${name}님 팔로우를 취소했어요`, { label: "다시 팔로우", run: () => void setFollowingPerson(id, true).then(() => onChange?.()) });
      } else showToast(lastPeopleFailure() ?? "팔로우를 취소하지 못했어요. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (await setFollowingPerson(id, true)) {
      onChange?.();
      showToast(`${name}님을 팔로우했어요`, { label: "실행 취소", run: () => void setFollowingPerson(id, false).then(() => onChange?.()) });
    } else showToast(lastPeopleFailure() ?? "팔로우하지 못했어요. 잠시 후 다시 시도해 주세요.");
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
        className={`group/follow shrink-0 cursor-pointer whitespace-nowrap rounded-pill tracking-[0.7px] transition-colors rule ${
          big ? "px-[18px] py-[9px] text-[10px]" : "px-[12px] py-[6px] text-[8px]"
        } ${on ? "bg-ink text-on-ink hover:bg-paper hover:text-ink" : "bg-paper hover:bg-soft"} ${className}`}
      >
        {on ? (
          <>
            <span className="group-hover/follow:hidden">✓ 팔로우 중</span>
            <span className="hidden group-hover/follow:inline">팔로우 취소</span>
          </>
        ) : (
          "팔로우"
        )}
      </button>
      {dialog}
    </>
  );
}
