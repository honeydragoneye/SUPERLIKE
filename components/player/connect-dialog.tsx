"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** What Spotify is asked for, in the words of what it is used for. */
const USES: { title: string; note: string }[] = [
  { title: "재생 제어", note: "웹 플레이어로 곡을 틀고, 일시정지·이동·셔플·음량을 바꿔요" },
  { title: "최근 재생 기록", note: "홈의 취향과 주간 통계를 만드는 데만 써요" },
  { title: "계정 정보", note: "이름·이메일·구독 종류(Premium 여부)를 확인해요" },
];

function goToSpotify() {
  /**
   * A full navigation, not a router push.
   *
   * `/api/spotify/login` is not a page: it answers 302 to Spotify's own
   * accounts host to begin the OAuth handshake. The router cannot follow
   * a redirect off the application, so the lint rule's premise — that
   * this is an internal destination — does not hold here.
   */
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/api/spotify/login";
}

/**
 * The step in front of Spotify's own consent page: what the app will ask for and
 * what it will not, said before the listener is sent somewhere they cannot style.
 *
 * `ask()` opens it; the dialog is returned to be rendered next to the button, so
 * each place that connects keeps its own state and nothing lives in the provider.
 */
export function useConnectDialog(): { ask: () => void; dialog: ReactNode } {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const dialog = open
    ? createPortal(
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 px-[16px] pt-[12vh]"
          onPointerDown={(e) => e.target === e.currentTarget && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Spotify와 연결"
            className="flex max-h-[76vh] w-[440px] max-w-full flex-col gap-[16px] overflow-y-auto rounded-[10px] bg-[#1f1f1f] p-[24px] text-on-dark shadow-[0_16px_48px_rgba(0,0,0,0.5)]"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-on-dark/25 pb-[14px]">
              <h2 className="text-[17px] font-black">Spotify와 연결해요</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="닫기"
                className="cursor-pointer text-[13px] text-on-dark-muted transition-colors hover:text-on-dark"
              >
                ✕
              </button>
            </div>

            <p className="text-[11px] leading-[16px] text-on-dark-muted">
              Spotify 로그인 화면으로 넘어갔다가, ‘동의’를 누르면 이 페이지로 돌아와요.
            </p>

            <div className="flex flex-col gap-[12px]">
              <span className="text-[9px] text-on-dark-muted">이렇게 써요</span>
              {USES.map((u) => (
                <div key={u.title} className="flex items-center gap-[12px]">
                  <span className="flex size-[32px] shrink-0 items-center justify-center rounded-full bg-accent-bright/70" aria-hidden>
                    <span className="size-[8px] rounded-full bg-on-dark" />
                  </span>
                  <span className="flex min-w-0 flex-col gap-[2px]">
                    <span className="text-[13px]">{u.title}</span>
                    <span className="text-[9px] text-on-dark-muted">{u.note}</span>
                  </span>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-[4px] rounded-[8px] bg-white/6 px-[16px] py-[12px]">
              <span className="text-[11px]">✓ 내 Spotify 라이브러리와 플레이리스트는 읽지 않아요</span>
              <span className="text-[9px] text-on-dark-muted">좋아요와 만든 플레이리스트는 Superlike에만 저장돼요</span>
            </div>

            <p className="text-[9px] leading-[14px] text-on-dark-muted">
              재생은 Spotify Premium 계정에서 할 수 있어요. 연결은 Spotify 계정 설정에서 언제든 끊을 수 있어요.
            </p>

            <div className="flex justify-end gap-[8px]">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded-pill border border-on-dark/75 px-[16px] py-[8px] text-[10px] text-on-dark transition-colors hover:bg-white/10"
              >
                취소
              </button>
              <button
                type="button"
                autoFocus
                onClick={goToSpotify}
                className="cursor-pointer rounded-pill bg-paper-solid px-[16px] py-[8px] text-[10px] text-[#111] transition-opacity hover:opacity-80"
              >
                Spotify로 계속하기 →
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return { ask: () => setOpen(true), dialog };
}
