"use client";

import { useState } from "react";
import { LoadingDots } from "@/components/ui/loading-dots";
import { useRadio, type RadioStation } from "./radio-provider";
import { HeartIcon, lastHeard, PlayPauseIcon, StationLogo } from "./station-parts";

type Tab = "rec" | "fav";

const meta = (s: RadioStation) => [s.countryCode, ...s.tags.slice(0, 2)].filter(Boolean).join(" · ");

/**
 * What "다른 방송국" opens: stations picked for the listener's taste, and the
 * ones they hearted to come back to. The bar above shows the one on.
 */
export function RadioPopover() {
  const radio = useRadio();
  const [tab, setTab] = useState<Tab>("rec");
  const { picks, favorites } = radio;

  const on = (s: RadioStation) => radio.current?.uuid === s.uuid && radio.status === "playing";

  return (
    <div
      role="dialog"
      aria-label="라디오"
      className="absolute right-0 top-[calc(100%+13px)] z-40 flex w-[440px] flex-col gap-[12px] rounded-[8px] bg-[#1f1f1f] p-[16px] text-on-dark shadow-[0_4px_20px_rgba(0,0,0,0.35)]"
    >
      <div className="flex items-center justify-between text-[10px]">
        <span>RADIO</span>
        <span className="text-on-dark-muted">Radio Browser 기준</span>
      </div>

      <div role="tablist" className="flex gap-[18px] border-b border-on-dark/20">
        {(
          [
            ["rec", "취향 추천", null],
            ["fav", "즐겨찾기", favorites.length],
          ] as const
        ).map(([key, label, count]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={`-mb-px flex cursor-pointer items-center gap-[5px] border-b-2 pb-[8px] text-[11px] transition-colors ${
              tab === key ? "border-on-dark font-black" : "border-transparent text-on-dark-muted hover:text-on-dark"
            }`}
          >
            {label}
            {count !== null && (
              <span className={`text-[9px] ${tab === key ? "text-[#9eb3ff]" : ""}`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      {tab === "rec" ? (
        <>
          {picks.tags.length > 0 && (
            <div className="flex items-center gap-[6px] text-[9px]">
              <span className="text-on-dark-muted">요즘 취향</span>
              {picks.tags.map((t) => (
                <span key={t} className="rounded-pill border border-on-dark/40 px-[8px] py-[3px]">
                  {t}
                </span>
              ))}
            </div>
          )}

          {picks.loading && (
            <p className="flex items-center gap-[8px] py-[18px] text-[10px] text-on-dark-muted">
              취향에 맞는 라디오를 찾는 중
              <LoadingDots size={4} />
            </p>
          )}
          {!picks.loading && picks.failed && (
            <p className="py-[18px] text-center text-[10px] text-on-dark-muted">추천을 불러오지 못했어요</p>
          )}
          {!picks.loading && !picks.failed && !picks.ready && (
            <p className="py-[18px] text-center text-[10px] leading-[16px] text-on-dark-muted">
              조금 더 들으면 취향에 맞는 라디오를 추천해요.
              <br />
              최근에 재생한 곡이 쌓이면 시작돼요.
            </p>
          )}
          {!picks.loading && picks.ready && picks.stations.length === 0 && (
            <p className="py-[18px] text-center text-[10px] text-on-dark-muted">맞는 방송국을 찾지 못했어요</p>
          )}

          {picks.stations.map((s) => (
            <Row key={s.uuid} station={s} sub={meta(s)} chip={s.matched?.length ? `${s.matched[0]} 일치` : null} />
          ))}
        </>
      ) : favorites.length === 0 ? (
        <div className="flex flex-col items-center gap-[10px] py-[26px]">
          <span className="flex size-[32px] items-center justify-center rounded-full border border-on-dark/40 text-heart">
            <HeartIcon filled={false} size={16} />
          </span>
          <p className="text-[12px] font-black">아직 즐겨찾기한 방송국이 없어요</p>
          <p className="text-center text-[9px] leading-[14px] text-on-dark-muted">
            방송국의 하트를 누르면 여기에 모여요.
            <br />
            다시 듣고 싶을 때 바로 틀 수 있어요.
          </p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between text-[9px] text-on-dark-muted">
            <span>내가 담은 방송국 · 최근에 들은 순</span>
            <span>하트를 다시 누르면 해제</span>
          </div>
          {favorites.map((s) => (
            <Row
              key={s.uuid}
              station={s}
              sub={`${[s.countryCode, s.tags[0]].filter(Boolean).join(" · ")} · ${on(s) ? "지금 듣는 중" : lastHeard(s.lastPlayedAt)}`}
              chip={null}
            />
          ))}
        </>
      )}

      {radio.favoriteError && <p className="text-[9px] text-[#ff9b9b]">{radio.favoriteError}</p>}

      <div className="flex items-center justify-between text-[8px] text-on-dark-muted">
        <span>{tab === "rec" ? "장르 태그와 인기순으로 골라요" : "즐겨찾기는 내 Superlike 계정에 저장돼요"}</span>
        {tab === "rec" && (
          <button
            type="button"
            onClick={() => void radio.refreshPicks()}
            className="cursor-pointer text-[9px] text-on-dark/90 transition-colors hover:text-on-dark"
          >
            ↻ 다시 추천
          </button>
        )}
      </div>
    </div>
  );
}

function Row({ station, sub, chip }: { station: RadioStation; sub: string; chip: string | null }) {
  const radio = useRadio();
  const playing = radio.current?.uuid === station.uuid && radio.status === "playing";
  const loading = radio.current?.uuid === station.uuid && radio.status === "loading";
  const faved = radio.isFavorite(station.uuid);
  // a station's address comes from a public directory: only a web address becomes a link
  const link = /^https?:\/\//i.test(station.homepage ?? "") ? station.homepage : null;

  return (
    <div className={`flex items-center gap-[10px] rounded-[6px] p-[10px] ${playing ? "bg-white/10" : ""}`}>
      <StationLogo station={station} />
      <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
        {link ? (
          <a
            href={link}
            target="_blank"
            rel="noopener noreferrer"
            title={`${station.name} 홈페이지 열기`}
            className={`truncate text-[12px] font-black underline-offset-2 hover:underline ${playing ? "text-[#9eb3ff]" : ""}`}
          >
            {station.name}
          </a>
        ) : (
          <span className={`truncate text-[12px] font-black ${playing ? "text-[#9eb3ff]" : ""}`}>{station.name}</span>
        )}
        <span className="truncate text-[9px] text-on-dark-muted">{sub}</span>
      </div>
      {chip && <span className="shrink-0 rounded-pill bg-accent-bright/45 px-[7px] py-[2px] text-[8px]">{chip}</span>}
      <button
        type="button"
        onClick={() => void radio.toggleFavorite(station)}
        aria-label={faved ? "즐겨찾기 해제" : "즐겨찾기"}
        aria-pressed={faved}
        className="flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-full border border-on-dark/40 text-heart transition-colors hover:bg-white/10"
      >
        <HeartIcon filled={faved} size={12} />
      </button>
      <button
        type="button"
        onClick={() => void radio.toggle(station)}
        aria-label={playing ? "일시정지" : "재생"}
        className={`flex size-[24px] shrink-0 cursor-pointer items-center justify-center rounded-full transition-opacity hover:opacity-80 ${
          playing ? "bg-accent-bright text-on-dark" : "bg-paper-solid text-black"
        }`}
      >
        {loading ? <LoadingDots size={3} /> : <PlayPauseIcon playing={playing} size={9} />}
      </button>
    </div>
  );
}
