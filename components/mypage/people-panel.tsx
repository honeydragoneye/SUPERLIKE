"use client";

import { usePeopleState } from "@/components/people/people-store";
import { PersonRow, personNote } from "./side-panels";

/** The people who follow the listener, or whom the listener follows, in the column on the right of the mypage. */
export function PeoplePanel({ tab, onTab, onClose }: { tab: "followers" | "people"; onTab: (tab: "followers" | "people") => void; onClose: () => void }) {
  const { people, status } = usePeopleState();
  const followers = people.filter((p) => p.followsMe);
  const following = people.filter((p) => p.following);
  const list = tab === "followers" ? followers : following;

  return (
    <section
      aria-label={tab === "followers" ? "나를 팔로우하는 사람" : "내가 팔로우하는 사람"}
      className="sticky top-0 flex max-h-[calc(100dvh/var(--z)-290px)] min-h-[355px] w-full flex-col gap-[14px] overflow-y-auto px-[24px] pb-[24px] pt-[20px]"
    >
      <div className="flex w-full shrink-0 items-start justify-between gap-[12px]">
        <div className="flex gap-[6px]" role="tablist">
          {(
            [
              ["followers", `팔로워 ${followers.length}`],
              ["people", `팔로잉 ${following.length}`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => onTab(key)}
              className={`cursor-pointer whitespace-nowrap rounded-pill px-[14px] py-[7px] text-[9px] font-black tracking-[0.5px] transition-colors border-[1.5px] border-transparent ${
                tab === key ? "bg-ink text-on-ink" : "bg-paper hover:bg-soft"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 cursor-pointer whitespace-nowrap pt-[8px] text-[8px] tracking-[0.7px] transition-colors hover:text-accent-bright"
        >
          닫기 ✕
        </button>
      </div>

      {list.length === 0 ? (
        <p className="text-[10px] leading-[16px] tracking-[0.5px] text-on-bright-muted">
          {status === "loading"
            ? "불러오는 중"
            : tab === "followers"
              ? "아직 나를 팔로우한 사람이 없어요."
              : "아직 팔로우한 사람이 없어요. 함께 듣는 사람에서 팔로우할 수 있어요."}
        </p>
      ) : (
        <ul className="flex w-full shrink-0 flex-col border-t-[1.5px] border-rule">
          {list.map((p) => (
            <PersonRow
              key={p.id}
              p={p}
              note={p.following && p.followsMe ? "서로 팔로우" : tab === "followers" ? personNote(p) : p.followsMe ? "서로 팔로우" : personNote(p)}
            />
          ))}
        </ul>
      )}
      <p className="text-[8.5px] leading-[14px] tracking-[0.3px] text-on-bright-muted">팔로우를 취소하면 그 사람의 곡은 더 이상 보이지 않아요.</p>
    </section>
  );
}
