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
  /**
   * Pace when requests start, but let them run side by side.
   *
   * Off by default: the APIs above count a burst against a rolling window, and
   * one at a time is what keeps this process under it.
   */
  overlap?: boolean;
};

export class RateLimitedError extends Error {
  constructor(
    readonly retryAfterSec: number,
    /** the day's quota is spent: waiting a minute will not help */
    readonly daily = false,
  ) {
    super(`rate_limited (retry after ${retryAfterSec}s${daily ? ", daily quota" : ""})`);
  }
}

/** How often a spent daily quota is tried again, so the next call after it resets is not refused for hours. */
const DAILY_RECHECK_SEC = 30 * 60;

/**
 * How long a 429 asks us to wait, and whether it is the day's quota.
 *
 * Spotify says so in a `Retry-After` header. Gemini does not: it puts a
 * `RetryInfo` ("12s") and, for a spent daily quota, a `QuotaFailure` whose
 * quota id ends in PerDay in the JSON body. Reading only the header made every
 * Gemini 429 look like "wait one second", so a daily limit was retried, and
 * failed, on every call.
 */
async function limitOf(res: Response): Promise<{ retryAfterSec: number; daily: boolean }> {
  let retryAfterSec = Number(res.headers.get("Retry-After")) || 0;
  let daily = false;
  try {
    const body = (await res.clone().json()) as {
      error?: { details?: { "@type"?: string; retryDelay?: string; violations?: { quotaId?: string }[] }[] };
    };
    for (const d of body.error?.details ?? []) {
      if (d["@type"]?.endsWith("RetryInfo") && !retryAfterSec) retryAfterSec = Math.ceil(parseFloat(d.retryDelay ?? "0")) || 0;
      if (d["@type"]?.endsWith("QuotaFailure") && d.violations?.some((v) => v.quotaId?.includes("PerDay"))) daily = true;
    }
  } catch {
    // not JSON, or not an error body: the header (or one second) is all there is
  }
  return { retryAfterSec: retryAfterSec || 1, daily };
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
  let blockedDaily = false;

  const {
    minGapMs,
    retryOn429 = false,
    retryOn5xx = false,
    maxRetries = 3,
    timeoutMs = 10_000,
    headers: baseHeaders,
    overlap = false,
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
    const started = chain.then(async () => {
      const gap = minGapMs - (Date.now() - lastStart);
      if (gap > 0) await sleep(gap);
      lastStart = Date.now();
    });
    const result = started.then(run);
    // a failed request must not break the queue for everyone behind it
    chain = overlap ? started : result.catch(() => undefined);
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

  /**
   * `force` skips the lockout check for one request.
   *
   * For a press the listener made themselves — play — where "failing fast" would
   * be deciding for Spotify. The request still goes through the queue, and a 429
   * still renews the lockout, so forcing cannot deepen it: it only finds out
   * whether this particular call is refused too.
   */
  return async function request(url: string, init?: RequestInit, opts?: { force?: boolean }): Promise<Response> {
    const waitLeft = Math.ceil((blockedUntil - Date.now()) / 1000);
    if (waitLeft > 0 && !opts?.force) throw new RateLimitedError(waitLeft, blockedDaily);

    for (let attempt = 0; ; attempt++) {
      const res = await paced(() => once(url, init));

      if (res.status === 429) {
        const limit = await limitOf(res);
        const retryAfterSec = limit.daily ? Math.max(limit.retryAfterSec, DAILY_RECHECK_SEC) : limit.retryAfterSec;

        // longer than we could ever sit out: record it and stop trying
        if (retryAfterSec * 1000 > MAX_BACKOFF_MS) {
          blockedUntil = Date.now() + retryAfterSec * 1000;
          blockedDaily = limit.daily;
          console.warn(
            `[throttle] ${new URL(url).pathname} locked out for ${retryAfterSec}s — ` +
              `failing fast until ${new Date(blockedUntil).toLocaleString("ko-KR")}`,
          );
          throw new RateLimitedError(retryAfterSec, limit.daily);
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

      // a forced press getting through says nothing about the calls that were not forced
      if (res.ok && !opts?.force) {
        blockedUntil = 0;
        blockedDaily = false;
      }
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
/**
 * Gemini's requests overlap, which the others' do not.
 *
 * They went one after the other at first, and on a slow afternoon that was the
 * whole wait: three requests at 7.9s, 8.5s and 6.7s made a 28 second tag change
 * of which Spotify and Last.fm were five. The time is Google's time to a first
 * byte — measured 7–13s to start and 1–3s to finish, with no thinking tokens —
 * so nothing sent differently shortens one request; only not queueing them
 * does. The gap still spaces the starts.
 *
 * The timeout is long because the answer time is not stable: fifteen tracks
 * measured 1.3–2.6s one morning and 7–13s the same afternoon, on the same
 * model, with a two-track request taking as long as a twenty-track one. A
 * timeout sized for the morning would have failed every request after lunch.
 */
export const geminiHttp = createThrottled({
  minGapMs: 300,
  retryOn429: true,
  maxRetries: 2,
  timeoutMs: 30_000,
  overlap: true,
});
