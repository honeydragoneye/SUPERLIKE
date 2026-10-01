/**
 * Per-domain request pacing for the external APIs.
 *
 * Spotify, Last.fm and LRCLIB all answer bursts with 429, and the station
 * queue is exactly a burst: one similarity lookup fans out into a lyrics check
 * per candidate. Every server-side call to those APIs goes through here.
 *
 * Server only — module state would be pointless in the browser, and these
 * wrappers are used from route handlers.
 */

export type ThrottleOptions = {
  /** minimum gap between two requests to this API */
  minGapMs: number;
  /** honour a 429 and try again, up to `maxRetries` times */
  retryOn429?: boolean;
  /** treat a 5xx as the upstream having a moment and try again */
  retryOn5xx?: boolean;
  maxRetries?: number;
  /** give up on a silent upstream rather than hold the request open */
  timeoutMs?: number;
  /** merged into every request (LRCLIB wants a User-Agent) */
  headers?: Record<string, string>;
};

export class RateLimitedError extends Error {
  constructor(readonly retryAfterSec: number) {
    super(`rate_limited (retry after ${retryAfterSec}s)`);
  }
}

/** Longest we will sit on a 429 before surfacing it. */
const MAX_BACKOFF_MS = 30_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createThrottled(options: ThrottleOptions) {
  /**
   * When this API is locked out, and until when.
   *
   * Spotify answers a badly exceeded quota with a `Retry-After` measured in
   * hours — 27,013 seconds, once — not the seconds a rolling window costs.
   * Sleeping through that is impossible, and retrying into it only deepens the
   * hole, so the gate is remembered and every later call fails at once instead
   * of spending ninety seconds discovering the same thing.
   */
  let blockedUntil = 0;

  const {
    minGapMs,
    retryOn429 = false,
    retryOn5xx = false,
    maxRetries = 3,
    timeoutMs = 10_000,
    headers: baseHeaders,
  } = options;

  /**
   * Requests queue behind one another on this chain.
   *
   * Comparing against a bare `lastCall` timestamp looks equivalent but breaks
   * under concurrency: simultaneous callers all read the same timestamp, wait
   * the same amount, then fire together — the gap collapses to zero precisely
   * when the burst needs pacing. Chaining serialises the waits instead.
   */
  let chain: Promise<unknown> = Promise.resolve();
  let lastStart = 0;

  /** Wait our turn, then start the request. */
  function paced<T>(run: () => Promise<T>): Promise<T> {
    const result = chain.then(async () => {
      const gap = minGapMs - (Date.now() - lastStart);
      if (gap > 0) await sleep(gap);
      lastStart = Date.now();
      return run();
    });
    // a failed request must not break the queue for everyone behind it
    chain = result.catch(() => undefined);
    return result;
  }

  async function once(url: string, init?: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, {
        ...init,
        headers: { ...baseHeaders, ...init?.headers },
        signal: controller.signal,
        cache: "no-store",
      });
    } finally {
      clearTimeout(timer);
    }
  }

  return async function request(url: string, init?: RequestInit): Promise<Response> {
    const waitLeft = Math.ceil((blockedUntil - Date.now()) / 1000);
    if (waitLeft > 0) throw new RateLimitedError(waitLeft);

    for (let attempt = 0; ; attempt++) {
      const res = await paced(() => once(url, init));

      if (res.status === 429) {
        const retryAfterSec = Number(res.headers.get("Retry-After") ?? "1") || 1;

        // longer than we could ever sit out: record it and stop trying
        if (retryAfterSec * 1000 > MAX_BACKOFF_MS) {
          blockedUntil = Date.now() + retryAfterSec * 1000;
          console.warn(
            `[throttle] ${new URL(url).pathname} locked out for ${retryAfterSec}s — ` +
              `failing fast until ${new Date(blockedUntil).toLocaleString("ko-KR")}`,
          );
          throw new RateLimitedError(retryAfterSec);
        }

        if (!retryOn429 || attempt >= maxRetries) {
          throw new RateLimitedError(retryAfterSec);
        }
        /**
         * Logged, because waiting here is invisible otherwise.
         *
         * A search that took forty-five seconds looked like a slow upstream
         * until this line existed; it was this process sitting out a window it
         * had filled itself.
         */
        console.warn(
          `[throttle] 429 ${new URL(url).pathname} — waiting ${retryAfterSec}s (attempt ${attempt + 1})`,
        );
        // the extra half second keeps us clear of the window's edge
        await sleep(Math.min((retryAfterSec + 0.5) * 1000, MAX_BACKOFF_MS));
        continue;
      }

      // a 5xx carries no answer, only "not right now" — and LRCLIB returns
      // them often enough that giving up costs the lyrics filter real material
      if (retryOn5xx && res.status >= 500 && attempt < maxRetries) {
        await sleep(Math.min(400 * 2 ** attempt, MAX_BACKOFF_MS));
        continue;
      }

      if (res.ok) blockedUntil = 0;
      return res;
    }
  };
}

/**
 * Gaps come from the spec, tuned against the 429s each API actually returned.
 * Spotify's limit is a short rolling window, not a daily quota, so retrying
 * after its Retry-After is the right response rather than backing off for good.
 */
export const spotifyHttp = createThrottled({ minGapMs: 120, retryOn429: true });
export const lastfmHttp = createThrottled({ minGapMs: 250, retryOn429: true });
export const lrclibHttp = createThrottled({
  minGapMs: 150,
  // measured: LRCLIB answered 503 on 2 of 6 consecutive searches
  retryOn5xx: true,
  maxRetries: 2,
  headers: { "User-Agent": "Superlike/1.0 (graduation project)" },
});
