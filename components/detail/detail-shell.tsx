"use client";

import { useRouter } from "next/navigation";
import { LoadingDots } from "@/components/ui/loading-dots";

/**
 * The frame every detail screen shares: a back control, a title, and the body.
 *
 * Back is the browser's own history, so the hardware/gesture back button and
 * this control do the same thing — the screens are real routes now.
 */
export function DetailShell({
  eyebrow,
  title,
  subtitle,
  aside,
  children,
}: {
  eyebrow: string;
  /** a node, so a screen still loading can hand over the wave of dots */
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  aside?: React.ReactNode;
  children: React.ReactNode;
}) {
  const router = useRouter();

  return (
    <section className="flex min-h-full flex-1 flex-col gap-[12px] bg-chart p-[16px]">
      <div className="flex w-full shrink-0 items-start justify-between gap-[12px]">
        <div className="flex min-w-0 shrink flex-col gap-px">
          <p className="truncate text-[8px] tracking-[0.9px] text-on-bright-muted">
            {eyebrow}
          </p>
          <h2
            className="truncate text-[26px] font-black tracking-[-1px]"
            title={typeof title === "string" ? title : undefined}
          >
            {title}
          </h2>
          {subtitle && (
            <div className="truncate text-[9px] tracking-[0.4px] text-on-bright-muted">
              {subtitle}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-[6px]">
          {aside}
          <button
            type="button"
            onClick={() => router.back()}
            title="돌아가기"
            className="flex shrink-0 items-center gap-[6px] whitespace-nowrap rounded-pill bg-paper px-[12px] py-[6px] text-[8px] tracking-[0.7px] transition-colors enabled:hover:bg-gold rule"
          >
            <span aria-hidden>←</span>
            뒤로
          </button>
        </div>
      </div>

      {children}
    </section>
  );
}

/** Shared empty / loading / error line, so the three screens read alike. */
export function DetailStatus({ loading, error }: { loading: boolean; error: string | null }) {
  if (!loading && !error) return null;
  return (
    <p className="flex shrink-0 items-center gap-[8px] text-[10px] tracking-[0.5px] text-on-bright-muted">
      {error ?? (
        <>
          불러오는 중
          <LoadingDots size={4} />
        </>
      )}
    </p>
  );
}
