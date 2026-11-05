"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { PlayerMenu, type PlayerMenuItem } from "@/components/player/player-menu";
import { useSpotify } from "@/components/player/spotify-provider";
import { AddToPlaylistModal } from "@/components/playlists/add-to-playlist-modal";
import { seedFrom } from "./station-button";
import { lookUp } from "./track-card";

/** The menu's own height with five items, to decide whether it still fits below the button. */
const MENU_H = 272;

type Pos = { top: number; left: number };

/** The menu's width, so it can be kept inside the window from either side. */
const MENU_W = 300;
const EDGE = 8;

/**
 * Where the menu hangs, measured from the button when it is pressed.
 *
 * `fixed` and a portal rather than an absolutely placed child: the covers sit in
 * rows that scroll sideways, and a scroller clips whatever pokes out of it.
 * The menu lines its right edge up with the button, then is pulled back inside
 * the window, so a button in the first column or the last one never cuts it off;
 * it opens upward when there is no room below, and is held inside the window
 * when there is no room either way.
 */
function anchorOf(button: HTMLElement): Pos {
  const r = button.getBoundingClientRect();
  const left = Math.min(Math.max(EDGE, r.right - MENU_W), window.innerWidth - MENU_W - EDGE);
  const below = r.bottom + 6;
  const above = r.top - 6 - MENU_H;
  const top = below + MENU_H + EDGE <= window.innerHeight ? below : above >= EDGE ? above : Math.max(EDGE, window.innerHeight - MENU_H - EDGE);
  return { top, left };
}

/**
 * The ··· at the end of a song row or under an album cover.
 *
 * Only dots, no disc behind them: they appear while the pointer is over the
 * row (the parent is a `group`), turn blue while the menu is open, and stay put
 * until it closes. Escape, a press elsewhere or any scrolling closes it.
 */
function MoreButton({
  items,
  label,
  className = "",
  children,
}: {
  items: PlayerMenuItem[];
  label: string;
  className?: string;
  children?: ReactNode;
}) {
  const [pos, setPos] = useState<Pos | null>(null);
  const button = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const open = pos !== null;

  useEffect(() => {
    if (!open) return;
    const close = () => setPos(null);
    const onDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (menu.current?.contains(target) || button.current?.contains(target)) return;
      close();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && close();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-label={label}
        title="세부 기능"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setPos(open ? null : anchorOf(e.currentTarget));
        }}
        className={`flex h-[28px] w-[24px] shrink-0 cursor-pointer items-center justify-center text-[16px] font-black leading-none tracking-[1px] transition-[opacity,color] focus-visible:opacity-100 ${
          open ? "text-accent-bright opacity-100" : "text-ink opacity-0 hover:text-accent-bright group-hover:opacity-100"
        } ${className}`}
      >
        ···
      </button>
      {pos &&
        createPortal(
          <PlayerMenu
            ref={menu}
            items={items}
            onClose={() => setPos(null)}
            className="fixed z-50 shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
            style={pos}
          />,
          document.body,
        )}
      {children}
    </>
  );
}

/** A song as the menu needs it: enough to start a station from it and to put it in a playlist. */
export type MoreTrack = {
  id: string;
  uri: string;
  title: string;
  artist: string;
  artwork: string | null;
  durationMs: number;
  albumId?: string | null;
  artistId?: string | null;
};

/** The album and artist ids of a song that was listed without them, found by searching for it once. */
async function idsOf(track: MoreTrack): Promise<{ albumId: string | null; artistId: string | null }> {
  if (track.albumId || track.artistId) return { albumId: track.albumId ?? null, artistId: track.artistId ?? null };
  try {
    const q = encodeURIComponent(`${track.title} ${track.artist}`);
    const res = await fetch(`/api/spotify/search?q=${q}&type=track&limit=5`, { cache: "no-store" });
    if (!res.ok) return { albumId: null, artistId: null };
    const data = (await res.json()) as { tracks?: { id: string; albumId?: string | null; artistId?: string | null }[] };
    const hit = data.tracks?.find((t) => t.id === track.id);
    return { albumId: hit?.albumId ?? null, artistId: hit?.artistId ?? null };
  } catch {
    return { albumId: null, artistId: null };
  }
}

