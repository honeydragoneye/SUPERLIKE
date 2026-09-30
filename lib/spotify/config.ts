/**
 * Playback control on a Premium account, plus the read scopes the home screen
 * needs. Adding a scope invalidates existing grants, so they are requested
 * together to keep re-consent to a single round trip.
 */
export const SPOTIFY_SCOPES = [
  // Web Playback SDK
  "streaming",
  "user-read-email",
  "user-read-private",
  "user-read-playback-state",
  "user-modify-playback-state",
  // library reads
  "user-read-recently-played",
  "user-top-read",
  "user-library-read",
  "playlist-read-private",
  "playlist-read-collaborative",
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
