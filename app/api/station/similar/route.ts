import { NextResponse, type NextRequest } from "next/server";
import {
  NotConnectedError,
  SpotifyApiError,
  findTrack,
  flushToken,
} from "@/lib/spotify/api";
import { artistTopTags, similarTracks, tagTopTracks } from "@/lib/lastfm/client";
import type { Resolved } from "@/lib/spotify/tokens";

export type StationCandidate = {
  id: string;
  uri: string;
  name: string;
  artist: string;
  artwork: string | null;
  durationMs: number;
  /** what Last.fm called it, kept for de-duplication across sources */
  lfmKey: string;
};

type Source = "similar" | "genre" | "instrumental";

/**
 * Candidate supply for the station queue.
 *
 * Last.fm answers in names only, so each candidate is resolved to a playable
 * Spotify track before it is returned — an unresolvable one is dropped, since
 * the queue can only hold things we can actually play.
 *
 * This route supplies candidates; deciding how many to take and in what order
 * belongs to the fallback ladder that consumes it.
 */
export async function POST(request: NextRequest) {
  const {
    source = "similar",
    trackName,
    artistName,
    limit = 20,
    seenIds = [],
    seenLfm = [],
  } = (await request.json()) as {
    source?: Source;
    trackName?: string;
    artistName?: string;
    limit?: number;
    seenIds?: string[];
    seenLfm?: string[];
  };

  if (!artistName) {
    return NextResponse.json({ error: "missing_artist" }, { status: 400 });
  }

  try {
    const idSet = new Set(seenIds);
    const lfmSet = new Set(seenLfm.map((k) => k.toLowerCase()));

    let names: { name: string; artist: string }[] = [];
    let tags: string[] = [];
    let lfmError: string | null = null;

    if (source === "similar") {
      if (!trackName) {
        return NextResponse.json({ error: "missing_track" }, { status: 400 });
      }
      const out = await similarTracks(trackName, artistName, limit * 3);
      names = out.candidates;
      lfmError = out.error;
    } else if (source === "genre") {
      tags = await artistTopTags(artistName, 3);
      for (const tag of tags) {
        names.push(...(await tagTopTracks(tag, 30)));
        if (names.length >= limit * 3) break;
      }
    } else {
      // the genre pools skew vocal, so pull the instrumental pool and rank it
      // by how much its artists overlap the seed's genre tags
      tags = await artistTopTags(artistName, 5);
      const pool = await tagTopTracks("instrumental", 40);
      const scored: { cand: { name: string; artist: string }; overlap: number }[] = [];
      for (const cand of pool.slice(0, 25)) {
        const candTags = await artistTopTags(cand.artist, 5);
        scored.push({
          cand,
          overlap: candTags.filter((t) => tags.includes(t)).length,
        });
      }
      scored.sort((a, b) => b.overlap - a.overlap);
      names = scored.map((s) => s.cand);
    }

    const candidates: StationCandidate[] = [];
    const failures: string[] = [];
    let resolved: Resolved | null = null;

    for (const cand of names) {
      if (candidates.length >= limit) break;
      const lfmKey = `${cand.name}|${cand.artist}`.toLowerCase();
      if (lfmSet.has(lfmKey)) continue;
      lfmSet.add(lfmKey);

      // one unresolvable name must not sink the whole queue build
      let track = null;
      try {
        const found = await findTrack(cand.name, cand.artist);
        resolved = found.resolved;
        track = found.track;
      } catch (e) {
        failures.push(
          `${cand.name} — ${cand.artist}: ${e instanceof Error ? e.message : "?"}`,
        );
        continue;
      }
      if (!track || idSet.has(track.id)) continue;
      idSet.add(track.id);

      candidates.push({
        id: track.id,
        uri: track.uri,
        name: track.name,
        artist: track.artists.map((a) => a.name).join(", "),
        artwork: track.album.images?.[0]?.url ?? null,
        durationMs: track.duration_ms,
        lfmKey,
      });
    }

    if (failures.length) console.warn("[station/similar] skipped", failures.slice(0, 5));
    const body = {
      candidates,
      tags,
      source,
      lastfmError: lfmError,
      skipped: failures.length,
    };
    return resolved
      ? flushToken(NextResponse.json(body), resolved)
      : NextResponse.json(body);
  } catch (e) {
    if (e instanceof NotConnectedError) {
      return NextResponse.json({ error: "not_connected" }, { status: 401 });
    }
    console.error("[station/similar]", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "similar_failed",
        detail: e instanceof SpotifyApiError ? e.detail : undefined,
      },
      { status: 502 },
    );
  }
}
