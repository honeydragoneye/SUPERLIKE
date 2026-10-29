"use client";

import { loadFollows, markRead, useFollowState } from "@/components/follow/follow-store";
import { checkedLabel, UpdateRow } from "@/components/follow/update-row";
import type { UpdateItem } from "@/lib/db/follows";

/** 이번 주 / 이전: the release's age in days, counted on Seoul's calendar. */
function weekOf(items: UpdateItem[]): { week: UpdateItem[]; before: UpdateItem[] } {
  const since = new Date(Date.now() - 7 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" });
  return {
    week: items.filter((i) => i.releaseDate >= since),
    before: items.filter((i) => i.releaseDate < since),
  };
}

/** 소식 in full, in the column on the right of the mypage. */
export function UpdatesPanel({ onClose }: { onClose: () => void }) {
  const { items, unread, artists, status, checkedAt, checkError } = useFollowState();
  const { week, before } = weekOf(items);
  const last = checkedLabel(checkedAt);

  const group = (label: string, list: UpdateItem[]) =>
    list.length > 0 && (
      <div className="flex flex-col gap-[2px]">
        <p className="pb-[4px] pt-[10px] text-[8px] tracking-[0.9px] text-on-bright-muted">{label}</p>
        <ul className="flex flex-col border-t-[1.5px] border-rule">
          {list.map((u) => (
            <div key={u.id} className="rule-b">
              <UpdateRow item={u} dark={false} />
            </div>
          ))}
        </ul>
      </div>
    );

  return (
    <section
      aria-label="소식"
      className="sticky top-0 flex max-h-[calc(100dvh-290px)] min-h-[355px] w-full flex-col gap-[10px] overflow-y-auto px-[24px] pb-[24px] pt-[20px]"
    >
      <div className="flex w-full shrink-0 items-start justify-between gap-[12px]">
        <div className="flex min-w-0 flex-col gap-px">
          <p className="text-[8px] tracking-[0.9px] text-on-bright-muted">UPDATES</p>
          <h2 className="truncate text-[19px] font-black tracking-[-0.4px]">소식</h2>
          <p className="truncate text-[9px] tracking-[0.4px] text-on-bright-muted">
            {unread > 0 ? `읽지 않은 소식 ${unread}개 · ` : ""}팔로우한 가수의 새 앨범
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="shrink-0 cursor-pointer whitespace-nowrap text-[8px] tracking-[0.7px] transition-colors hover:text-accent-bright"
        >
          닫기 ✕
        </button>
      </div>

      {items.length > 0 && (
        <button
          type="button"
          disabled={unread === 0}
          onClick={() => void markRead()}
          className="w-fit shrink-0 cursor-pointer whitespace-nowrap text-[8px] tracking-[0.7px] transition-colors enabled:hover:text-accent-bright disabled:cursor-default disabled:opacity-40"
        >
          모두 읽음으로
        </button>
      )}

      {items.length === 0 && (
        <p className="text-[10px] leading-[16px] tracking-[0.5px] text-on-bright-muted">
          {status === "loading"
            ? "불러오는 중"
            : artists.length === 0
              ? "팔로우한 가수가 없어요. 아티스트 페이지에서 팔로우하면 새 앨범을 알려 드려요."
              : `아직 새 앨범이 없어요.${last ? ` 마지막 확인 · ${last}` : ""}`}
        </p>
      )}

      {group("이번 주", week)}
      {group("이전", before)}

      {checkError && (
        <div className="flex items-center gap-[10px]">
          <p className="text-[10px] tracking-[0.5px] text-alert">새 소식을 다 확인하지 못했어요.</p>
          <button
            type="button"
            onClick={() => void loadFollows(true)}
            className="cursor-pointer whitespace-nowrap rounded-pill bg-paper px-[10px] py-[4px] text-[8px] tracking-[0.7px] rule"
          >
            다시 확인
          </button>
        </div>
      )}
    </section>
  );
}
