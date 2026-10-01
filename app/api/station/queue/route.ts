import { NextResponse, type NextRequest } from "next/server";
import {
  NotConnectedError,
  SpotifyApiError,
  findTrack,
  flushToken,
} from "@/lib/spotify/api";
import {
  artistTopTags,
  artistTopTracks,
  similarArtists,
  similarTracks,
  tagTopTracks,
} from "@/lib/lastfm/client";
import { checkInstrumental, matchesFilter, type LyricsFlag } from "@/lib/lrclib/client";
import type { Resolved } from "@/lib/spotify/tokens";
import type {
  StationCandidate,
  StationQueueRequest,
  StationQueueResponse,
  StationSource,
  StationStage,
} from "@/lib/station/types";

/**
 * How many Last.fm names one rung may try to resolve.
 *
 * Each name costs a throttled Spotify search, and a filtered run costs an
 * LRCLIB call on top, so an unbounded rung could hold the request open for
 * minutes. Four names per wanted track leaves room for the ones that do not
 * resolve without letting a single rung run away.
 */
const NAMES_PER_WANTED = 4;

/** Ceiling on resolution work for the whole request, across every rung. */
const MAX_LOOKUPS = 60;

/**
 * Consecutive rejections that end a rung.
 *
 * Measured: under 가사 없음 every sampled track from the similar and genre
 * rungs had lyrics, so those rungs spent forty lookups to keep nothing. Giving
 * up after a short losing streak costs a seed whose neighbours *are*
 * instrumental almost nothing — its first few candidates pass — while a seed
 * whose neighbours are all vocal stops paying after eight.
 */
const GIVE_UP_AFTER = 8;

/** Candidates to rank in the instrumental rung before falling back to raw order. */
const RANK_SAMPLE = 10;

/** Similar artists to draw from before widening. */
const ARTISTS_FIRST_PASS = 5;

/**
 * Tracks by one artist allowed in a single build.
 *
 * Without it the artists rung filled the whole queue from its first neighbour:
 * concatenating each artist's top ten put ten JANNABI tracks at the head and
 * the queue was full before the second artist was reached. A couple by the
 * same artist is good — ten is a discography, not a station.
 */
const MAX_PER_ARTIST = 3;

/**
 * Similarity floor for Last.fm's own score.
 *
 * Its lists run long past the point of resemblance — 1.0, 0.63, 0.13, 0.054 on
 * one measured track. Anything under this is noise, but a seed whose whole list
 * scores low would be starved by a hard cut, so the floor only applies while
 * enough candidates clear it.
 */
const MIN_MATCH = 0.1;
const KEEP_REGARDLESS = 10;

/** Trims Last.fm's tail without starving a seed whose scores are all low. */
function byMatch(names: Names): Names {
  const strong = names.filter((n) => (n.match ?? 1) >= MIN_MATCH);
  return strong.length >= 5 ? strong : names.slice(0, KEEP_REGARDLESS);
}

type Names = { name: string; artist: string; match?: number }[];

/**
 * Candidate supply for the station queue — the fallback ladder.
 *
 * Rungs are tried in order and each one only asks for what the queue is still
 * missing, so a seed with plenty of neighbours never pays for the rest:
 *
 *   1. similar      — tracks like the one that just played
 *   2. seed         — tracks like the seed, once the branch runs dry
 *   3. artists      — top tracks of the artists Last.fm puts next to the seed's
 *   4. genre        — the seed artist's genre tags, for artists with no
 *                     neighbours on record; nationality tags are excluded
 *   5. instrumental — only under the 가사 없음 filter, because the rungs above
 *                     skew vocal and would otherwise be filtered away to nothing
 *
 * Last.fm answers in names only, so each candidate is resolved to a playable
 * Spotify track before it counts; an unresolvable one is dropped. Under a
 * filter, LRCLIB then has the final say, and its "unknown" is a no — the
 * existing rule in matchesFilter.
 *
 * The whole ladder runs here rather than in the browser because every hop is
 * paced by this process's throttles. Orchestrating it from the client would
 * pay a round trip per rung and still not see the pacing.
 */
