"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSpotify } from "./player/spotify-provider";
import { Icon } from "./ui/icon";
import { weekTheme } from "@/lib/week-theme";
import { useDetail } from "./detail/use-detail";
import type { EditorsPickData } from "./detail/editors-pick-page";
import type { WeeklyArtist } from "@/lib/db/weekly";

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
  // what the developer hearted last, from the database: the same for every visitor
  const { data, loading } = useDetail<EditorsPickData>("/api/editors-pick");
  const album = data?.album;
  const router = useRouter();
  const { play } = useSpotify();
  /**
   * Opens the album's page and starts it in the same press. The press is what
   * lets the browser start audio; without a connected player `play` answers
   * "unavailable" and the page the press opened is where the connection is asked for.
   */
  const open = () => {
    router.push("/editors-pick");
    if (!album) return;
    void play({
      contextUri: album.uri,
      tracks: album.tracks.map((t) => ({
        uri: t.uri,
        title: t.name,
        artist: t.artist,
        artwork: album.artwork,
        durationMs: t.durationMs,
      })),
    });
  };
  const palette = data?.palette ?? null;
  const title = album?.name ?? (loading ? "" : "아직 고른 앨범이 없습니다");
  const runtime = album?.tracks.reduce((sum, t) => sum + t.durationMs, 0) ?? 0;
  const minutes = Math.round(runtime / 60_000);

  return (
    <section
      className="relative min-h-0 flex-[0_0_268px] overflow-hidden bg-ink transition-colors duration-700"
      // the cover's own colour; the near-black stays until there is one
      style={palette ? { backgroundColor: palette.bg } : undefined}
    >
      {palette && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: `linear-gradient(150deg, transparent 30%, ${palette.bgDeep} 100%)` }}
        />
      )}

      {palette && album?.artwork ? (
        /* a record whose label is the cover, turning slowly; still for anyone who asked for less motion */
        <span className={`${PICK_CENTRE} block size-[184px]`}>
          <span
            aria-hidden
            className="relative block size-full rounded-full motion-safe:animate-[spin_28s_linear_infinite]"
            style={{
              background: `conic-gradient(from 20deg, rgba(255,255,255,0.22), transparent 22%, transparent 50%, rgba(255,255,255,0.14) 72%, transparent), repeating-radial-gradient(circle at center, rgba(0,0,0,0.12) 0, rgba(0,0,0,0.12) 1px, transparent 1px, transparent 4px), ${palette.disc}`,
              boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
            }}
          >
            <span className="absolute left-1/2 top-1/2 block size-[74px] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full">
              <Image src={album.artwork} alt="" fill sizes="74px" className="object-cover" unoptimized />
            </span>
            <span className="absolute left-1/2 top-1/2 block size-[10px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink" />
          </span>
        </span>
      ) : (
        <>
          {/* vinyl graphic, anchored to the right edge so it survives any width */}
          <Icon name="pick-disc" size={184} className={PICK_CENTRE} />
          <Icon name="pick-inner" size={74} className={PICK_CENTRE} />
          <Icon name="pick-spindle" size={20} className={PICK_CENTRE} />
        </>
      )}

      <p
        className={`absolute left-[14px] top-[14px] whitespace-nowrap text-[8px] tracking-[0.9px] ${
          palette ? "text-on-dark-muted" : "text-accent-bright"
        }`}
      >
        EDITOR&apos;S PICK
      </p>
      <h2 className="absolute bottom-[60px] left-[14px] line-clamp-2 max-w-[78%] text-[26px] font-black leading-[28px] tracking-[-1px] text-on-dark">
        <Link href="/editors-pick" className="transition-colors hover:text-accent-bright">
          {title}
        </Link>
      </h2>
      <p className="absolute bottom-[28px] left-[14px] max-w-[78%] truncate text-[9px] tracking-[0.3px] text-on-dark-muted">
        {album
          ? `${album.artists.map((a) => a.name).join(", ")} · ${album.totalTracks}곡 · ${minutes}분`
          : ""}
      </p>
      <button
        type="button"
        onClick={open}
        aria-label="에디터스 픽 재생"
        title="앨범 재생"
        className="absolute bottom-[14px] right-[14px] flex size-[46px] cursor-pointer items-center justify-center rounded-pill bg-accent transition-colors hover:bg-soft"
      >
        <Icon name="play-md" size={17} />
      </button>
    </section>
  );
}

/**
 * The subscribe card. Where a screen can open the form beside it, `onSubscribe`
 * is given and the button toggles that form (`open`); everywhere else it is a
 * link to the subscribe screen.
 */