/** ··· for one song: the same menu the player bar offers for the track playing. */
export function TrackMore({ track, className }: { track: MoreTrack; className?: string }) {
  const router = useRouter();
  const { startStation } = useSpotify();
  const [adding, setAdding] = useState(false);
  const found = useRef<ReturnType<typeof idsOf> | null>(null);
  const ids = () => (found.current ??= idsOf(track));

  const items: PlayerMenuItem[] = [
    {
      key: "station",
      mark: "▶",
      label: "이 곡으로 스테이션 시작",
      onSelect: () =>
        void startStation({
          id: track.id,
          uri: track.uri,
          name: track.title,
          artist: track.artist,
          artwork: track.artwork,
          durationMs: track.durationMs,
        }),
    },
    { key: "add", mark: "+", label: "플레이리스트에 담기", onSelect: () => setAdding(true) },
    {
      key: "artist",
      mark: "↗",
      label: "아티스트 페이지로 이동",
      dividerBefore: true,
      onSelect: () => void ids().then((i) => i.artistId && router.push(`/artist/${i.artistId}`)),
    },
    {
      key: "album",
      mark: "↗",
      label: "앨범 페이지로 이동",
      onSelect: () => void ids().then((i) => i.albumId && router.push(`/album/${i.albumId}`)),
    },
    {
      key: "link",
      mark: "⧉",
      label: "링크 복사",
      confirm: "복사했어요",
      dividerBefore: true,
      onSelect: () => void navigator.clipboard?.writeText(`https://open.spotify.com/track/${track.id}`),
    },
  ];

  return (
    <MoreButton items={items} label={`${track.title} 세부 기능`} className={className}>
      {adding && (
        <AddToPlaylistModal
          track={{
            id: track.id,
            uri: track.uri,
            title: track.title,
            artist: track.artist,
            artwork: track.artwork,
            durationMs: track.durationMs,
            albumId: track.albumId ?? null,
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </MoreButton>
  );
}

/**
 * ··· for a song a list names by title and artist only (Last.fm's 대표곡), with no Spotify id.
 *
 * Nothing is looked up until an item is pressed, so a list of these costs no
 * searches. The song is found once, then every item works from what Spotify said.
 */
export function NamedTrackMore({ title, artist, className }: { title: string; artist: string; className?: string }) {
  const router = useRouter();
  const { startStation } = useSpotify();
  const [adding, setAdding] = useState<MoreTrack | null>(null);

  async function found(): Promise<MoreTrack | null> {
    try {
      const f = await lookUp({ title, artist });
      if (!f) return null;
      return {
        id: f.id,
        uri: f.uri,
        title: f.name,
        artist: f.artist,
        artwork: f.artwork,
        durationMs: f.durationMs,
        albumId: f.albumId,
        artistId: f.artistId,
      };
    } catch {
      return null;
    }
  }

  const items: PlayerMenuItem[] = [
    {
      key: "station",
      mark: "▶",
      label: "이 곡으로 스테이션 시작",
      onSelect: () =>
        void found().then((t) => t && startStation({ id: t.id, uri: t.uri, name: t.title, artist: t.artist, artwork: t.artwork, durationMs: t.durationMs })),
    },
    { key: "add", mark: "+", label: "플레이리스트에 담기", onSelect: () => void found().then((t) => t && setAdding(t)) },
    {
      key: "artist",
      mark: "↗",
      label: "아티스트 페이지로 이동",
      dividerBefore: true,
      onSelect: () => void found().then((t) => t?.artistId && router.push(`/artist/${t.artistId}`)),
    },
    {
      key: "album",
      mark: "↗",
      label: "앨범 페이지로 이동",
      onSelect: () => void found().then((t) => t?.albumId && router.push(`/album/${t.albumId}`)),
    },
    {
      key: "link",
      mark: "⧉",
      label: "링크 복사",
      confirm: "복사했어요",
      dividerBefore: true,
      onSelect: () => void found().then((t) => t && navigator.clipboard?.writeText(`https://open.spotify.com/track/${t.id}`)),
    },
  ];

  return (
    <MoreButton items={items} label={`${title} 세부 기능`} className={className}>
      {adding && (
        <AddToPlaylistModal
          track={{
            id: adding.id,
            uri: adding.uri,
            title: adding.title,
            artist: adding.artist,
            artwork: adding.artwork,
            durationMs: adding.durationMs,
            albumId: adding.albumId ?? null,
          }}
          onClose={() => setAdding(null)}
        />
      )}
    </MoreButton>
  );
}

/**
 * ··· for one album. Some covers come from a chart that has no Spotify id, so
 * `resolveId` may be what finds it; the menu looks it up when an item needs it.
 *
 * There is no 플레이리스트에 담기: a playlist holds songs, and an album is not one.
 */
export function AlbumMore({
  title,
  albumId,
  resolveId,
  artistId,
  className,
}: {
  title: string;
  albumId?: string | null;
  resolveId?: () => Promise<string | null>;
  artistId?: string | null;
  className?: string;
}) {
  const router = useRouter();
  const { startStation } = useSpotify();
  const found = useRef<Promise<string | null> | null>(null);
  const idOf = () => (found.current ??= albumId ? Promise.resolve(albumId) : (resolveId?.() ?? Promise.resolve(null)));

  const items: PlayerMenuItem[] = [
    {
      key: "station",
      mark: "▶",
      label: "이 앨범으로 스테이션 시작",
      onSelect: () =>
        void idOf().then(async (id) => {
          const seed = id ? await seedFrom("album", id) : null;
          if (seed) await startStation(seed);
        }),
    },
    {
      key: "artist",
      mark: "↗",
      label: "아티스트 페이지로 이동",
      dividerBefore: true,
      onSelect: () =>
        void (async () => {
          if (artistId) return router.push(`/artist/${artistId}`);
          const id = await idOf();
          if (!id) return;
          const res = await fetch(`/api/spotify/album/${id}`, { cache: "no-store" });
          const data = res.ok ? ((await res.json()) as { artists?: { id: string }[] }) : null;
          const first = data?.artists?.[0]?.id;
          if (first) router.push(`/artist/${first}`);
        })(),
    },
    {
      key: "album",
      mark: "↗",
      label: "앨범 페이지로 이동",
      onSelect: () => void idOf().then((id) => id && router.push(`/album/${id}`)),
    },
    {
      key: "link",
      mark: "⧉",
      label: "링크 복사",
      confirm: "복사했어요",
      dividerBefore: true,
      onSelect: () =>
        void idOf().then((id) => {
          if (id) void navigator.clipboard?.writeText(`https://open.spotify.com/album/${id}`);
        }),
    },
  ];

  return <MoreButton items={items} label={`${title} 세부 기능`} className={className} />;
}
