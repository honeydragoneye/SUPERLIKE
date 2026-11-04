"use client";

import { useEffect, useState } from "react";
import { useSpotify } from "@/components/player/spotify-provider";
import { useHydrated } from "@/components/ui/use-hydrated";
import type { MailCheck } from "@/lib/mail-check.mjs";
import { SectionHead } from "./section-head";

type Report = { at: string; checks: MailCheck[] };

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * 메일 발송 점검: the operator's own section, for the account named in
 * OWNER_SPOTIFY_ID.
 *
 * It asks the server whether this listener is that account and renders nothing
 * unless the answer is yes, so no one else sees it or learns it exists. The check
 * itself sends no mail and shows no key; it tells which connection the weekly
 * issue needs is broken and why. It runs where the site runs (Vercel's values);
 * the GitHub Actions values are checked by running weekly-issue with mode `check`.
 */
export function MailCheckPanel() {
  const { connected: session } = useSpotify();
  const connected = useHydrated() && session;
  const [allowed, setAllowed] = useState(false);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!connected) return;
    let live = true;
    fetch("/api/me/mail-check", { cache: "no-store" })
      .then((res) => live && setAllowed(res.ok))
      .catch(() => live && setAllowed(false));
    return () => {
      live = false;
    };
  }, [connected]);

  async function run() {
    setRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/me/mail-check", { method: "POST", cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setReport((await res.json()) as Report);
    } catch {
      setError("점검을 실행하지 못했어요. 잠시 뒤 다시 눌러 주세요.");
    } finally {
      setRunning(false);
    }
  }

  if (!connected || !allowed) return null;

  const failed = report?.checks.filter((c) => !c.ok).length ?? 0;

  return (
    <section className="flex w-full shrink-0 flex-col gap-[16px] bg-chart px-[24px] pb-[24px] pt-[20px]">
      <SectionHead title="메일 발송 점검" hint="주간 메일이 쓰는 연결만 확인해요 · 메일은 보내지 않고 키나 비밀번호는 화면에 나오지 않아요 · 운영자 계정에만 보여요">
        <span className="whitespace-nowrap rounded-pill bg-ink px-[10px] py-[4px] text-[8px] tracking-[0.7px] text-on-ink">운영자 전용</span>
      </SectionHead>

      <div className="flex w-full items-center gap-[12px]">
        <button
          type="button"
          disabled={running}
          onClick={() => void run()}
          className="cursor-pointer whitespace-nowrap rounded-pill bg-ink px-[14px] py-[8px] text-[9px] tracking-[0.7px] text-on-ink transition-colors enabled:hover:bg-accent-bright enabled:hover:text-paper-solid disabled:cursor-default disabled:opacity-60"
        >
          {running ? "점검 중…" : report ? "다시 점검" : "점검 시작"}
        </button>
        {report && (
          <span className="text-[9px] tracking-[0.5px] text-on-bright-muted">
            마지막 점검 {stamp(report.at)} · 통과 {report.checks.length - failed} · 실패 {failed}
          </span>
        )}
        {error && <span className="text-[9px] tracking-[0.5px] text-alert">{error}</span>}
      </div>

      {report && (
        <ul className="flex w-full flex-col">
          <li className="flex items-center gap-[12px] pb-[6px] text-[8px] tracking-[0.8px] text-on-bright-muted rule-b">
            <span className="w-[170px] shrink-0">항목</span>
            <span className="w-[56px] shrink-0">상태</span>
            <span className="min-w-0 flex-1">자세히</span>
            <span className="w-[48px] shrink-0 text-right">걸린 시간</span>
          </li>
          {report.checks.map((c) => (
            <li key={c.key} className="flex min-h-[44px] items-center gap-[12px] py-[6px] rule-b">
              <span className="w-[170px] shrink-0 text-[12px]">{c.label}</span>
              <span
                className={`w-[56px] shrink-0 rounded-pill py-[3px] text-center text-[8px] tracking-[0.6px] ${
                  c.ok ? "bg-accent text-paper-solid" : "bg-alert text-white"
                }`}
              >
                {c.ok ? "통과" : "실패"}
              </span>
              <span className={`min-w-0 flex-1 break-words text-[9px] leading-[14px] ${c.ok ? "text-on-bright-muted" : "text-alert"}`}>{c.detail}</span>
              <span className="tnum w-[48px] shrink-0 text-right text-[9px] text-on-bright-muted">{seconds(c.ms)}</span>
            </li>
          ))}
        </ul>
      )}

      <p className="text-[9px] leading-[14px] tracking-[0.3px] text-on-bright-muted">
        이 점검은 사이트가 배포된 곳에 넣은 값을 확인해요. 금요일 메일은 GitHub Secrets 값으로 돌아가므로, 그쪽은 GitHub의 Actions 탭에서 weekly-issue를 check로 실행해서 확인해요.
      </p>
    </section>
  );
}
