"use client";

import { DetailShell } from "./detail-shell";

/**
 * A screen that exists but has nothing in it yet.
 *
 * Routed and reachable so the links that point here stop dead-ending on a 404,
 * and honest about being unbuilt rather than dressing up an empty page as a
 * finished one.
 */
export function Placeholder({
  eyebrow,
  title,
  subtitle,
  planned,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  /** what this screen is meant to hold, once it does */
  planned: string[];
}) {
  return (
    <DetailShell eyebrow={eyebrow} title={title} subtitle={subtitle}>
      <div className="flex w-full flex-1 flex-col items-start justify-center gap-[14px] py-[40px]">
        <p className="text-[13px] text-on-bright">준비 중인 화면입니다.</p>
        <ul className="flex flex-col gap-[6px]">
          {planned.map((line) => (
            <li
              key={line}
              className="flex items-center gap-[8px] text-[10px] text-on-bright-muted"
            >
              <span aria-hidden className="size-[4px] shrink-0 rounded-pill bg-muted" />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </DetailShell>
  );
}
