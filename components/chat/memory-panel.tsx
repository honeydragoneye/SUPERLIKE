"use client";

import { useState } from "react";
import { forgetAll, forgetItems, setMemoryEnabled, dismissNotice, useMemoryState, type MemoryItem } from "@/components/memory/memory-store";
import { showToast } from "@/components/ui/toast";

const SECTIONS: { kind: MemoryItem["kind"]; label: string }[] = [
  { kind: "love", label: "취향 · 좋아해요" },
  { kind: "avoid", label: "취향 · 피해요" },
  { kind: "style", label: "말투" },
];

const BTN = "shrink-0 cursor-pointer whitespace-nowrap rounded-pill px-[12px] py-[6px] text-[8px] tracking-[0.6px] transition-colors border-[1.5px] border-transparent disabled:cursor-default disabled:opacity-40";

/** "11/02" in the listener's own clock. */
const day = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * Everything the chatbot remembers about the listener, over the top of the chat.
 *
 * The listener can read each line, take one away, switch remembering off, and clear it all. Switched off, it
 * stops learning and stops being read; what was already remembered stays until it is cleared.
 */
export function MemoryPanel({ onClose, popoverRef }: { onClose: () => void; popoverRef: React.RefObject<HTMLDivElement | null> }) {
  const { enabled, items } = useMemoryState();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  const flip = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await setMemoryEnabled(!enabled);
    setBusy(false);
    if (!ok) showToast("바꾸지 못했어요. 잠시 후 다시 시도해 주세요.");
  };
  const clear = async () => {
    setBusy(true);
    const ok = await forgetAll();
    setBusy(false);
    setConfirming(false);
    showToast(ok ? "기억을 모두 지웠어요" : "지우지 못했어요. 잠시 후 다시 시도해 주세요.");
  };
  const said = items.filter((i) => i.kind === "said");

  return (
    <div
      ref={popoverRef}
      role="dialog"
      aria-label="내가 기억하는 것"
      className="absolute inset-x-[16px] top-[58px] z-20 flex max-h-[calc(100%-74px)] flex-col gap-[12px] overflow-y-auto rounded-[10px] bg-card px-[14px] pb-[14px] pt-[14px] shadow-[0_6px_18px_rgba(0,0,0,0.18)]"
    >
      <div className="flex items-center justify-between gap-[8px]">
        <h3 className="text-[13px] font-black text-on-bright">내가 기억하는 것</h3>
        <button type="button" onClick={onClose} className="cursor-pointer text-[8px] tracking-[0.6px] text-on-bright-muted hover:text-on-bright">
          닫기 ✕
        </button>
      </div>

      <div className="flex items-center gap-[10px]">
        <div className="flex min-w-0 flex-1 flex-col gap-[2px]">
          <p className="text-[10px] font-black text-on-bright">기억하기</p>
          <p className="text-[8px] leading-[12px] text-on-bright-muted">
            {enabled ? "대화에서 알게 된 취향과 말투를 내 계정에 저장해요" : "꺼 두는 동안은 새로 기억하지 않아요"}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label="기억하기"
          disabled={busy}
          onClick={() => void flip()}
          className={`relative h-[20px] w-[36px] shrink-0 cursor-pointer rounded-pill transition-colors ${enabled ? "bg-live" : "bg-ink/25"}`}
        >
          <span className={`absolute top-[2px] size-[16px] rounded-pill bg-white transition-[left] ${enabled ? "left-[18px]" : "left-[2px]"}`} />
        </button>
      </div>

      <div className={`flex flex-col gap-[12px] ${enabled ? "" : "opacity-40"}`}>
        {items.length === 0 && (
          <p className="text-[9px] leading-[14px] text-on-bright-muted">
            아직 기억한 게 없어요. 대화하면서 좋아하는 음악이나 말투를 알게 되면 여기에 쌓여요.
          </p>
        )}
        {SECTIONS.map(({ kind, label }) => {
          const rows = items.filter((i) => i.kind === kind);
          return rows.length ? (
            <div key={kind} className="flex flex-col gap-[6px]">
              <p className="text-[8px] tracking-[0.6px] text-on-bright-muted">{label}</p>
              <div className="flex flex-wrap gap-[6px]">
                {rows.map((i) => (
                  <span key={i.id} className="flex items-center gap-[6px] rounded-pill bg-tag-blue px-[12px] py-[6px] text-[9px] text-ink">
                    {i.text}
                    <button type="button" aria-label={`${i.text} 지우기`} title="지우기" onClick={() => void forgetItems([i.id])} className="cursor-pointer text-[10px] leading-none opacity-60 hover:opacity-100">
                      ×
                    </button>
                  </span>
                ))}
              </div>
            </div>
          ) : null;
        })}
        {said.length > 0 && (
          <div className="flex flex-col gap-[6px]">
            <p className="text-[8px] tracking-[0.6px] text-on-bright-muted">내가 한 말</p>
            {said.map((i) => (
              <div key={i.id} className="flex items-center gap-[8px]">
                <div className="flex min-w-0 flex-1 flex-col gap-px">
                  <p className="text-[9px] font-bold leading-[13px] text-on-bright">{i.text}</p>
                  <p className="text-[8px] text-on-bright-muted">{day(i.at)} · 대화에서</p>
                </div>
                <button type="button" onClick={() => void forgetItems([i.id])} className="shrink-0 cursor-pointer text-[8px] text-on-bright-muted underline hover:text-on-bright">
                  지우기
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-col gap-[8px]">
        {confirming ? (
          <div className="flex flex-col gap-[8px] rounded-[10px] bg-chart p-[12px]">
            <p className="text-[11px] font-black text-on-bright">기억을 모두 지울까요?</p>
            <p className="text-[9px] leading-[14px] text-on-bright-muted">
              취향, 말투, 내가 한 말, 곡에 남긴 반응이 모두 사라지고 되돌릴 수 없어요. 대화 이력은 그대로 남아요.
            </p>
            <div className="flex gap-[6px]">
              <button type="button" disabled={busy} onClick={() => void clear()} className={`${BTN} bg-ink text-on-ink enabled:hover:bg-accent-bright enabled:hover:text-paper-solid`}>
                모두 지우기
              </button>
              <button type="button" disabled={busy} onClick={() => setConfirming(false)} className={`${BTN} bg-paper text-on-bright enabled:hover:bg-soft`}>
                취소
              </button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setConfirming(true)} className={`${BTN} w-fit bg-chart text-alert enabled:hover:bg-soft`}>
            모두 지우기
          </button>
        )}
        <p className="text-[8px] leading-[12px] text-on-bright-muted">
          이 내용은 내 계정에 저장되고, 대화할 때 챗봇이 읽어요. 질문은 Gemini로 전송돼요.
        </p>
      </div>
    </div>
  );
}

/** The first time it is on: what is remembered, where, and how to see it or turn it off. Dismissing it leaves memory on. */
export function MemoryNotice({ onOpen }: { onOpen: () => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="flex w-full shrink-0 flex-col gap-[8px] rounded-[10px] bg-card p-[12px]" role="region" aria-label="기억 안내">
      <p className="text-[11px] font-black text-on-bright">챗봇이 대화에서 내 취향을 기억해요</p>
      <p className="text-[9px] leading-[14px] text-on-bright-muted">
        좋아한다고 말한 음악, 건너뛴 곡, 말투를 내 계정에 저장해서 다음 대화에 써요.
      </p>
      <p className="text-[9px] leading-[14px] text-on-bright-muted">언제든 위의 ‘기억’에서 보고, 고치고, 지우거나 끌 수 있어요.</p>
      <div className="flex flex-wrap items-center gap-[6px]">
        <button type="button" onClick={() => void dismissNotice()} className={`${BTN} bg-ink text-on-ink hover:bg-accent-bright hover:text-paper-solid`}>
          알겠어요
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await setMemoryEnabled(false);
            setBusy(false);
          }}
          className={`${BTN} bg-chart text-on-bright enabled:hover:bg-soft`}
        >
          끄기
        </button>
        <button type="button" onClick={onOpen} className="cursor-pointer text-[8px] text-on-bright-muted underline hover:text-on-bright">
          무엇을 기억하나요?
        </button>
      </div>
    </div>
  );
}
