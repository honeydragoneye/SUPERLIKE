"use client";

import { openRadioPopover } from "@/components/radio/open-popover";
import { useRadio, type FavoriteStation } from "@/components/radio/radio-provider";
import { StationLogo } from "@/components/radio/station-parts";
import { useSpotify } from "@/components/player/spotify-provider";
import { useHydrated } from "@/components/ui/use-hydrated";
import { playedAgo } from "@/lib/time";
import { SectionHead } from "./section-head";

/** What one account may keep (lib/db/radio FAVORITE_LIMIT), shown beside the count. */
const LIMIT = 100;

const meta = (s: FavoriteStation) => [s.countryCode, ...s.tags.slice(0, 2)].filter(Boolean).join(" · ");

/**
 * 라디오: the stations this account hearted, the one heard last first.
 *
 * Playing stays on the ON AIR bar; this is where the list is looked after —
 * a station's own site, taking it off the list, and finding others.
 */
export function RadioManager() {
  const { connected: session } = useSpotify();
  /** browser-only knowledge, held back until hydration is done (see PlaylistManager) */
  const connected = useHydrated() && session;
  const { favorites, current, status, toggleFavorite, favoriteError } = useRadio();

  return (
    <section className="flex w-full shrink-0 flex-col gap-[16px] bg-chart px-[24px] pb-[24px] pt-[20px]">
      <SectionHead title="라디오" hint="즐겨찾기한 방송국 · 최근에 들은 순 · 방송국 정보는 Radio Browser 기준">
        {connected && (
          <>
            <span className="tnum text-[9px] tracking-[0.8px] text-on-bright-muted">
              {favorites.length} / {LIMIT}
            </span>
            <button
              type="button"
              onClick={(e) => openRadioPopover(e.currentTarget)}
              className="cursor-pointer whitespace-nowrap rounded-pill bg-ink px-[12px] py-[6px] text-[8px] tracking-[0.7px] text-on-ink transition-colors hover:bg-accent-bright hover:text-paper-solid"
            >
              다른 방송국 찾기
            </button>
          </>
        )}
      </SectionHead>

      {!connected ? (
        <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">
          Spotify를 연결하면 방송국을 즐겨찾기하고 여기서 관리할 수 있습니다.
        </p>
      ) : (
        <>
          {favoriteError && <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">{favoriteError}</p>}
          {favorites.length === 0 ? (
            <p className="text-[10px] tracking-[0.5px] text-on-bright-muted">
              아직 즐겨찾기한 방송국이 없습니다. ON AIR 바의 ‘다른 방송국’에서 하트를 눌러 담아 보세요.
            </p>
          ) : (
            <ul className="flex w-full flex-col">
              <li className="flex items-center gap-[12px] pb-[6px] text-[8px] tracking-[0.8px] text-on-bright-muted rule-b">
                <span className="w-[40px] shrink-0" />
                <span className="min-w-0 flex-1">방송국</span>
                <span className="w-[190px] shrink-0">나라 · 장르</span>
                <span className="w-[130px] shrink-0">마지막 청취</span>
                <span className="w-[210px] shrink-0" />
              </li>
              {favorites.map((s) => {
                const on = current?.uuid === s.uuid && status === "playing";
                return (
                  <li key={s.uuid} className="flex h-[58px] items-center gap-[12px] rule-b">
                    <StationLogo station={s} size={40} />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{s.name}</span>
                    <span className="w-[190px] shrink-0 truncate text-[10px] text-on-bright-muted">{meta(s)}</span>
                    <span className="flex w-[130px] shrink-0 items-center gap-[6px] text-[10px]">
                      {on ? (
                        <>
                          <span aria-hidden className="size-[6px] shrink-0 rounded-full bg-live" />
                          지금 재생 중
                        </>
                      ) : (
                        <span className="text-on-bright-muted">
                          {s.lastPlayedAt ? playedAgo(new Date(s.lastPlayedAt).toISOString()) : "아직 안 들음"}
                        </span>
                      )}
                    </span>
                    <span className="flex w-[210px] shrink-0 items-center justify-end gap-[8px]">
                      {s.homepage ? (
                        <a
                          href={s.homepage}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="whitespace-nowrap rounded-pill bg-paper px-[12px] py-[6px] text-[8px] tracking-[0.7px] transition-colors hover:bg-soft rule"
                        >
                          공식 사이트 ↗
                        </a>
                      ) : (
                        <span
                          title="이 방송국은 공식 사이트 주소가 없어요"
                          className="whitespace-nowrap rounded-pill px-[12px] py-[6px] text-[8px] tracking-[0.7px] opacity-40 rule"
                        >
                          공식 사이트 ↗
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void toggleFavorite(s)}
                        className="cursor-pointer whitespace-nowrap rounded-pill bg-paper px-[12px] py-[6px] text-[8px] tracking-[0.7px] transition-colors hover:bg-soft rule"
                      >
                        즐겨찾기 해제
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
