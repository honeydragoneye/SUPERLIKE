"use client";

import { useState } from "react";
import { MESSAGE, post, type Phase } from "@/components/detail/subscribe-page";
import { StayConnected } from "@/components/right-rail";

const STEPS = [
  "매주 금요일 아침, 이번 주 들은 앨범 한 장이 메일로 와요",
  "메일마다 디자인 컨셉이 바뀌어요 (A SIDE · LINER NOTES · SPOTLIGHT · NIGHT SHIFT)",
  "이 페이지에서 지난 호를 언제든 다시 볼 수 있어요",
];

function Field({
  label,
  invalid,
  ...input
}: { label: string; invalid: boolean } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-[6px]">
      <span className="text-[8px] tracking-[0.9px] text-on-bright-muted">{label}</span>
      <input
        {...input}
        className={`rounded-pill bg-paper-solid px-[16px] py-[10px] text-[11px] outline-none disabled:opacity-55 ${invalid ? "border-[1.5px] border-alert" : "rule"}`}
      />
    </label>
  );
}

/** The signup form the card opens: the same request as /subscribe, so the confirmation mail follows. */
function Form() {
  const [email, setEmail] = useState("");
  const [nickname, setNickname] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [key, setKey] = useState("");
  const [note, setNote] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPhase("busy");
    const sent = await post({ email, nickname });
    setKey(sent.key);
    setNote(MESSAGE[sent.key] ?? "보내지 못했습니다. 잠시 뒤에 다시 시도해 주세요.");
    setPhase(sent.ok ? "done" : "error");
  };
  const done = phase === "done";
  const error = phase === "error";

  return (
    <form onSubmit={submit} className="flex flex-col gap-[10px] p-[20px]">
      <h3 className="text-[8px] tracking-[0.8px] text-accent-bright">신청하기</h3>
      <Field
        label="닉네임"
        type="text"
        required
        maxLength={20}
        value={nickname}
        disabled={done}
        invalid={error && key === "bad_nickname"}
        onChange={(e) => setNickname(e.target.value)}
        placeholder="메일에서 이렇게 불러 드려요"
      />
      <Field
        label="이메일"
        type="email"
        required
        maxLength={254}
        value={email}
        disabled={done}
        invalid={error && key === "bad_email"}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
      />
      <button
        type="submit"
        disabled={phase === "busy" || done}
        className="self-start rounded-pill bg-ink px-[16px] py-[9px] text-[10px] tracking-[0.7px] text-paper-solid disabled:opacity-50"
      >
        {phase === "busy" ? "보내는 중…" : done ? "보냈어요 ✓" : "신청하기"}
      </button>
      <p role="status" className={`min-h-[16px] text-[10px] leading-[15px] ${error ? "text-alert" : "text-on-bright"}`}>
        {note}
      </p>
      <p className="text-[8px] leading-[12px] tracking-[0.4px] text-on-bright-muted">무료 · 언제든 해지 · 확인 메일의 링크를 눌러야 시작돼요</p>
    </form>
  );
}

/** The column beside the mail archive: the subscribe card, and under it either how the mail works or the signup form. */
export function IssuesRail() {
  const [open, setOpen] = useState(false);
  return (
    <div className="rail-scroll flex h-full flex-col bg-paper-solid">
      <StayConnected open={open} onSubscribe={() => setOpen((o) => !o)} />
      {open ? (
        <Form />
      ) : (
        <section className="flex flex-col gap-[10px] p-[20px]">
          <h3 className="text-[8px] tracking-[0.8px] text-accent-bright">이렇게 와요</h3>
          <ol className="flex flex-col gap-[10px]">
            {STEPS.map((s, i) => (
              <li key={s} className="flex items-start gap-[10px]">
                <span className="flex size-[18px] shrink-0 items-center justify-center rounded-full bg-ink text-[8px] font-bold text-paper-solid">{i + 1}</span>
                <span className="text-[9px] leading-[14px]">{s}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
