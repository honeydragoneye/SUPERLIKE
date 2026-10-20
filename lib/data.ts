/**
 * How many results one search request returns.
 *
 * Measured against this app's own credentials: Spotify rejects a limit of 20
 * and above, so a longer list has to be paged rather than asked for at once.
 */
export const SEARCH_PAGE = 10;

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
  /** sized for the 32px row thumbnail */
  artwork: string | null;
  /** sized for the 231px Now Playing panel, which falls back to this track
   *  after a reload — the row-sized image came out blurred there */
  artworkLarge: string | null;
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

/** The signed-in account, from /me — what 마이페이지 heads the screen with. */
export type Profile = {
  id: string;
  name: string;
  avatar: string | null;
  /** Spotify's own word for the plan: "premium", "free", … */
  product: string | null;
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
  /** a cover big enough for a card, where `artwork` is sized for a list row */
  artworkLarge: string | null;
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

/* ---------------------------------------------------------------
   Artist and album screens. Shaped by what Spotify still returns:
   Related Artists is withdrawn and the artist's own `genres`,
   `followers` and `popularity` are deprecated, so the artist screen
   falls back to Last.fm and says which source it used.
   --------------------------------------------------------------- */

export type ArtistTopTrack = {
  id: string;
  uri: string;
  name: string;
  durationMs: number;
  explicit: boolean;
  albumId: string;
  albumName: string;
  artwork: string | null;
};

export type ArtistAlbum = {
  id: string;
  uri: string;
  name: string;
  artwork: string | null;
  releaseDate: string;
  totalTracks: number;
  albumType: "album" | "single" | "compilation";
};

export type ArtistPage = {
  id: string;
  uri: string;
  name: string;
  image: string | null;
  genres: string[];
  /** which source the genres came from, so the screen can label them honestly */
  genreSource: "spotify" | "lastfm" | "none";
  followers: number | null;
  popularity: number | null;
  topTracks: ArtistTopTrack[];
  /** Spotify's top-tracks endpoint is 403 for this app, so this may be Last.fm */
  topSource: "spotify" | "lastfm" | "none";
  albums: ArtistAlbum[];
  /** Last.fm's neighbours — Spotify's Related Artists is gone */
  similar: { name: string; match: number }[];
};

export type AlbumTrack = {
  id: string;
  uri: string;
  name: string;
  durationMs: number;
  explicit: boolean;
  trackNumber: number;
  discNumber: number;
  artist: string;
};

export type AlbumPage = {
  id: string;
  uri: string;
  name: string;
  artwork: string | null;
  releaseDate: string;
  releaseDatePrecision: string;
  totalTracks: number;
  albumType: "album" | "single" | "compilation";
  /** deprecated on Spotify's side; omitted by the screen when null */
  label: string | null;
  artists: { id: string; name: string }[];
  copyrights: string[];
  upc: string | null;
  tracks: AlbumTrack[];
};

export type PlaylistTrack = {
  index: string;
  id: string;
  uri: string;
  name: string;
  artist: string;
  album: string;
  artwork: string | null;
  durationMs: number;
  explicit: boolean;
  addedAt: string | null;
};

export type PlaylistPage = {
  id: string;
  uri: string;
  name: string;
  description: string | null;
  cover: string | null;
  owner: string;
  followers: number | null;
  collaborative: boolean;
  isPublic: boolean | null;
  totalTracks: number;
  tracks: PlaylistTrack[];
};
