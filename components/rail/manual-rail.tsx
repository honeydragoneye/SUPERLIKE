"use client";

import { useEffect, useState } from "react";
import { MANUAL } from "@/components/manual/content";
import { RailLabel, RailShell } from "./rail-shell";

/**
 * Beside the manual: its table of contents, with the section being read marked.
 *
 * The reading position comes from where the sections are on screen, not from a
 * click, so scrolling by wheel, by key or by the browser's find all move it. A
 * section counts as read once its title has passed the line under the action
 * bar; the last one passed is the current one.
 */
export function ManualRail() {
  const [active, setActive] = useState(MANUAL[0].id);

  useEffect(() => {
    // the line a title crosses to count: just under the action bar, with a little room
    const LINE = 120;
    let frame = 0;
    const update = () => {
      frame = 0;
      let current = MANUAL[0].id;
      for (const s of MANUAL) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= LINE) current = s.id;
      }
      // at the very bottom the last section may never reach the line
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = MANUAL[MANUAL.length - 1].id;
      }
      setActive(current);
    };
    const queue = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", queue, { passive: true });
    window.addEventListener("resize", queue);
    return () => {
      window.removeEventListener("scroll", queue);
      window.removeEventListener("resize", queue);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);

  const go = (id: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${id}`);
  };

  return (
    <RailShell>
      <RailLabel>CONTENTS</RailLabel>
      <nav aria-label="목차" className="flex flex-col gap-[2px]">
        {MANUAL.map((s, i) => {
          const on = s.id === active;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              onClick={go(s.id)}
              aria-current={on ? "location" : undefined}
              className={`flex items-center gap-[10px] rounded-[6px] px-[10px] py-[8px] text-[13px] transition-colors ${
                on ? "bg-accent-bright/12 font-black text-on-bright" : "text-on-bright-muted hover:bg-soft"
              }`}
            >
              <span className={`text-[10px] font-black ${on ? "text-accent-bright" : "text-on-bright-muted"}`}>
                {String(i + 1).padStart(2, "0")}
              </span>
              {s.title}
            </a>
          );
        })}
      </nav>
      <p className="pt-[4px] text-[10px] leading-[16px] text-on-bright-muted">
        스크롤하면 읽고 있는 절이 파랗게 표시되고, 누르면 그 절로 이동합니다.
      </p>
    </RailShell>
  );
}
