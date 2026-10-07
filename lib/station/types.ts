import type { StationFilter } from "@/lib/station/filter";

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
};

/** The rungs of the fallback ladder, in the order they are tried. */
export type StationSource = "similar" | "seed" | "artists" | "genre" | "instrumental";

export type StationStage = {
  source: StationSource;
  /** Last.fm name pairs this rung offered */
  offered: number;
  /** of those, how many resolved to a playable Spotify track */
  resolved: number;
  /** of those, how many survived the lyrics filter */
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
  seenIds: string[];
  seenLfm: string[];
};

export type StationQueueResponse = {
  candidates: StationCandidate[];
  stages: StationStage[];
  /** true when every rung ran and the queue still came up short */
  exhausted: boolean;
  lastfmError: string | null;
};
