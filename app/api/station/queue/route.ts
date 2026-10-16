import { NextResponse, type NextRequest } from "next/server";
import {
  NotConnectedError,
  SpotifyApiError,
  findTrack,
  flushToken,
  type SpotifyTrack,
} from "@/lib/spotify/api";
import {
  artistTopTags,
  artistTopTracks,
  isSharedTag,
  similarArtists,
  similarTracks,
  tagTopTracks,
} from "@/lib/lastfm/client";
import { checkInstrumental, type LyricsFlag } from "@/lib/lrclib/client";
import { judgeMoods } from "@/lib/gemini/moods";
import {
  NO_FILTER,
  isFiltered,
  matchesClean,
  matchesLyrics,
  matchesMood,
} from "@/lib/station/filter";
import { moodTag } from "@/lib/station/moods";
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

/**
 * Names Gemini is asked about at a time.
 *
 * A mood is judged by the batch, not the track: one request costs about 1.5s
 * whether it carries one name or twenty — measured 1/1 in 1.2s and 12/12 in
 * 1.2s — so asking per candidate would rebuild the 가사 없음 wait with a slower
 * API. Twenty is what one request carries, and names cost nothing to gather, so
 * there is no reason to send fewer.
 */
const MOOD_BATCH = 20;

/**
 * A chosen genre's chart, taken a page at a time.
 *
 * It was the top thirty and nothing after, and a narrow pair of tags used that
 * up in one build: CHRISTMAS with 우울·슬픔 found six that fit, and the refill
 * that followed drew all nine of its tracks from rungs that never ask what
 * genre a song is. The chart goes on for hundreds of places, so the next page
 * is where a genre queue should look before it looks anywhere else.
 */
const GENRE_PAGE = 50;
/** Pages one build may walk, so a genre nothing fits cannot hold the request open. */
const GENRE_PAGES_PER_BUILD = 3;

/** Genre pills the panel shows. */
const PILLS = 5;
/** Tags fetched to find them, so one that is dropped has a replacement behind it. */
const TAGS_FETCHED = 8;

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

/** Last.fm's "name|artist", the key a candidate is deduped and judged under. */
const keyOf = (cand: Names[number]) => `${cand.name}|${cand.artist}`.toLowerCase();

