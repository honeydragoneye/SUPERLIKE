"use client";

import Link from "next/link";
import { useEffect } from "react";
import { useFollowState } from "@/components/follow/follow-store";
import { loadPeople, resetPeople, setShareActivity, usePeopleState } from "@/components/people/people-store";
import { PersonFollowButton } from "@/components/people/person-follow-button";
import { useSpotify } from "@/components/player/spotify-provider";
import { showToast } from "@/components/ui/toast";
import { useHydrated } from "@/components/ui/use-hydrated";

/**
 * The right-hand column: who follows whom and who else is here.
 *
 * With Spotify's development mode only a handful of accounts can sign in, so
 * the list is everyone else who has, and the follow is between them.
 */

/** Reads the people once there is an account, and lets go of them when it goes. Renders nothing. */
export function PeopleSync() {
  const { connected } = useSpotify();
  useEffect(() => {
    if (connected) void loadPeople();
    else resetPeople();
  }, [connected]);
  return null;
}

export type SidePanel = "followers" | "people" | "following" | "updates";

/**
 * Three counts, each of which opens its list in the panel below: 팔로워 (people
 * following the listener), 팔로잉 (people the listener follows) and 가수 (the
 * artists followed, which is what 팔로잉 used to count).
 */
export function FollowCounts({ open, onOpen }: { open: SidePanel | null; onOpen: (panel: SidePanel) => void }) {
  const { connected: session } = useSpotify();
  const connected = useHydrated() && session;
  const { artists } = useFollowState();
  const { people } = usePeopleState();
  const counts: { key: SidePanel; label: string; value: number; title: string }[] = [
    { key: "followers", label: "팔로워", value: connected ? people.filter((p) => p.followsMe).length : 0, title: "나를 팔로우하는 사람" },
    { key: "people", label: "팔로잉", value: connected ? people.filter((p) => p.following).length : 0, title: "내가 팔로우하는 사람" },
    { key: "following", label: "가수", value: connected ? artists.length : 0, title: "팔로우 중인 가수" },
  ];

  return (
    <dl className="grid h-[84px] w-full shrink-0 grid-cols-3 border-b-[1.5px] border-rule pl-[40px] pt-[20px]">
      {counts.map((c) => (
        <div key={c.key} className="flex flex-col gap-[4px]">
          <dt className={`whitespace-nowrap text-[9px] tracking-[0.8px] ${open === c.key ? "text-accent-bright" : "text-on-bright-muted"}`}>{c.label}</dt>
          <dd className="text-[29px] font-black leading-[34px] tracking-[-1px]">
            <button
              type="button"
              onClick={() => onOpen(c.key)}
              aria-pressed={open === c.key}
              title={c.title}
              className={`tnum cursor-pointer transition-colors hover:text-accent-bright ${open === c.key ? "text-accent-bright" : ""}`}
            >
              {c.value}
            </button>
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** What a person's line says under their name. */
export function personNote(p: { shared: boolean; following: boolean; recent: string | null; followsMe: boolean }): string {
  if (p.following) return p.shared ? (p.recent ? `최근 · ${p.recent}` : "아직 들은 곡이 없어요") : "활동 비공개";
  return p.followsMe ? "나를 팔로우해요" : "팔로우하면 활동을 볼 수 있어요";
}

/** The switch for letting followers see what the listener listens to. Off until it is turned on. */
function ShareSwitch() {
  const { share } = usePeopleState();
  const change = async () => {
    const on = !share;
    if (await setShareActivity(on)) {
      showToast(on ? "이제 나를 팔로우한 사람이 내 활동을 볼 수 있어요" : "내 활동을 숨겼어요");
    } else showToast("저장하지 못했어요. 잠시 후 다시 시도해 주세요.");
  };
  return (
    <div className="flex w-full shrink-0 flex-col gap-[8px] rounded-[8px] bg-chart p-[14px]">
      <div className="flex items-center justify-between gap-[12px]">
        <p className="text-[12px] font-black">내 활동 공개</p>
        <button
          type="button"
          role="switch"
          aria-checked={share}
          aria-label="내 활동 공개"
          onClick={() => void change()}
          className={`relative h-[24px] w-[44px] shrink-0 cursor-pointer rounded-pill transition-colors ${share ? "bg-accent-bright" : "bg-ink/25"}`}
        >
          <span className={`absolute top-[2px] size-[20px] rounded-pill bg-white shadow transition-[left] ${share ? "left-[22px]" : "left-[2px]"}`} />
        </button>
      </div>
    </div>
  );
}

/** A person: their name opens their page, and the button follows them. */
export function PersonRow({ p, note }: { p: { id: string; name: string; following: boolean }; note: React.ReactNode }) {
  return (
    <li className="flex h-[58px] items-center gap-[12px] rule-b">
      <Link href={`/user/${encodeURIComponent(p.id)}`} className="flex min-w-0 flex-1 items-center gap-[12px]">
        <span className="flex size-[40px] shrink-0 items-center justify-center rounded-pill bg-artwork text-[15px] font-black text-paper-solid">
          {p.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="flex min-w-0 flex-col gap-px">
          <span className="truncate text-[13px] hover:underline">{p.name}</span>
          <span className="truncate text-[9px] tracking-[0.4px] text-on-bright-muted">{note}</span>
        </span>
      </Link>
      <PersonFollowButton id={p.id} name={p.name} following={p.following} />
    </li>
  );
}

/** The other accounts on this app, and the switch for the listener's own activity. */
export function Listeners() {
  const { connected: session } = useSpotify();
  const connected = useHydrated() && session;
  const { people, status } = usePeopleState();

  return (
    <section className="flex min-h-[355px] w-full flex-1 flex-col gap-[16px] px-[24px] pb-[24px] pt-[20px]">
      <div className="flex min-w-0 flex-col gap-[4px]">
        <h2 className="whitespace-nowrap text-[13px] font-black tracking-[-0.3px]">함께 듣는 사람</h2>
        <p className="whitespace-nowrap text-[8px] tracking-[0.6px] text-on-bright-muted">
          이 앱에 로그인한 다른 사람 · {connected ? people.length : 0}명
        </p>
      </div>

      {!connected ? (
        <p className="text-[10px] leading-[16px] tracking-[0.5px] text-on-bright-muted">Spotify를 연결하면 함께 듣는 사람을 볼 수 있어요.</p>
      ) : people.length === 0 ? (
        <p className="text-[10px] leading-[16px] tracking-[0.5px] text-on-bright-muted">
          {status === "loading" ? "불러오는 중" : status === "error" ? "불러오지 못했어요" : "아직 함께 듣는 사람이 없습니다."}
        </p>
      ) : (
        <ul className="flex w-full shrink-0 flex-col border-t-[1.5px] border-rule">
          {people.map((p) => (
            <PersonRow key={p.id} p={p} note={personNote(p)} />
          ))}
        </ul>
      )}

      {connected && <ShareSwitch />}
    </section>
  );
}
