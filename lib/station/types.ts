import type { MoodKey, StationFilter } from "@/lib/station/filter";

/** A queue entry: a Last.fm suggestion already resolved to a playable track. */
export type StationCandidate = {
  id: string;
  uri: string;
  name: string;
  artist: string;
  artwork: string | null;
  durationMs: number;
  /** what Last.fm called it, kept for de-duplication across sources */
  lfmKey: string;
  /** LRCLIB's verdict, when the filter made us ask; null means unknown */
  instrumental?: boolean | null;
  /** Spotify's 19금 flag — free with the search that resolved the track */
  explicit?: boolean;
  /** Gemini's verdict, when one has been given; absent means never answered */
  moods?: MoodKey[];
};

/** The rungs of the fallback ladder, in the order they are tried. */
export type StationSource = 
  | "similar"
  | "seed"
  | "artists"
  | "genre"
  | "instrumental"
  | "mood";

export type StationStage = {
  source: StationSource;
  /** Last.fm name pairs this rung offered */
  offered: number;
  /** under a mood tag, how many Gemini said carry it — the only ones looked up */
  fits?: number;
  /** of those, how many resolved to a playable Spotify track */
  resolved: number;
  /** of those, how many survived the filter */
  kept: number;
  /** wall time this rung spent */
  ms: number;
  /** abandoned on a losing streak rather than exhausted */
  gaveUp: boolean;
};

export type StationQueueRequest = {
  seed: { id: string; name: string; artist: string };
  /** the track to branch from — the last one played, or the seed on a cold start */
  basis?: { name: string; artist: string };
  need: number;
  filter: StationFilter;
  /** the seed's genre tags, for the panel — asked for once, not on every refill */
  wantTags?: boolean;
  /** which page of a chosen genre's chart to start from; 1 when absent */
  genrePage?: number;
  seenIds: string[];
  seenLfm: string[];
};

export type StationQueueResponse = {
  candidates: StationCandidate[];
  /** genre tags of the seed artist; empty when Last.fm has none for them */
  tags: string[];
  stages: StationStage[];
  /** true when every rung ran and the queue still came up short */
  exhausted: boolean;
  lastfmError: string | null;
  /** set when a mood tag was on and Gemini could not be asked */
  moodError: string | null;
  /** time this build spent waiting on Gemini; 0 without a mood tag */
  moodMs: number;
  /** the page of a chosen genre's chart the next build should start from */
  genrePage: number;
};
