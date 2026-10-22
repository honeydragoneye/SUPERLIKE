"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useSpotify } from "@/components/player/spotify-provider";
import { useHydrated } from "@/components/ui/use-hydrated";
import type { SearchAlbum, SearchArtist } from "@/lib/data";
import { nameMatch, squash } from "@/lib/names";
import type { ChatLink } from "./chat-provider";

type Found = { id: string; name: string; image: string | null; sub: string };
type Lookup = { found: Found | null; /** another artist Spotify ranks above the match: "did you mean" */ maybe: Found | null };


/** One answer per name, so the same artist named twice in a conversation is searched once. */
const found = new Map<string, Promise<Lookup>>();

/**
 * The agent names things the way Last.fm and MusicBrainz spell them; a page
 * here is addressed by a Spotify id. So the name is searched, and the first
 * result only counts when its name says the same thing: a wrong artist's page
 * opened is worse than no link.
 */
function lookUp(link: ChatLink): Promise<Lookup> {
  const key = `${link.kind}|${link.name}|${link.artist ?? ""}|${link.alias ?? ""}`.toLowerCase();
  const known = found.get(key);
  if (known) return known;

  const pending = (async (): Promise<Lookup> => {
    const search = async (name: string) => {
      const q = encodeURIComponent(link.kind === "album" && link.artist ? `${name} ${link.artist}` : name);
      const res = await fetch(`/api/spotify/search?q=${q}&type=${link.kind}&limit=10`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      return (await res.json()) as { artists?: SearchArtist[]; albums?: SearchAlbum[] };
    };
    // the name the tool gave, and the one the agent asked it for: Spotify may spell the artist either way
    const wanted = [link.name, ...(link.alias ? [link.alias] : [])];

    const found = (a: SearchArtist): Found => ({
      id: a.id,
      name: a.name,
      image: a.image,
      sub: `아티스트${a.genres.length ? ` · ${a.genres.slice(0, 2).join(", ")}` : ""}`,
    });

    if (link.kind === "artist") {
      // the closest spelling wins, and of namesakes the best known is the one meant. A slip of a letter, or a
      // name that holds the other whole, is allowed (nameMatch), but only after every exact spelling.
      const rank = (artists: SearchArtist[]) => {
        const ranked = artists
          .map((a, at) => ({ a, at, gap: nameMatch(wanted, a.name) }))
          .filter((c): c is { a: SearchArtist; at: number; gap: number } => c.gap !== null);
        const best = [...ranked].sort((x, y) => x.gap - y.gap || y.a.popularity - x.a.popularity)[0];
        if (!best) return { found: null, maybe: null };
        // "blackskirt" is an artist on Last.fm, and also what someone typing 검정치마 slips into: when Spotify
        // puts another artist whose name holds the same letters above the match, offer it as "did you mean"
        const other = ranked.find((c) => c.at < best.at && c.a.id !== best.a.id && squash(c.a.name) !== squash(best.a.name));
        return { found: found(best.a), maybe: other ? found(other.a) : null };
      };
      let lookup = rank((await search(link.name)).artists ?? []);
      // 검정치마 is not a name Spotify's search finds The Black Skirts by: ask with the other spelling too
      if (!lookup.found && link.alias) lookup = rank((await search(link.alias)).artists ?? []);
      return lookup;
    }

    const by = link.artist ? squash(link.artist) : "";
    const hit = ((await search(link.name)).albums ?? [])
      .filter((a) => !by || squash(a.artist).includes(by) || by.includes(squash(a.artist)))
      .map((a) => ({ a, gap: nameMatch(wanted, a.name) }))
      .filter((c): c is { a: SearchAlbum; gap: number } => c.gap !== null)
      .sort((x, y) => x.gap - y.gap)[0]?.a;
    return {
      found: hit
        ? { id: hit.id, name: hit.name, image: hit.artwork, sub: `앨범 · ${hit.artist}${hit.releaseDate ? ` · ${hit.releaseDate.slice(0, 4)}` : ""}` }
        : null,
      maybe: null,
    };
  })();
  // a failed search is not remembered, so the next card for the same name tries again
  pending.catch(() => found.delete(key));
  found.set(key, pending);
  return pending;
}

type Shown = { kind: "loading" } | { kind: "missing" } | { kind: "ready"; lookup: Lookup & { found: Found } };

/** One card: the sleeve, the name, what it is, and the button that opens the page. */
function Card({
  kind,
  title,
  sub,
  image,
  target,
  loading,
}: {
  kind: ChatLink["kind"];
  title: string;
  sub: string;
  image: string | null;
  target: string | null;
  loading: boolean;
}) {
  const router = useRouter();
  const round = kind === "artist";
  return (
    <li className="flex items-center gap-[8px] rounded-[8px] bg-chart py-[6px] pl-[6px] pr-[8px]">
      {image ? (
        <span className={`relative size-[34px] shrink-0 overflow-hidden bg-ink ${round ? "rounded-full" : "rounded-[4px]"}`}>
          <Image src={image} alt="" fill sizes="34px" className="object-cover" unoptimized />
        </span>
      ) : (
        <span className={`relative flex size-[34px] shrink-0 items-center justify-center bg-ink ${round ? "rounded-full" : "rounded-[4px]"}`}>
          <span className="size-[18px] rounded-full bg-accent-bright" />
          <span className="absolute size-[5px] rounded-full bg-ink" />
        </span>
      )}
      <span className={`flex min-w-0 flex-1 flex-col gap-px ${target ? "" : "opacity-55"}`}>
        <span className="w-full truncate text-[10px] text-on-bright" title={title}>
          {title}
        </span>
        <span className="w-full truncate text-[8px] tracking-[0.5px] text-on-bright-muted">{sub}</span>
      </span>
      <button
        type="button"
        disabled={!target}
        onClick={() => target && router.push(target)}
        aria-label={`${title} ${kind === "artist" ? "아티스트" : "앨범"} 페이지 열기`}
        className="shrink-0 cursor-pointer whitespace-nowrap rounded-pill bg-ink px-[10px] py-[5px] text-[8px] tracking-[0.6px] text-paper-solid transition-colors enabled:hover:bg-accent-bright disabled:cursor-default disabled:opacity-35"
      >
        {loading ? "찾는 중…" : "페이지 열기 →"}
      </button>
    </li>
  );
}

/**
 * A page of this app that an answer is about: the artist, or the album a song
 * is on. The card looks the name up when it appears, and opens the page when it
 * is pressed. When Spotify ranks another artist of nearly the same name above
 * the match, a second card asks whether that one was meant.
 */
export function LinkCard({ link }: { link: ChatLink }) {
  const { connected } = useSpotify();
  const hydrated = useHydrated();
  const [state, setState] = useState<Shown>({ kind: "loading" });
  const ready = hydrated && connected;

  useEffect(() => {
    if (!ready) return;
    let live = true;
    lookUp(link)
      .then((l) => live && setState(l.found ? { kind: "ready", lookup: { ...l, found: l.found } } : { kind: "missing" }))
      .catch(() => live && setState({ kind: "missing" }));
    return () => {
      live = false;
    };
  }, [ready, link]);

  const found = state.kind === "ready" ? state.lookup.found : null;
  const maybe = state.kind === "ready" ? state.lookup.maybe : null;
  const sub = !ready
    ? "Spotify를 연결하면 열 수 있어요"
    : state.kind === "missing"
      ? "Superlike에서 찾지 못했어요"
      : found
        ? found.sub
        : link.kind === "artist"
          ? "아티스트"
          : "앨범";

  return (
    <>
      <Card
        kind={link.kind}
        title={link.name}
        sub={sub}
        image={found?.image ?? null}
        target={found ? `/${link.kind}/${found.id}` : null}
        loading={ready && state.kind === "loading"}
      />
      {maybe && (
        <>
          <li className="pl-[6px] pt-[2px] text-[8px] tracking-[0.5px] text-on-bright-muted">혹시 이 가수를 말씀하셨나요?</li>
          <Card kind="artist" title={maybe.name} sub={maybe.sub} image={maybe.image} target={`/artist/${maybe.id}`} loading={false} />
        </>
      )}
    </>
  );
}
