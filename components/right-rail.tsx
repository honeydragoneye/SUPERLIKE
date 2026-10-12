import Link from "next/link";
import { Icon } from "./ui/icon";

/**
 * The rail's three blocks share the column height in their design proportions
 * (268 : 186 : 366). Growing them by the same factor keeps the rail's bottom
 * edge level with the Discover column at any window height.
 */

/** Editor's Pick vinyl: centre sits 52px in from the right edge, 46px down. */
const PICK_CENTRE = "absolute right-[52px] top-[46px] translate-x-1/2 -translate-y-1/2";

/** Portrait vinyl: dead centre of the artwork box, both axes. */
const PORTRAIT_CENTRE =
  "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2";

function EditorsPick() {
  return (
    <section className="relative min-h-0 flex-[268_0_268px] overflow-hidden bg-ink">
      {/* vinyl graphic, anchored to the right edge so it survives any width */}
      <Icon name="pick-disc" size={184} className={PICK_CENTRE} />
      <Icon name="pick-inner" size={74} className={PICK_CENTRE} />
      <Icon name="pick-spindle" size={20} className={PICK_CENTRE} />

      <p className="absolute left-[14px] top-[14px] whitespace-nowrap text-[8px] tracking-[0.9px] text-pink-bright">
        EDITOR&apos;S PICK
      </p>
      <h2 className="absolute bottom-[60px] left-[14px] whitespace-nowrap text-[32px] font-black leading-[32px] tracking-[-1.2px] text-on-dark">
        <Link href="/editors-pick" className="transition-colors hover:text-pink-bright">
          CITY POP
          <br />
          REVIVAL
        </Link>
      </h2>
      <p className="absolute bottom-[28px] left-[14px] whitespace-nowrap text-[9px] tracking-[0.3px] text-on-dark-muted">
        42 TRACKS · 2H 18M · 큐레이터 노트 포함
      </p>
      {/* opens the pick rather than playing it: there is no playlist behind
          the block yet, so the only honest thing a press can do is go and look */}
      <Link
        href="/editors-pick"
        aria-label="에디터스 픽 열기"
        title="에디터스 픽 열기"
        className="absolute bottom-[14px] right-[14px] flex size-[46px] items-center justify-center rounded-pill bg-pink transition-colors hover:bg-gold"
      >
        <Icon name="play-md" size={17} />
      </Link>
    </section>
  );
}

function StayConnected() {
  return (
    <section className="flex min-h-0 flex-[186_0_186px] flex-col gap-[10px] overflow-hidden bg-pink p-[16px]">
      <Link
        href="/subscribe"
        className="flex h-[36px] shrink-0 items-center gap-[8px] self-start rounded-pill bg-paper pl-[12px] pr-[14px] transition-colors hover:bg-gold rule"
      >
        <Icon name="mail" size={17} />
        <span className="whitespace-nowrap text-[12px]">신청하기</span>
      </Link>
      <h2 className="w-full text-[19px] font-black tracking-[-0.5px] text-on-bright">
        STAY CONNECTED
      </h2>
      <p className="w-full text-[10px] leading-[16px] text-on-bright">
        매주 금요일, 당신의 취향으로 고른 25곡을
        <br />
        메일로 먼저 보내드립니다.
      </p>
      <p className="w-full text-[8px] tracking-[0.7px] text-on-bright-muted">
        2.4M SUBSCRIBERS · 무료
      </p>
    </section>
  );
}

function ArtistOfTheWeek() {
  return (
    <section className="flex min-h-0 flex-[366_0_366px] flex-col gap-[10px] overflow-hidden bg-lime-soft p-[14px]">
      <p className="h-[10px] shrink-0 whitespace-nowrap text-[8px] leading-[10px] tracking-[1px] text-muted">
        ARTIST OF THE WEEK
      </p>

      {/* stays square while absorbing the block's slack: height comes from
          flex, width follows the ratio. 203×203 at the design height. */}
      <div className="relative aspect-square min-h-0 w-auto max-w-[302px] flex-1 self-center overflow-hidden rounded-[4px] bg-ink">
        <Icon name="portrait-disc" size={104} className={PORTRAIT_CENTRE} />
        <Icon name="portrait-ring" size={38} className={PORTRAIT_CENTRE} />
        <Icon name="portrait-hole" size={11} className={PORTRAIT_CENTRE} />
        <p className="absolute bottom-[12px] left-[12px] whitespace-nowrap text-[8px] tracking-[0.8px] text-on-dark-muted">
          LIVE SESSION
        </p>
      </div>

      <div className="flex h-[41px] w-full shrink-0 flex-col gap-[2px]">
        <h2 className="whitespace-nowrap text-[21px] font-black leading-[27px] tracking-[-0.7px]">
          <Link href="/weekly-artist" className="transition-colors hover:text-pink-bright">
            LUNA DRIFT
          </Link>
        </h2>
        <p className="w-full text-[9px] leading-[12px] text-muted">
          서울 기반 4인조. 시티팝과 앰비언트를 오간다.
        </p>
      </div>

      <div className="flex h-[13px] w-full shrink-0 items-center gap-[8px]">
        <span className="flex shrink-0 items-center gap-[2px]" aria-hidden>
          {Array.from({ length: 5 }, (_, i) => (
            <Icon key={i} name="star" size={13} />
          ))}
        </span>
        <p className="tnum whitespace-nowrap text-[8px] tracking-[0.6px] text-muted">
          4.8 · 128K RATINGS
        </p>
      </div>

      <div className="flex h-[31px] w-full shrink-0 items-center justify-between">
        <button
          type="button"
          className="flex h-[31px] shrink-0 items-center rounded-pill bg-ink px-[18px] text-[11px] leading-none tracking-[0.8px] text-paper"
        >
          FOLLOW
        </button>
      </div>
    </section>
  );
}

export function RightRail() {
  return (
    <div className="flex h-full flex-col overflow-hidden">
      <EditorsPick />
      <StayConnected />
      <ArtistOfTheWeek />
    </div>
  );
}