export function StayConnected({ onSubscribe, open = false }: { onSubscribe?: () => void; open?: boolean }) {
  // the mail rotates through four themes; this is the one going out this week
  const theme = weekTheme();
  return (
    <section className="relative flex min-h-0 flex-[0_0_186px] flex-col overflow-hidden bg-paper-solid px-[20px] py-[18px]">
      {/* the stamp's perforated edge */}
      <div aria-hidden className="pointer-events-none absolute inset-[8px] border border-dashed border-ink/45" />
      <p className="text-[8px] tracking-[0.8px] text-accent-bright">{theme} · 이번 주 컨셉</p>
      <h2 className="mt-[6px] text-[24px] font-black leading-[28px] tracking-[-0.5px] text-on-bright">
        <Link href="/issues" className="transition-colors hover:text-accent-bright">
          금요일의
          <br />
          앨범 편지
        </Link>
      </h2>
      <div
        aria-hidden
        className="absolute right-[20px] top-[18px] flex h-[66px] w-[56px] flex-col items-center justify-center border border-dashed border-accent-bright text-accent-bright"
      >
        <span className="text-[18px] font-black leading-none">FRI</span>
        <span className="mt-[6px] text-[7px] tracking-[0.4px]">00:00 KST</span>
        <span className="mt-[2px] text-[8px] tracking-[0.4px]">매주</span>
      </div>
      <p className="mt-auto text-[9px] leading-[14px] text-on-bright/70">
        용눈이가 이번 주 들은 곡 중 앨범 한 장의 이야기를
        <br />
        메일로 보내드립니다.
      </p>
      <div className="mt-[10px] flex items-center gap-[14px]">
        {onSubscribe ? (
          <button
            type="button"
            onClick={onSubscribe}
            aria-expanded={open}
            className={`flex h-[28px] items-center whitespace-nowrap rounded-pill px-[18px] text-[10px] tracking-[0.6px] text-paper-solid transition-colors hover:bg-accent-bright ${open ? "bg-accent-bright" : "bg-ink"}`}
          >
            {open ? "접기 ↑" : "신청하기 →"}
          </button>
        ) : (
          <Link
            href="/subscribe"
            className="flex h-[28px] items-center whitespace-nowrap rounded-pill bg-ink px-[18px] text-[10px] tracking-[0.6px] text-paper-solid transition-colors hover:bg-accent-bright"
          >
            신청하기 →
          </Link>
        )}
        <span className="text-[8px] tracking-[0.6px] text-on-bright-muted">무료 · 언제든 해지</span>
      </div>
    </section>
  );
}

function ArtistOfTheWeek() {
  // the artist the developer played most this week, from the database: the same for every visitor
  const { data, loading } = useDetail<WeeklyArtist>("/api/weekly-artist");
  const artist = data?.artist;
  const palette = artist?.palette ?? null;
  const name = artist?.name ?? (loading ? "" : "아직 없음");
  const when = data?.previous ? "지난주" : "이번 주";

  return (
    <section className="flex min-h-0 flex-[0_0_294px] flex-col gap-[10px] overflow-hidden bg-chart p-[14px]">
      <p className="h-[10px] shrink-0 whitespace-nowrap text-[8px] leading-[10px] tracking-[1px] text-muted">
        ARTIST OF THE WEEK{data?.previous ? " · 지난주" : ""}
      </p>

      {/* stays square while absorbing the block's slack: height comes from
          flex, width follows the ratio. 203×203 at the design height. Both
          sides are capped at the rail's width: capping only the width left a
          tall rectangle whenever the rail had more room than the photo. */}
      <div
        className="relative aspect-square min-h-0 w-auto max-h-[302px] max-w-[302px] flex-1 self-center overflow-hidden rounded-[4px] bg-ink transition-colors duration-700"
        // the colour of the photo behind it, so a photo with a margin does not show black
        style={palette ? { backgroundColor: palette.bg } : undefined}
      >
        {artist?.image ? (
          <Image src={artist.image} alt="" fill sizes="302px" className="object-cover" unoptimized />
        ) : (
          <>
            <Icon name="portrait-disc" size={104} className={PORTRAIT_CENTRE} />
            <Icon name="portrait-ring" size={38} className={PORTRAIT_CENTRE} />
            <Icon name="portrait-hole" size={11} className={PORTRAIT_CENTRE} />
          </>
        )}
      </div>

      <div className="flex h-[41px] w-full shrink-0 flex-col gap-[2px]">
        <h2 className="truncate text-[21px] font-black leading-[27px] tracking-[-0.7px]">
          <Link href="/weekly-artist" className="transition-colors hover:text-accent-bright">
            {name}
          </Link>
        </h2>
        <p className="w-full truncate text-[9px] leading-[12px] text-muted">
          {artist ? artist.genres.slice(0, 3).join(" · ") : ""}
        </p>
      </div>

      <p className="tnum h-[13px] w-full shrink-0 whitespace-nowrap text-[8px] leading-[13px] tracking-[0.6px] text-muted">
        {data ? `${when} ${data.plays}회 재생` : ""}
      </p>

      <div className="flex h-[31px] w-full shrink-0 items-center justify-between">
        <Link
          href="/weekly-artist"
          className="flex h-[31px] shrink-0 items-center rounded-pill bg-ink px-[18px] text-[11px] leading-none tracking-[0.8px] text-paper transition-colors hover:bg-accent-bright"
        >
          자세히 보기
        </Link>
      </div>
    </section>
  );
}

const FOOTER_LINKS = [
  { href: "/about", label: "이용 안내" },
  { href: "/privacy", label: "개인정보" },
  { href: "/contact", label: "문의·제보" },
];

/** What the rail stands on, and where to read more: the foot of the column. */
function RailFooter() {
  return (
    <footer className="flex shrink-0 flex-col gap-[12px] px-[14px] pb-[18px] pt-[18px]">
      <p className="text-[8px] tracking-[1px] text-muted">ABOUT SUPERLIKE</p>
      <p className="text-[9px] font-normal leading-[14px]">
        재생은 Spotify, 신보·차트는 Apple Music에서 가져와요. 연결하지 않아도 둘러볼 수 있고, 재생은 Spotify Premium 계정이 필요해요.
      </p>
      <nav className="flex gap-[14px] text-[9px] font-medium">
        {FOOTER_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="underline underline-offset-2 transition-colors hover:text-accent-bright">
            {l.label}
          </Link>
        ))}
      </nav>
      <div className="h-px bg-soft" />
      <p className="text-[8px] tracking-[0.3px] text-muted">© SUPERLIKE 2026 · honeydragoneye</p>
    </footer>
  );
}

export function RightRail() {
  return (
    <div className="rail-scroll flex h-full flex-col bg-chart">
      <EditorsPick />
      <StayConnected />
      <ArtistOfTheWeek />
      <RailFooter />
    </div>
  );
}
