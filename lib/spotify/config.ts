/**
 * What the app actually calls, and no more: the Web Playback SDK (which asks for
 * the account's email and plan too), controlling that player, and the recent plays
 * the home screen and the listening stats are built from. Hearts and playlists
 * live in Superlike's own database, so the library and playlist scopes are not
 * asked for. Adding a scope invalidates existing grants, so a new one is added
 * together with the code that needs it.
 */
export const SPOTIFY_SCOPES = [
  // Web Playback SDK
  "streaming",
  "user-read-email",
  "user-read-private",
  // play, pause, seek, queue, shuffle, repeat, move playback to the web player
  "user-modify-playback-state",
  "user-read-recently-played",
].join(" ");

export const COOKIE = {
  verifier: "sp_verifier",
  access: "sp_access",
  refresh: "sp_refresh",
  expires: "sp_expires",
} as const;

export function clientId(): string {
  const id = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID;
  if (!id) throw new Error("NEXT_PUBLIC_SPOTIFY_CLIENT_ID is not set");
  return id;
}

export function redirectUri(): string {
  const uri = process.env.SPOTIFY_REDIRECT_URI;
  if (!uri) throw new Error("SPOTIFY_REDIRECT_URI is not set");
  return uri;
}
