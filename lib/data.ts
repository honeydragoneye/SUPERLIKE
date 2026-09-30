export type Track = {
  index: string;
  title: string;
  artist: string;
  time: string;
};

/** A row in the "최근 재생 목록" block — shape mirrors /me/player/recently-played. */
export type RecentTrack = {
  index: string;
  title: string;
  artist: string;
  artwork: string | null;
  /** ISO timestamp from Spotify */
  playedAt: string;
  durationMs: number;
  uri: string;
};

/** A playlist or station from /me/playlists. */
export type Playlist = {
  id: string;
  uri: string;
  name: string;
  owner: string;
  trackCount: number;
  cover: string | null;
  collaborative: boolean;
};

/** Sleeve colours, cycled when a playlist has no cover art of its own. */
export const SLEEVE_TONES = ["mint", "gold", "pink", "violet"] as const;
export type SleeveTone = (typeof SLEEVE_TONES)[number];

/* ---------------------------------------------------------------
   Search results. One shape per tab, each flattened from Spotify's
   response so the UI never reaches into raw API objects.
   --------------------------------------------------------------- */

export type SearchTrack = {
  id: string;
  uri: string;
  name: string;
  artist: string;
  album: string;
  artwork: string | null;
  durationMs: number;
  explicit: boolean;
  popularity: number;
  /** 30s clip; absent for much of the catalogue */
  previewUrl: string | null;
};

export type SearchAlbum = {
  id: string;
  uri: string;
  name: string;
  artist: string;
  artwork: string | null;
  releaseDate: string;
  totalTracks: number;
  albumType: "album" | "single" | "compilation";
};

export type SearchArtist = {
  id: string;
  uri: string;
  name: string;
  image: string | null;
  genres: string[];
  followers: number;
  popularity: number;
};

export type SearchResults = {
  query: string;
  tracks: SearchTrack[];
  albums: SearchAlbum[];
  artists: SearchArtist[];
  playlists: Playlist[];
};