/** A batch of names, as Gemini is asked about them. */
const asMoodAsk = (batch: Names) =>
  batch.map((cand) => ({ id: `lfm:${keyOf(cand)}`, name: cand.name, artist: cand.artist }));

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
 *   6. mood         — only under a mood tag: Last.fm's own mood tags, for a seed
 *                     whose neighbours do not carry the mood that was asked for
 *
 * Last.fm answers in names only, so each candidate is resolved to a playable
 * Spotify track before it counts; an unresolvable one is dropped. Under a
 * filter, LRCLIB then has the final say, and its "unknown" is a no — the
 * existing rule in matchesFilter. A mood tag puts Gemini's say first instead,
 * on the names and by the batch, under the same rule: only what it passes is
 * looked up at all.
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
    filter = NO_FILTER,
    wantTags = false,
    genrePage: genreFrom = 1,
    seenIds = [],
    seenLfm = [],
    rejected,
  } = (await request.json()) as StationQueueRequest;

  if (!seed?.artist || !seed?.name) {
    return NextResponse.json({ error: "missing_seed" }, { status: 400 });
  }

  const branch = basis ?? { name: seed.name, artist: seed.artist };
  /**
   * A rejected track is treated as already seen, which every rung and the mood
   * batches skip before asking anyone — so it costs neither a Gemini answer
   * nor a Spotify lookup. Only under a mood tag: the rejection was of the tag.
   */
  const refused = filter.mood !== null ? rejected : undefined;
  const idSet = new Set([...seenIds, ...(refused?.ids ?? [])]);
  const lfmSet = new Set([...seenLfm, ...(refused?.lfm ?? [])].map((k) => k.toLowerCase()));

  const candidates: StationCandidate[] = [];
  const stages: StationStage[] = [];
  const skipped: string[] = [];
  let lastfmError: string | null = null;
  let moodError: string | null = null;
  let moodMs = 0;
  let genrePage = Math.max(1, Math.floor(genreFrom) || 1);
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
    /** lookups this rung has spent, against `budget` */
    let spent = 0;

    /**
     * One name through Spotify and the tags that need the track itself.
     *
     * `true` is kept, `false` is found and turned down by a tag, `null` is a
     * name that never became a candidate — unresolvable, a repeat, or one more
     * by an artist who already has their share. Only the first two say anything
     * about whether the rung is producing.
     */
    async function tryName(
      cand: Names[number],
      moods?: StationCandidate["moods"],
    ): Promise<boolean | null> {
      const lfmKey = keyOf(cand);
      if (lfmSet.has(lfmKey)) return null;
      lfmSet.add(lfmKey);

      lookups += 1;
      spent += 1;
      let track: SpotifyTrack | null = null;
      try {
        const found = await findTrack(cand.name, cand.artist);
        resolved = found.resolved;
        track = found.track;
      } catch (e) {
        // one unresolvable name must not sink the whole build
        skipped.push(`${cand.name} — ${cand.artist}: ${e instanceof Error ? e.message : "?"}`);
        return null;
      }
      if (!track || idSet.has(track.id)) return null;

      const primary = (track.artists[0]?.name ?? cand.artist).toLowerCase();
      const already = candidates.filter(
        (c) => c.artist.split(",")[0].trim().toLowerCase() === primary,
      ).length;
      if (already >= MAX_PER_ARTIST) return null;

      idSet.add(track.id);
      stage.resolved += 1;

      /**
       * 19금 first, because it is free.
       *
       * `explicit` rides along with the search that already resolved this
       * track, so rejecting on it costs nothing; the lyrics verdict below is a
       * network call to LRCLIB. Judging in that order means the expensive
       * question is only ever asked about tracks that have already survived
       * the cheap one.
       */
      if (!matchesClean(track.explicit, filter.clean)) return false;

      // no lyrics tag, no reason to spend an LRCLIB call
      let instrumental: LyricsFlag = null;
      if (filter.lyrics !== null) {
        instrumental = await checkInstrumental(
          track.name,
          track.artists[0]?.name ?? cand.artist,
          track.duration_ms,
          track.id,
        );
        if (!matchesLyrics(instrumental, filter.lyrics)) return false;
      }

      stage.kept += 1;
      candidates.push({
        id: track.id,
        uri: track.uri,
        name: track.name,
        artist: track.artists.map((a) => a.name).join(", "),
        artwork: track.album.images?.[0]?.url ?? null,
        durationMs: track.duration_ms,
        lfmKey,
        explicit: track.explicit,
        instrumental: filter.lyrics === null ? undefined : instrumental,
        moods,
      });
      return true;
    }

    const tally = (outcome: boolean | null) => {
      if (outcome === true) missStreak = 0;
      else if (outcome === false) missStreak += 1;
    };

    if (filter.mood === null) {
      // the budget is spent on names not yet tried: counting the ones a refill
      // has already used would stop it short of a page's unoffered tail
      const fresh = names.filter((cand) => !lfmSet.has(keyOf(cand)));
      for (const cand of fresh.slice(0, Math.max(0, budget))) {
        if (candidates.length >= need) break;
        // this rung is not producing; the next one may
        if (missStreak >= GIVE_UP_AFTER) {
          stage.gaveUp = true;
          break;
        }
        tally(await tryName(cand));
      }
    } else {
      /**
       * Under a mood tag Gemini is asked first, about the names.
       *
       * It judges a title and an artist, and Last.fm has already supplied both,
       * so there is nothing to wait for. Asking after the lookup, as this did,
       * measured 34 tracks resolved to keep 7 — 18 of a 23 second build spent
       * finding tracks that were then turned away. Asked first, only the names
       * that carry the mood cost a Spotify search.
       */
      stage.fits = 0;
      // batches are cut from the list as offered, not from what is left of it,
      // so the first one is the same twenty names `ahead` already asked about
      for (let at = 0; at < names.length; at += MOOD_BATCH) {
        // Gemini is not answering: the next batch would only meet the same no
        if (candidates.length >= need || moodError || spent >= budget) break;
        if (missStreak >= GIVE_UP_AFTER) {
          stage.gaveUp = true;
          break;
        }

        const batch = names
          .slice(at, at + MOOD_BATCH)
          .filter((cand) => !lfmSet.has(keyOf(cand)));
        if (!batch.length) continue;
        const { verdicts, ms, error } = await judgeMoods(asMoodAsk(batch));
        moodMs += ms;
        if (error) moodError = error;

        const fits = batch.filter((cand) =>
          matchesMood(verdicts.get(`lfm:${keyOf(cand)}`), filter.mood),
        );
        stage.fits += fits.length;
        // a batch with nothing in it counts whole: twenty names and not one fit
        // is a rung looking in the wrong place
        if (!fits.length) {
          missStreak += batch.length;
          continue;
        }
        missStreak = 0;

        for (const cand of fits) {
          if (candidates.length >= need || spent >= budget) break;
          if (missStreak >= GIVE_UP_AFTER) break;
          tally(await tryName(cand, verdicts.get(`lfm:${keyOf(cand)}`)));
        }
      }
    }
    stage.ms = Date.now() - startedAt;
  }

  /**
   * The seed artist's genre tags, fetched at most once.
   *
   * Two rungs want them — the genre rung for candidate names, the instrumental
   * rung for ranking — and either can lead now, so neither can own the call.
   */
  let cachedTags: Promise<string[]> | null = null;
  // the promise is kept, not the list: the pills ask while a rung may be asking
  const seedTags = () => (cachedTags ??= artistTopTags(seed.artist, TAGS_FETCHED));

  /** The seed's tags that enough people use to be worth a pill, strongest first. */
  async function pillTags(): Promise<string[]> {
    const out: string[] = [];
    for (const tag of await seedTags()) {
      if (out.length >= PILLS) break;
      if (await isSharedTag(tag)) out.push(tag);
    }
    return out;
  }

  /** Neighbours of whatever played last. */
  async function rungSimilar(): Promise<void> {
    const fromBranch = await similarTracks(branch.name, branch.artist, need * NAMES_PER_WANTED);
    // the one rung that reports Last.fm being unreachable; the rest return bare lists
    lastfmError = fromBranch.error;
    if (!lastfmError) await drain("similar", byMatch(fromBranch.candidates));
  }

  /** Neighbours of the seed, once the branch runs dry. */
  async function rungSeed(): Promise<void> {
    const sameAsSeed =
      branch.name.toLowerCase() === seed.name.toLowerCase() &&
      branch.artist.toLowerCase() === seed.artist.toLowerCase();
    if (sameAsSeed) return;
    const fromSeed = await similarTracks(seed.name, seed.artist, need * NAMES_PER_WANTED);
    await drain("seed", byMatch(fromSeed.candidates));
  }

  /**
   * The seed artist's neighbours.
   *
   * Measured on The Black Skirts: artist.getSimilar returns JANNABI (1.0),
   * 언니네 이발관 (0.865), Car, The Garden (0.836) — Korean indie, all of it.
   * The tag route returned Girls' Generation for the same seed. Artist-level
   * data is also far thicker than track-level, which matters for the Korean
   * catalogue where track.getSimilar often comes back empty.
   */
  async function gatherArtistNames(): Promise<Names> {
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
    return pool;
  }

  /** Gathered at most once: under a mood tag `ahead` wants the list early. */
  let artistPool: Promise<Names> | null = null;
  const artistNames = () => (artistPool ??= gatherArtistNames());

  /**
   * The artists rung's first Gemini request, sent before the rung is reached.
   *
   * Each request waits on Google for as long as it likes — 7 to 8 seconds
   * apiece when this was measured — and the rungs used to pay that one after
   * another. Sent while `similar` is still waiting on its own, the two waits
   * overlap, and by the time the ladder gets here the answer is in the cache.
   *
   * When `similar` fills the queue alone this request was not needed. It is
   * not lost: the neighbours are the seed's, so every refill of this station
   * offers the same names and finds them already judged.
   */
  let ahead: Promise<unknown> | null = null;

  async function rungArtists(): Promise<void> {
    const pool = await artistNames();
    if (ahead) {
      const startedAt = Date.now();
      await ahead;
      moodMs += Date.now() - startedAt;
    }
    await drain("artists", pool);
  }

  /**
   * Genre tags, as a safety net.
   *
   * Mostly for an artist Last.fm has no neighbours for. The tags are filtered
   * to ones that describe a sound: the top tag is often a nationality, and a
   * nationality's top tracks are simply that country's biggest hits.
   */
  async function rungGenre(): Promise<void> {
    /**
     * A chosen genre replaces the seed's own tags rather than joining them:
     * picking SHOEGAZE should build a shoegaze queue, not a queue that is one
     * third shoegaze because two other tags came along.
     */
    if (filter.genre) {
      for (let walked = 0; walked < GENRE_PAGES_PER_BUILD; walked++) {
        const names = await tagTopTracks(filter.genre, GENRE_PAGE, genrePage);
        // the chart has ended; the rungs below are all that is left
        if (!names.length) return;
        await drain("genre", names);
        /**
         * A page that filled the queue is kept for the next build: what is
         * left on it has not been offered yet. One that did not is finished —
         * everything on it was tried or turned away — so the next build starts
         * past it instead of walking it again to learn the same thing.
         */
        if (candidates.length >= need || moodError) return;
        genrePage += 1;
      }
      return;
    }

    const pool: Names = [];
    const tags = (await seedTags()).slice(0, 3);
    for (const tag of tags) {
      pool.push(...(await tagTopTracks(tag, 30)));
      if (pool.length >= need * NAMES_PER_WANTED) break;
    }
    await drain("genre", pool);
  }

  /** The instrumental pool, ranked by how much genre it shares with the seed. */
  async function rungInstrumental(): Promise<void> {
    const tags = (await seedTags()).slice(0, PILLS);
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
      scored.push({ cand, overlap: candTags.filter((t) => tags.includes(t)).length });
    }
    scored.sort((a, b) => b.overlap - a.overlap);
    await drain("instrumental", [...scored.map((s) => s.cand), ...pool.slice(RANK_SAMPLE)]);
  }

  /**
   * Last.fm's own mood tags, for when the seed's neighbours do not carry the
   * mood.
   *
   * Their top tracks have nothing to do with the seed — "sad" opens with Jeff
   * Buckley whatever the station was started from — so this is where the queue
   * comes from only after every rung that knows the seed has been tried. The
   * tag is a hint about where to look, never the verdict: "dance" is a genre as
   * much as a mood, and Gemini still answers for each track.
   */
  async function rungMood(): Promise<void> {
    if (filter.mood === null) return;
    const lists: Names[] = [];
    for (const tag of moodTag(filter.mood).pools) {
      const top = await tagTopTracks(tag, 30);
      if (top.length) lists.push(top);
    }
    // interleaved, so one tag's vocabulary does not open the whole queue
    const pool: Names = [];
    const deepest = Math.max(0, ...lists.map((l) => l.length));
    for (let i = 0; i < deepest; i++) {
      for (const list of lists) if (list[i]) pool.push(list[i]);
    }
    await drain("mood", pool);
  }

  /**
   * The ladder, ordered by what the filter will accept.
   *
   * Under 가사 없음 the instrumental rung leads. Measured on two builds before
   * this change: `similar` kept 0 of 36 names in 12.8s and `genre` 0 of 60 in
   * 7.2s, and only then did `instrumental` produce all nine tracks in 10.5s —
   * and on the next build 0/40 in 5.2s, 0/60 in 6.8s, then 10 of 10 in 4.0s.
   * The rungs above draw neighbours of a seed that has words, so the filter
   * discards nearly everything they resolve; leading with the pool built for
   * the filter spends the lookup budget where it pays.
   *
   * They still follow it rather than being dropped: an instrumental seed's
   * neighbours are instrumental too, and closer to the seed than any tag pool.
   */
  const byFilter =
    filter.genre !== null
      ? [rungGenre, rungSimilar, rungSeed, rungArtists]
      : filter.lyrics === "instrumental"
        ? [rungInstrumental, rungSimilar, rungSeed, rungArtists, rungGenre]
        : [rungSimilar, rungSeed, rungArtists, rungGenre];
  /**
   * A mood tag keeps that order and adds its own pool at the end.
   *
   * Unlike 가사 없음 the seed's neighbours do not fail a mood wholesale:
   * measured under 경쾌, one seed's `similar` kept 10 of 12 and another's
   * `artists` 3 of 7 against the pool's own 3 of 11. Leading with the pool
   * would trade a station built from this song for the same hundred tracks
   * every time, to save a rung that now costs one Gemini request to rule out.
   */
  const ladder = filter.mood !== null ? [...byFilter, rungMood] : byFilter;

  /**
   * Started now and collected at the end.
   *
   * Vetting costs a Last.fm call per tag the first time one is seen, and the
   * ladder spends most of its time waiting on Spotify — so the two overlap
   * instead of the pills adding their second to the end of the build.
   */
  const pills: Promise<string[]> = wantTags ? pillTags().catch(() => []) : Promise.resolve([]);

  try {
    if (filter.mood !== null) {
      ahead = artistNames()
        .then((pool) => judgeMoods(asMoodAsk(pool.slice(0, MOOD_BATCH))))
        // it only warms a cache; the rung asks again and reports for itself
        .catch(() => null);
    }

    for (const rung of ladder) {
      if (lastfmError || moodError || candidates.length >= need) break;
      await rung();
    }

    if (skipped.length) console.warn("[station/queue] skipped", skipped.slice(0, 5));
    // so the next slow build explains itself instead of being guessed at
    console.log(
      `[station/queue] filter=${isFiltered(filter) ? `${filter.lyrics ?? "-"}${filter.clean ? "+clean" : ""}${filter.genre ? `+${filter.genre}` : ""}${filter.mood ? `+${filter.mood}` : ""}` : "none"} ` +
      `kept=${candidates.length}/${need} ` +
        stages
          .map((st) => `${st.source}:${st.kept}/${st.resolved}/${st.fits === undefined ? "" : `${st.fits}fit/`}${st.offered}@${st.ms}ms${st.gaveUp ? "(gaveup)" : ""}`)
          .join(" ") +
        (filter.mood ? ` gemini@${moodMs}ms` : "") +
        (filter.genre ? ` page=${genreFrom}>${genrePage}` : ""),
    );

    const body: StationQueueResponse = {
      candidates,
      /**
       * Only on the first build of a station. The seed does not change while
       * one runs, so the panel's pills do not either — asking again on every
       * refill would spend a Last.fm call to be told the same thing.
       */
      tags: await pills,
      stages,
      exhausted: candidates.length < need,
      lastfmError,
      moodError,
      moodMs,
      genrePage,
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
