"use client";

import { useState } from "react";
import { DetailShell } from "./detail-shell";

/** What the mail is, in three lines: shown under the signup form here, and in the rail beside the mail archive. */
export const MAIL_STEPS = [
  "매주 금요일 아침, 이번 주 들은 앨범 한 장이 메일로 와요",
  "메일마다 디자인 컨셉이 바뀌어요 (A\u00a0SIDE · LINER\u00a0NOTES · SPOTLIGHT · NIGHT\u00a0SHIFT)",
  "이 페이지에서 지난 호를 언제든 다시 볼 수 있어요",
];

function HowItWorks() {
  return (
    <section className="flex w-full flex-col gap-[18px] pt-[12px]">
      <h3 className="text-[11px] tracking-[0.8px] text-accent-bright">이렇게 와요</h3>
      <ol className="flex max-w-[600px] flex-col gap-[14px]">
        {MAIL_STEPS.map((step, i) => (
          <li key={step} className="flex items-start gap-[14px]">
            <span className="flex size-[26px] shrink-0 items-center justify-center rounded-full bg-ink text-[12px] font-bold text-paper-solid">{i + 1}</span>
            <span className="text-[14px] leading-[22px]">{step}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

export type Phase = "idle" | "busy" | "done" | "error";

export const MESSAGE: Record<string, string> = {
  mailed: "확인 메일을 보냈습니다. 메일의 링크를 열면 구독이 시작됩니다.",
  already: "이미 구독 중인 주소입니다.",
  wait: "방금 확인 메일을 보냈습니다. 1분 뒤에 다시 시도해 주세요.",
  bad_email: "이메일 주소 형식을 확인해 주세요.",
  bad_nickname: "닉네임은 1~20자로 적어 주세요.",
  mail_off: "메일 발송이 아직 설정되지 않았습니다.",
  database_off: "저장소가 설정되지 않았습니다.",
};

export async function post(body: unknown): Promise<{ ok: boolean; key: string }> {
  try {
    const res = await fetch("/api/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => ({}))) as { result?: string; error?: string };
    return { ok: res.ok, key: json.result ?? json.error ?? "failed" };
  } catch {
    return { ok: false, key: "failed" };
  }
}

/** The button a mailed link lands on: a click, not the page load, does the work. */
function Settle({ token, action }: { token: string; action: "confirm" | "unsubscribe" }) {
  const [phase, setPhase] = useState<Phase>("idle");
  const confirm = action === "confirm";
  const run = async () => {
    setPhase("busy");
    const { ok } = await post({ token, action });
    setPhase(ok ? "done" : "error");
  };

  return (
    <div className="flex flex-col items-start gap-[12px]">
      <p className="text-[13px] text-on-bright">
        {phase === "done"
          ? confirm
            ? "구독이 시작되었습니다. 매주 금요일에 만나요."
            : "구독을 해지했습니다. 더 이상 메일을 보내지 않습니다."
          : phase === "error"
            ? "처리하지 못했습니다. 링크가 오래되었거나 이미 처리되었을 수 있습니다."
            : confirm
              ? "버튼을 누르면 구독이 시작됩니다."
              : "버튼을 누르면 더 이상 메일을 보내지 않습니다."}
      </p>
      {phase !== "done" && (
        <button
          type="button"
          onClick={run}
          disabled={phase === "busy"}
          className="rounded-pill bg-ink px-[16px] py-[8px] text-[10px] tracking-[0.7px] text-paper-solid disabled:opacity-50"
        >
          {confirm ? "구독 확인" : "구독 해지"}
        </button>
      )}
    </div>
  );
}

function Form() {
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [note, setNote] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhase("busy");
    const { ok, key } = await post({ email, nickname });
    setNote(MESSAGE[key] ?? "보내지 못했습니다. 잠시 뒤에 다시 시도해 주세요.");
    setPhase(ok ? "done" : "error");
  };

  return (
    <form onSubmit={submit} className="flex w-full max-w-[420px] flex-col gap-[10px]">
      <label className="flex flex-col gap-[6px]">
        <span className="text-[8px] tracking-[0.9px] text-on-bright-muted">닉네임</span>
        <input
          type="text"
          required
          maxLength={20}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="메일에서 이렇게 불러 드려요"
          className="rounded-pill bg-paper px-[16px] py-[10px] text-[12px] outline-none rule"
        />
      </label>
      <label className="flex flex-col gap-[6px]">
        <span className="text-[8px] tracking-[0.9px] text-on-bright-muted">이메일</span>
        <input
          type="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="rounded-pill bg-paper px-[16px] py-[10px] text-[12px] outline-none rule"
        />
      </label>
      <button
        type="submit"
        disabled={phase === "busy"}
        className="self-start rounded-pill bg-ink px-[16px] py-[8px] text-[10px] tracking-[0.7px] text-paper-solid disabled:opacity-50"
      >
        {phase === "busy" ? "보내는 중…" : "신청하기"}
      </button>
      <p role="status" className="min-h-[16px] text-[10px] text-on-bright-muted">
        {note}
      </p>
    </form>
  );
}

/**
 * Stay Connected: the signup form, and the two buttons the mailed links open
 * (?confirm=<token> and ?unsubscribe=<token>).
 */
export function SubscribePage({ confirm, unsubscribe }: { confirm?: string; unsubscribe?: string }) {
  return (
    <DetailShell eyebrow="SUBSCRIBE" title="신청하기" subtitle="매주 금요일, 용눈이가 고른 앨범 이야기 · 무료 · 언제든 해지">
      <div className="flex w-full flex-1 flex-col items-start justify-start gap-[14px] py-[24px]">
        {confirm ? (
          <Settle token={confirm} action="confirm" />
        ) : unsubscribe ? (
          <Settle token={unsubscribe} action="unsubscribe" />
        ) : (
          <>
            <Form />
            <HowItWorks />
          </>
        )}
      </div>
    </DetailShell>
  );
}
