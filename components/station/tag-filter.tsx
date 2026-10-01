"use client";

import { useSpotify } from "@/components/player/spotify-provider";
import type { FilterKind } from "@/lib/station/filter";

const OPTIONS: { key: FilterKind; label: string; hint: string }[] = [
  { key: null, label: "전체", hint: "가사 여부를 가리지 않습니다" },
  { key: "instrumental", label: "가사 없음", hint: "LRCLIB이 연주곡으로 확인한 곡만" },
  { key: "lyrics", label: "가사 있음", hint: "LRCLIB에 가사가 있는 곡만" },
];

/**
 * The station's lyrics filter.
 *
 * Changing it rebuilds the upcoming queue and nothing else — the track playing
 * right now keeps playing, which is the behaviour the whole station is built
 * around. The rebuild happens in useStation; this is only the switch.
 */
export function TagFilter() {
  const { stationActive, stationFilter, setStationFilter, stationBusy, stationQueue } =
    useSpotify();

  return (
    <section className="flex h-full w-full flex-col gap-[12px] overflow-hidden bg-[#d9d9d9] p-[16px]">
      <div className="flex w-full shrink-0 flex-col gap-px">
        <h2 className="text-[19px] font-black tracking-[-0.4px] text-on-bright">TAGS</h2>
        <p className="text-[8px] tracking-[0.7px] text-on-bright-muted">
          다음 재생 목록만 다시 만듭니다
        </p>
      </div>

      <div className="flex w-full shrink-0 flex-col gap-[6px]">
        {OPTIONS.map(({ key, label, hint }) => {
          const on = stationFilter === key;
          return (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              title={stationActive ? hint : "스테이션을 먼저 시작해 주세요"}
              disabled={!stationActive || stationBusy !== null}
              onClick={() => void setStationFilter(key)}
              className={`w-full shrink-0 rounded-pill px-[14px] py-[8px] text-left text-[10px] tracking-[0.6px] transition-colors rule disabled:opacity-40 ${
                on ? "bg-ink text-paper-solid" : "bg-paper-solid text-ink enabled:hover:bg-gold"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>

      <p className="w-full shrink-0 text-[9px] leading-[13px] text-on-bright-muted">
        {!stationActive
          ? "스테이션이 실행 중일 때 사용할 수 있습니다."
          : stationBusy
            ? stationBusy
            : stationFilter === null
              ? `${stationQueue.length}곡 대기 중`
              : `조건에 맞는 ${stationQueue.length}곡 대기 중`}
      </p>

      {/* LRCLIB answers true / false / unknown, and unknown satisfies no filter */}
      {stationActive && stationFilter !== null && (
        <p className="w-full shrink-0 text-[8px] leading-[12px] text-on-bright-muted">
          가사 정보를 확인할 수 없는 곡은 제외됩니다.
        </p>
      )}
    </section>
  );
}