export async function POST(request: NextRequest) {
  const {
    seed,
    basis,
    need = 10,
    filter = null,
    seenIds = [],
    seenLfm = [],
  } = (await request.json()) as StationQueueRequest;

  if (!seed?.artist || !seed?.name) {
    return NextResponse.json({ error: "missing_seed" }, { status: 400 });
  }

  const branch = basis ?? { name: seed.name, artist: seed.artist };
  const idSet = new Set(seenIds);
  const lfmSet = new Set(seenLfm.map((k) => k.toLowerCase()));

  const candidates: StationCandidate[] = [];
  const stages: StationStage[] = [];
  const skipped: string[] = [];
  let lastfmError: string | null = null;
  let resolved: Resolved | null = null;
  let lookups = 0;

  /** Resolves names to playable tracks until `need` is met or the rung gives up. */
  async function drain(source: StationSource, names: Names): Promise<void> {
    const startedAt = Date.now();
    const stage: StationStage = {
      source,
      offered: names.length,
      resolved: 0,
      kept: 0,
      ms: 0,
      gaveUp: false,
    };
    stages.push(stage);

    const budget = Math.min(
      names.length,
      (need - candidates.length) * NAMES_PER_WANTED,
      MAX_LOOKUPS - lookups,
    );

    let missStreak = 0;
    for (const cand of names.slice(0, Math.max(0, budget))) {
      if (candidates.length >= need) break;
      // this rung is not producing; the next one may
      if (missStreak >= GIVE_UP_AFTER) {
        stage.gaveUp = true;
        break;
      }

      const lfmKey = `${cand.name}|${cand.artist}`.toLowerCase();
      if (lfmSet.has(lfmKey)) continue;
      lfmSet.add(lfmKey);

      lookups += 1;
      let track = null;
      try {
        const found = await findTrack(cand.name, cand.artist);
        resolved = found.resolved;
        track = found.track;
      } catch (e) {
        // one unresolvable name must not sink the whole build
        skipped.push(`${cand.name} — ${cand.artist}: ${e instanceof Error ? e.message : "?"}`);
        continue;
      }
      if (!track || idSet.has(track.id)) continue;

      const primary = (track.artists[0]?.name ?? cand.artist).toLowerCase();
      const already = candidates.filter(
        (c) => c.artist.split(",")[0].trim().toLowerCase() === primary,
      ).length;
      if (already >= MAX_PER_ARTIST) continue;

      idSet.add(track.id);
      stage.resolved += 1;

      // no filter, no reason to spend an LRCLIB call
      let instrumental: LyricsFlag = null;
      if (filter !== null) {
        instrumental = await checkInstrumental(
          track.name,
          track.artists[0]?.name ?? cand.artist,
          track.duration_ms,
          track.id,
        );
        if (!matchesFilter(instrumental, filter)) {
          missStreak += 1;
          continue;
        }
      }

      missStreak = 0;
      stage.kept += 1;
      candidates.push({
        id: track.id,
        uri: track.uri,
        name: track.name,
        artist: track.artists.map((a) => a.name).join(", "),
        artwork: track.album.images?.[0]?.url ?? null,
        durationMs: track.duration_ms,
        lfmKey,
        instrumental: filter === null ? undefined : instrumental,
      });
    }
    stage.ms = Date.now() - startedAt;
  }

  try {
    // ---- rung 1: neighbours of whatever played last ----------------------
    const fromBranch = await similarTracks(branch.name, branch.artist, need * NAMES_PER_WANTED);
    lastfmError = fromBranch.error;
    if (!lastfmError) await drain("similar", byMatch(fromBranch.candidates));

    // ---- rung 2: neighbours of the seed, once the branch runs dry --------
    const sameAsSeed =
      branch.name.toLowerCase() === seed.name.toLowerCase() &&
      branch.artist.toLowerCase() === seed.artist.toLowerCase();
    if (!lastfmError && candidates.length < need && !sameAsSeed) {
      const fromSeed = await similarTracks(seed.name, seed.artist, need * NAMES_PER_WANTED);
      await drain("seed", byMatch(fromSeed.candidates));
    }

    /**
     * ---- rung 3: the seed artist's neighbours ---------------------------
     *
     * Measured on The Black Skirts: artist.getSimilar returns JANNABI (1.0),
     * 언니네 이발관 (0.865), Car, The Garden (0.836) — Korean indie, all of it.
     * The tag route returned Girls' Generation for the same seed. Artist-level
     * data is also far thicker than track-level, which matters for the Korean
     * catalogue where track.getSimilar often comes back empty.
     */
    if (!lastfmError && candidates.length < need) {
      const neighbours = await similarArtists(seed.artist, ARTISTS_FIRST_PASS);
      const lists: Names[] = [];
      let gathered = 0;
      for (const artist of neighbours) {
        const top = await artistTopTracks(artist.name, 10);
        if (top.length) lists.push(top);
        gathered += top.length;
        if (gathered >= need * NAMES_PER_WANTED) break;
      }

      // round-robin, strongest artist first within each round: the queue opens
      // with one track from each neighbour rather than ten from the closest
      const pool: Names = [];
      const deepest = Math.max(0, ...lists.map((l) => l.length));
      for (let i = 0; i < deepest; i++) {
        for (const list of lists) if (list[i]) pool.push(list[i]);
      }
      await drain("artists", pool);
    }

    /**
     * ---- rung 4: genre tags, as a safety net ----------------------------
     *
     * Only for an artist Last.fm has no neighbours for. Its tags are filtered
     * to ones that describe a sound: the top tag is often a nationality, and
     * a nationality's top tracks are simply that country's biggest hits.
     */
    let tags: string[] = [];
    if (!lastfmError && candidates.length < need) {
      tags = await artistTopTags(seed.artist, 3);
      const pool: Names = [];
      for (const tag of tags) {
        pool.push(...(await tagTopTracks(tag, 30)));
        if (pool.length >= need * NAMES_PER_WANTED) break;
      }
      await drain("genre", pool);
    }

    // ---- rung 5: the instrumental pool, ranked by genre overlap ----------
    // only worth its cost under 가사 없음 — the rungs above skew vocal
    if (!lastfmError && candidates.length < need && filter === "instrumental") {
      const seedTags = tags.length ? tags : await artistTopTags(seed.artist, 5);
      const pool = await tagTopTracks("instrumental", 40);

      /**
       * Ranking by genre overlap costs one Last.fm call per candidate, and at
       * 250ms apiece the old sample of 25 spent six seconds before a single
       * track was resolved. Rank a short head and leave the tail in the order
       * Last.fm gave it — relevance for the first picks, no bill for the rest.
       */
      const head = pool.slice(0, RANK_SAMPLE);
      const scored: { cand: { name: string; artist: string }; overlap: number }[] = [];
      for (const cand of head) {
        const candTags = await artistTopTags(cand.artist, 5);
        scored.push({ cand, overlap: candTags.filter((t) => seedTags.includes(t)).length });
      }
      scored.sort((a, b) => b.overlap - a.overlap);
      await drain("instrumental", [...scored.map((s) => s.cand), ...pool.slice(RANK_SAMPLE)]);
    }

    if (skipped.length) console.warn("[station/queue] skipped", skipped.slice(0, 5));
    // so the next slow build explains itself instead of being guessed at
    console.log(
      `[station/queue] filter=${filter ?? "none"} kept=${candidates.length}/${need} ` +
        stages
          .map((st) => `${st.source}:${st.kept}/${st.resolved}/${st.offered}@${st.ms}ms${st.gaveUp ? "(gaveup)" : ""}`)
          .join(" "),
    );

    const body: StationQueueResponse = {
      candidates,
      stages,
      exhausted: candidates.length < need,
      lastfmError,
    };
    return resolved
      ? flushToken(NextResponse.json(body), resolved)
      : NextResponse.json(body);
  } catch (e) {
    if (e instanceof NotConnectedError) {
      return NextResponse.json({ error: "not_connected" }, { status: 401 });
    }
    console.error("[station/queue]", e);
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : "queue_failed",
        detail: e instanceof SpotifyApiError ? e.detail : undefined,
      },
      { status: 502 },
    );
  }
}
