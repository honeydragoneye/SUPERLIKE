/**
 * One refresh per refresh token, however many requests ask at once.
 *
 * Spotify's PKCE refresh tokens are single use: the answer carries a new one
 * and the old one is spent. A page load with an expired access token is several
 * requests arriving together, each holding the same cookie — the token route,
 * the history, the playlists, the profile — and each used to send that one
 * token upstream on its own. The first won; the rest presented a token that had
 * just been spent, which fails them and can get the whole grant withdrawn, the
 * access token the player was already using included.
 *
 * So the exchange is shared: callers holding the same refresh token wait on
 * the same request and are all handed the same answer.
 *
 * Kept free of imports so the rule can be run on its own.
 */

type Entry<T> = { result: Promise<T>; settledAt: number | null };

/**
 * How long a finished exchange keeps answering for the token it replaced.
 *
 * A request can be in flight with the old cookie after the exchange has
 * finished — it read its cookies before the browser stored the new ones — and
 * it must be given the same answer rather than spend the old token again. Kept
 * well under the minute of slack the expiry check allows, because a caller
 * served from here stamps the expiry from the moment it writes, not from the
 * moment the token was issued.
 */
export const REUSE_MS = 30_000;

export function createRefreshOnce<T>(now: () => number = Date.now) {
  const held = new Map<string, Entry<T>>();

  return function refreshOnce(key: string, run: () => Promise<T>): Promise<T> {
    for (const [k, entry] of held) {
      if (entry.settledAt !== null && now() - entry.settledAt > REUSE_MS) held.delete(k);
    }

    const existing = held.get(key);
    if (existing) return existing.result;

    const entry: Entry<T> = { result: run(), settledAt: null };
    held.set(key, entry);
    entry.result.then(
      () => {
        entry.settledAt = now();
      },
      // a failure is not an answer worth repeating: the next caller tries again
      () => {
        if (held.get(key) === entry) held.delete(key);
      },
    );
    return entry.result;
  };
}
