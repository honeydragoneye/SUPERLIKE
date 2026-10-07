"use client";

import { useSpotify } from "@/components/player/spotify-provider";
import { useHydrated } from "@/components/ui/use-hydrated";
import {
  NO_FILTER,
  isFiltered,
  type LyricsKind,
  type StationFilter,
} from "@/lib/station/filter";

/**
 * One flat list rather than a group per dimension.
 *
 * The tags read as a single set the way a tag cloud does, and the type keeps
 * the one rule the layout no longer shows: 가사 없음 and 가사 있음 are two values
 * of one field, so selecting either releases the other and asking for both is
 * unrepresentable.
 */
const TAGS: { label: string; hint: string; key: keyof StationFilter }[] = [
  { label: "가사 없음", hint: "LRCLIB이 연주곡으로 확인한 곡만", key: "lyrics" },
  { label: "가사 있음", hint: "LRCLIB에 가사가 있는 곡만", key: "lyrics" },
  { label: "CLEAN", hint: "No explicit.", key: "clean" },
];

const LYRICS_OF: Record<string, LyricsKind> = {
  "가사 없음": "instrumental",
  "가사 있음": "lyrics",
};

/** One empty array, so a blank render costs no re-render. */
const NOTHING: never[] = [];

const PILL =
  "shrink-0 rounded-pill px-[14px] py-[8px] text-[10px] tracking-[0.6px] transition-colors rule disabled:opacity-40";

/**
 * The station's tags.
 *
 * Changing them rebuilds the upcoming queue and nothing else — the track
 * playing right now keeps playing, which is the behaviour the whole station is
 * built around. The rebuild happens in useStation; this is only the switch.
 */
export function TagFilter() {
  const {
    stationActive: running,
    stationFilter: selected,
    setStationFilter,
    stationBusy: busy,
    stationQueue: upcoming,
  } = useSpotify();

  /**
   * Browser-only knowledge, held back until React has finished comparing this
   * subtree against the server HTML. Gated here rather than in the provider,
   * which sits outside the Suspense boundary and opens before this is hydrated.
   */
  const hydrated = useHydrated();
  const stationActive = hydrated && running;
  const stationFilter = hydrated ? selected : NO_FILTER;
  const stationBusy = hydrated ? busy : null;
  const stationQueue = hydrated ? upcoming : NOTHING;

  const locked = !stationActive || stationBusy !== null;
  const on = (t: (typeof TAGS)[number]) =>
    t.key === "clean" ? stationFilter.clean : stationFilter.lyrics === LYRICS_OF[t.label];

  /** Selecting the tag already on releases it, the way a tag list should. */
  const toggle = (t: (typeof TAGS)[number]): StationFilter =>
    t.key === "clean"
      ? { ...stationFilter, clean: !stationFilter.clean }
      : { ...stationFilter, lyrics: on(t) ? null : LYRICS_OF[t.label] };

  return (
    <section className="flex h-full w-full flex-col gap-[12px] overflow-hidden bg-[#d9d9d9] p-[16px]">
      <div className="flex w-full shrink-0 flex-col gap-px">
        <h2 className="text-[19px] font-black tracking-[-0.4px] text-on-bright">TAGS</h2>
        <p className="text-[8px] tracking-[0.7px] text-on-bright-muted">
          다음 재생 목록만 다시 만듭니다
        </p>
      </div>

      <div className="flex w-full shrink-0 flex-wrap gap-[6px]">
        {/* an action, not a tag: it holds no value, it returns them all to none */}
        <button
          type="button"
          title={
            stationActive ? "선택한 태그 모두 끄기" : "스테이션을 먼저 시작해 주세요"
          }
          disabled={locked || !isFiltered(stationFilter)}
          onClick={() => void setStationFilter(NO_FILTER)}
          className={`${PILL} bg-ink text-paper-solid enabled:hover:bg-pink-bright`}
        >
          해제
        </button>

        {TAGS.map((t) => (
          <button
            key={t.label}
            type="button"
            aria-pressed={on(t)}
            title={stationActive ? t.hint : "스테이션을 먼저 시작해 주세요"}
            disabled={locked}
            onClick={() => void setStationFilter(toggle(t))}
            className={`${PILL} ${
              on(t)
                ? "bg-ink text-paper-solid"
                : "bg-paper-solid text-ink enabled:hover:bg-gold"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="w-full shrink-0 text-[9px] leading-[13px] text-on-bright-muted">
        {!stationActive
          ? "스테이션이 실행 중일 때 사용할 수 있습니다."
          : stationBusy
            ? stationBusy
            : isFiltered(stationFilter)
              ? `조건에 맞는 ${stationQueue.length}곡 대기 중`
              : `${stationQueue.length}곡 대기 중`}
      </p>

      {/* LRCLIB answers true / false / unknown, and unknown satisfies no filter.
          19금 needs no such note: Spotify sends `explicit` on every track. */}
      {stationActive && stationFilter.lyrics !== null && (
        <p className="w-full shrink-0 text-[8px] leading-[12px] text-on-bright-muted">
          가사 정보를 확인할 수 없는 곡은 제외됩니다.
        </p>
      )}
    </section>
  );
}
