"use client";

import { useEffect, useState } from "react";
import { useSpotify } from "@/components/player/spotify-provider";
import { useHydrated } from "@/components/ui/use-hydrated";
import { LoadingDots } from "@/components/ui/loading-dots";
import {
  NO_FILTER,
  isFiltered,
  type LyricsKind,
  type StationFilter,
} from "@/lib/station/filter";
import {
  CUSTOM_DEFINITION_MAX,
  CUSTOM_LABEL_MAX,
  MAX_CUSTOM_TAGS,
  addCustomTag,
  moodLabel,
  removeCustomTag,
} from "@/lib/station/custom-tags";
import { MOODS } from "@/lib/station/moods";
import { clearMood } from "@/lib/station/rejects";
import { useCustomTags } from "./use-custom-tags";
import { useRejectCount } from "./use-rejects";

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

/** "7sec" until a minute has passed, "1min 1sec" after. */
function clock(seconds: number): string {
  const min = Math.floor(seconds / 60);
  return min ? `${min}min ${seconds % 60}sec` : `${seconds}sec`;
}

/**
 * Time since this was put on screen.
 *
 * Mounted for as long as a build is running, so it counts one wait: 필터 적용 중
 * and the 큐 리필 중 that follows it are the same element and the same clock.
 */
function Elapsed() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      250,
    );
    return () => clearInterval(timer);
  }, []);
  return <span className="tabular-nums">{clock(seconds)}</span>;
}

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
    stationTags: genres,
    stationMoodError: moodFailure,
    stationMoodMs: moodWait,
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
  const stationTags = hydrated ? genres : NOTHING;
  const moodError = hydrated ? moodFailure : null;
  const moodMs = hydrated ? moodWait : null;
  const rejects = useRejectCount(stationFilter.mood);
  const custom = useCustomTags();

  // the form that writes a new tag: closed until + is pressed
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [meaning, setMeaning] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const submit = () => {
    const why = addCustomTag(name, meaning);
    setFormError(why);
    if (why) return;
    setName("");
    setMeaning("");
    setAdding(false);
  };

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

        {/* one value of one field, like the lyrics pair: picking a mood
            releases the one that was on */}
        {MOODS.map((m) => {
          const chosen = stationFilter.mood === m.key;
          return (
            <button
              key={m.key}
              type="button"
              aria-pressed={chosen}
              title={stationActive ? m.hint : "스테이션을 먼저 시작해 주세요"}
              disabled={locked}
              onClick={() =>
                void setStationFilter({ ...stationFilter, mood: chosen ? null : m.key })
              }
              className={`${PILL} ${
                chosen
                  ? "bg-ink text-paper-solid"
                  : "bg-paper-solid text-ink enabled:hover:bg-gold"
              }`}
            >
              {m.label}
            </button>
          );
        })}

        {/* the listener's own tags: the same field as the moods above, so
            one is picked at a time and Gemini judges it the same way. The ×
            is a second control beside the pill, not nested in it */}
        {custom.map((t) => {
          const chosen = stationFilter.mood === t.key;
          return (
            <span key={t.key} className="flex shrink-0 items-stretch">
              <button
                type="button"
                aria-pressed={chosen}
                title={stationActive ? t.definition : "스테이션을 먼저 시작해 주세요"}
                disabled={locked}
                onClick={() =>
                  void setStationFilter({ ...stationFilter, mood: chosen ? null : t.key })
                }
                className={`${PILL} rounded-r-none pr-[8px] ${
                  chosen
                    ? "bg-ink text-paper-solid"
                    : "bg-paper-solid text-ink enabled:hover:bg-gold"
                }`}
              >
                {t.label}
              </button>
              <button
                type="button"
                aria-label={`${t.label} 태그 삭제`}
                title="태그 삭제"
                disabled={stationBusy !== null}
                onClick={() => {
                  // a tag that is on cannot outlive its definition
                  if (chosen) void setStationFilter({ ...stationFilter, mood: null });
                  removeCustomTag(t.key);
                }}
                className={`${PILL} rounded-l-none px-[8px] ${
                  chosen
                    ? "bg-ink text-paper-solid"
                    : "bg-paper-solid text-on-bright-muted enabled:hover:text-ink"
                }`}
              >
                ×
              </button>
            </span>
          );
        })}

        {custom.length < MAX_CUSTOM_TAGS && !adding && (
          <button
            type="button"
            title={`내 태그 만들기 (${custom.length}/${MAX_CUSTOM_TAGS})`}
            onClick={() => setAdding(true)}
            className={`${PILL} bg-transparent text-ink hover:bg-gold`}
          >
            + 태그 추가
          </button>
        )}

        {/* the seed artist's own genres, so a station offers what it is made
            of rather than a fixed vocabulary. Nothing is shown when Last.fm
            has no tags for them — an empty slot would say less than nothing */}
        {stationTags.map((tag) => {
          const chosen = stationFilter.genre === tag;
          return (
            <button
              key={tag}
              type="button"
              aria-pressed={chosen}
              title={
                stationActive
                  ? `${tag} 곡으로 다음 목록 만들기`
                  : "스테이션을 먼저 시작해 주세요"
              }
              disabled={locked}
              onClick={() =>
                void setStationFilter({
                  ...stationFilter,
                  genre: chosen ? null : tag,
                })
              }
              className={`${PILL} ${
                chosen
                  ? "bg-ink text-paper-solid"
                  : "bg-paper-solid text-ink enabled:hover:bg-gold"
              }`}
            >
              {tag.toUpperCase()}
            </button>
          );
        })}
      </div>

      {adding && (
        <form
          className="flex w-full shrink-0 flex-col gap-[6px] rounded-[6px] bg-paper-solid p-[10px] rule"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <input
            autoFocus
            value={name}
            maxLength={CUSTOM_LABEL_MAX}
            onChange={(e) => setName(e.target.value)}
            placeholder="태그 이름 (예: 비 오는 날)"
            aria-label="태그 이름"
            className="rounded-[4px] bg-transparent px-[8px] py-[6px] text-[10px] tracking-[0.4px] text-ink outline-none rule placeholder:text-on-bright-muted"
          />
          <input
            value={meaning}
            maxLength={CUSTOM_DEFINITION_MAX}
            onChange={(e) => setMeaning(e.target.value)}
            placeholder="어떤 곡인지 한 줄로 (비우면 이름 그대로)"
            aria-label="태그 설명"
            className="rounded-[4px] bg-transparent px-[8px] py-[6px] text-[10px] tracking-[0.4px] text-ink outline-none rule placeholder:text-on-bright-muted"
          />
          {formError && (
            <p className="text-[8px] leading-[12px] text-on-bright-muted">{formError}</p>
          )}
          <div className="flex gap-[6px]">
            <button type="submit" className={`${PILL} bg-ink text-paper-solid hover:bg-pink-bright`}>
              추가
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setFormError(null);
              }}
              className={`${PILL} bg-paper-solid text-ink hover:bg-gold`}
            >
              취소
            </button>
          </div>
        </form>
      )}

      {/* same measure as the detail screens' 불러오는 중 line, so a wait looks
          the same wherever it happens */}
      <p className="flex w-full shrink-0 items-center gap-[8px] text-[10px] leading-[14px] tracking-[0.5px] text-on-bright-muted">
        {!stationActive
          ? "스테이션이 실행 중일 때 사용할 수 있습니다."
          : stationBusy
            ? <>
                {stationBusy}
                <LoadingDots size={4} label={stationBusy} />
                {/* only where the wait can be long: a mood build asks Gemini
                    and may walk every rung */}
                {stationFilter.mood !== null && <Elapsed />}
              </>
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

      {/* the one tag that is an estimate: Gemini reads a title and an artist,
          it does not hear the song. A failure gets its own line, because an
          empty queue otherwise reads as "nothing here is 경쾌" */}
      {stationActive && stationFilter.mood !== null && (
        <p className="w-full shrink-0 text-[8px] leading-[12px] text-on-bright-muted">
          {moodError
            ? `${moodError}. 분위기 태그를 껐다가 잠시 후 다시 켜 주세요.`
            : "분위기는 Gemini가 제목과 아티스트로 추정합니다. 판정하지 못한 곡은 제외됩니다."}
          {!moodError && !stationBusy && moodMs !== null &&
            ` 방금 Gemini 응답 대기 ${clock(Math.round(moodMs / 1000))}.`}
        </p>
      )}

      {/* what the listener has overruled Gemini on, and the way back: without
          it a mistaken 아님 would hide a track from this tag for good */}
      {stationActive && stationFilter.mood !== null && rejects > 0 && (
        <p className="flex w-full shrink-0 items-center gap-[8px] text-[8px] leading-[12px] text-on-bright-muted">
          {`${moodLabel(stationFilter.mood)} 태그에서 제외한 곡 ${rejects}곡`}
          <button
            type="button"
            title="이 태그에서 제외한 곡을 모두 다시 받습니다. 다음 리필부터 적용됩니다"
            onClick={() => stationFilter.mood && clearMood(stationFilter.mood)}
            className="cursor-pointer underline underline-offset-2 hover:text-ink"
          >
            되돌리기
          </button>
        </p>
      )}
    </section>
  );
}
