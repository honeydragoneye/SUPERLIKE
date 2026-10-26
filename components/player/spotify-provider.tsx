"use client";

import type { RecentTrack } from "@/lib/data";
import {
  useStation,
  type PlayOutcome,
  type StationSeed,
} from "@/components/station/use-station";
import { subscribeVolume, volumeServerSnapshot, volumeSnapshot, writeVolume } from "@/lib/volume";
import type { StationCandidate } from "@/lib/station/types";
import type { StationFilter } from "@/lib/station/filter";
import type { RejectTarget } from "@/lib/station/rejects";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

const SDK_SRC = "https://sdk.scdn.co/spotify-player.js";

/**
 * One array, reused, because clearing the queue has to be free.
 *
 * `setQueue([])` with a fresh literal fails the identity check every time, so
 * a station — which calls `play` once per track — rebuilt the context value and
 * re-rendered the whole grid, artwork included, on every advance. The same
 * reason the playback position lives in its own context below.
 */
const NO_QUEUE: QueueTrack[] = [];

/** How long after a track change the history is re-read. */
const RECENT_SETTLE_MS = 3_000;


export type QueueTrack = {
  uri: string;
  title: string;
  artist: string;
  artwork: string | null;
  durationMs: number;
};

export type NowPlaying = {
  uri: string;
  title: string;
  artist: string;
  /** Spotify id of the first artist, for counting plays by artist; null if the SDK gave none */
  artistId: string | null;
  album: string;
  /** Spotify album id (from the album uri), so a heart can remember which album it came from */
  albumId: string | null;
  artwork: string | null;
  durationMs: number;
  positionMs: number;
  paused: boolean;
};

export type PlayOptions = {
  uris?: string[];
  /** the rows behind `uris`, kept so UP NEXT can show the real order */
  tracks?: QueueTrack[];
  contextUri?: string;
  offsetUri?: string;
  positionMs?: number;
};

type Ctx = {
  connected: boolean;
  ready: boolean;
  deviceId: string | null;
  now: NowPlaying | null;
  /** what Spotify will play after the current track */
  nextUp: QueueTrack[];
  /** the list we handed Spotify, in the order it will play */
  queue: QueueTrack[];
  /** how far into `queue` playback has reached; -1 before it starts */
  queueIndex: number;
  shuffle: boolean;
  /** 0 off · 1 whole context · 2 single track — the SDK's own encoding */
  repeatMode: 0 | 1 | 2;
  toggleShuffle: () => Promise<void>;
  cycleRepeat: () => Promise<void>;
  /** 0 to 1: what the listener set, which stays when muted */
  volume: number;
  muted: boolean;
  /** raising it from silence also lifts the mute */
  setVolume: (v: number) => void;
  toggleMute: () => void;
  /** the signed-in user's listening history */
  recent: RecentTrack[];
  recentLive: boolean;
  /** the history has arrived, even if it is empty — told apart from "still loading" */
  recentLoaded: boolean;
  recentError: string | null;
  refreshRecent: () => Promise<void>;
  /** station: an app-managed queue, rebuildable without touching what plays */
  stationQueue: StationCandidate[];
  stationSeed: string | null;
  /** the seed track itself — the station view shows its artwork and title */
  stationSeedTrack: StationSeed | null;
  stationBusy: string | null;
  stationActive: boolean;
  /** genre tags of the seed artist, for the panel; empty when it has none */
  stationTags: string[];
  /** the station's tags — changing them rebuilds up-next only */
  stationFilter: StationFilter;
  setStationFilter: (filter: StationFilter) => Promise<void>;
  /** set when a mood tag is on and Gemini could not judge the queue */
  stationMoodError: string | null;
  /** how long the last queue build waited on Gemini, for the panel */
  stationMoodMs: number | null;
  startStation: (seed: StationSeed) => Promise<void>;
  stopStation: () => void;
  playFromStation: (track: StationCandidate) => Promise<void>;
  /** drops one upcoming track; it does not come back while this station runs */
  removeFromStation: (id: string) => void;
  /** "이 곡은 <mood> 아님" under the mood tag that is on; skips it if it is playing */
  rejectFromStation: (track: RejectTarget) => void;
  error: string | null;
  isPlaying: boolean;
  /** the station skips only on "refused", never on "unavailable" */
  play: (opts?: PlayOptions) => Promise<PlayOutcome>;
  toggle: () => Promise<void>;
  next: () => Promise<void>;
  previous: () => Promise<void>;
  seek: (ms: number) => Promise<void>;
  logout: () => Promise<void>;
};

const SpotifyContext = createContext<Ctx | null>(null);

/**
 * Playback position, published separately.
 *
 * It changes every second. Carrying it in the main context re-rendered every
 * consumer — the whole grid, images included — once a second, which reads as
 * the page flickering. Only the progress readout subscribes here.
 */
const PositionContext = createContext<number>(0);

/**
 * Spotify reports control failures as a raw JSON body. Surface something a
 * listener can act on instead, and keep the original for the console.
 */
type Restriction = { isPlayable?: boolean; reason?: string; explicit?: boolean };

function readableError(
  status: number,
  detail?: string,
  fallback?: string,
  restriction?: Restriction,
): string {
  const text = detail ?? "";
  // Spotify's own 403 says `reason: "UNKNOWN"`; the play route looks the track
  // up so the listener is told what to change rather than just that it failed
  switch (restriction?.reason) {
    case "explicit":
      return "명시적 콘텐츠로 설정된 곡입니다. Spotify 설정에서 허용해 주세요";
    case "market":
      return "이 지역에서는 재생할 수 없는 곡입니다";
    case "product":
      return "현재 요금제로는 재생할 수 없는 곡입니다";
  }
  if (restriction?.isPlayable === false) {
    return "이 계정에서는 재생할 수 없는 곡입니다";
  }
  // no catalogue restriction, but the track is explicit and the account refused
  // it: that combination only happens when explicit content is filtered
  if (status === 403 && restriction?.explicit) {
    return "19금 곡입니다. Spotify 설정에서 명시적 콘텐츠를 허용해 주세요";
  }
  if (/Restriction violated/i.test(text)) {
    return "지금은 이 동작을 할 수 없습니다";
  }
  if (/premium/i.test(text)) return "Spotify Premium 계정이 필요합니다";
  if (status === 404 || /NO_ACTIVE_DEVICE|Device not found/i.test(text)) {
    return "재생 기기를 찾을 수 없습니다. 페이지를 새로고침해 주세요";
  }
  if (status === 429) return "요청이 몰렸습니다. 잠시 후 다시 시도해 주세요";
  return fallback ?? "재생에 실패했습니다";
}

async function fetchToken(): Promise<string | null> {
  const res = await fetch("/api/spotify/token", { cache: "no-store" });
  if (!res.ok) return null;
  const data = (await res.json()) as { accessToken?: string };
  return data.accessToken ?? null;
}

function loadSdk(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.Spotify) return Promise.resolve();
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${SDK_SRC}"]`,
    );
    window.onSpotifyWebPlaybackSDKReady = () => resolve();
    if (existing) return;
    const script = document.createElement("script");
    script.src = SDK_SRC;
    script.async = true;
    document.body.appendChild(script);
  });
}

export function SpotifyProvider({ children }: { children: React.ReactNode }) {
  const [connected, setConnected] = useState(false);
  const [ready, setReady] = useState(false);
  const [deviceId, setDeviceId] = useState<string | null>(null);
  const [now, setNow] = useState<NowPlaying | null>(null);
  const [positionMs, setPositionMs] = useState(0);
  const [nextUp, setNextUp] = useState<QueueTrack[]>([]);
  const [queue, setQueue] = useState<QueueTrack[]>([]);
  const [queueIndex, setQueueIndex] = useState(-1);
  const sourceOrderRef = useRef<QueueTrack[]>([]);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<0 | 1 | 2>(0);
  const { v: volume, muted } = useSyncExternalStore(subscribeVolume, volumeSnapshot, volumeServerSnapshot);
  const [recent, setRecent] = useState<RecentTrack[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const playerRef = useRef<Spotify.Player | null>(null);
  const activatedRef = useRef(false);
  /** while a station runs, shuffle is ours — Spotify's own flag stays off */
  const stationOwnsShuffleRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const token = await fetchToken();
      if (cancelled) return;
      if (!token) {
        setConnected(false);
        return;
      }
      setConnected(true);

      await loadSdk();
      if (cancelled || !window.Spotify) return;

      const player = new window.Spotify.Player({
        name: "Superlike Web Player",
        // called again whenever the SDK needs a fresh token
        getOAuthToken: (cb) => {
          void fetchToken().then((t) => t && cb(t));
        },
        volume: 0.5,
      });
      playerRef.current = player;

      player.addListener("ready", ({ device_id }) => {
        setDeviceId(device_id);
        setReady(true);
        setError(null);

      });
      /**
       * The browser device can disappear while the tab lives on — another
       * client takes playback, or the socket drops. Remembering it as activated
       * meant every later play went to an id Spotify had forgotten, answering
       * `404 Device not found` forever. Forget the activation so the next play
       * transfers afresh.
       */
      player.addListener("not_ready", () => {
        setReady(false);
        activatedRef.current = false;
      });
      player.addListener("initialization_error", ({ message }) => setError(message));
      player.addListener("authentication_error", ({ message }) => {
        setError(message);
        setConnected(false);
      });
      player.addListener("account_error", () =>
        setError("Spotify Premium 계정이 필요합니다."),
      );
      player.addListener("playback_error", ({ message }) => setError(message));

      player.addListener("player_state_changed", (state) => {
        if (!state) {
          setNow(null);
          setNextUp([]);
          return;
        }
        // a station shuffles its own queue and never sets Spotify's flag, so
        // adopting the reported value here would switch shuffle back off on the
        // next state push — which is every skip
        if (!stationOwnsShuffleRef.current) setShuffle(state.shuffle);
        setRepeatMode(state.repeat_mode);
        const t = state.track_window.current_track;
        /**
         * Where the track now playing sits in the list we handed over.
         *
         * Spotify advances its own queue without telling us which row that
         * was, so UP NEXT has to locate it to know what is still ahead.
         * Searched forward from the last known row first: a playlist that
         * includes the same track twice would otherwise rewind the list to
         * the first copy every time the second one came round.
         *
         * A track that is in no row at all leaves the cursor alone — that is
         * playback having run past the part of a long playlist we loaded, and
         * holding the last known row empties `queueRest` so the panel falls
         * through to Spotify's own window instead of replaying a stale list.
         */
        setQueueIndex((at) => {
          const order = sourceOrderRef.current;
          if (!order.length) return -1;
          const ahead = order.findIndex((q, i) => i > at && q.uri === t.uri);
          if (ahead >= 0) return ahead;
          const anywhere = order.findIndex((q) => q.uri === t.uri);
          return anywhere >= 0 ? anywhere : at;
        });
        setNextUp(
          state.track_window.next_tracks.map((n) => ({
            uri: n.uri,
            title: n.name,
            artist: n.artists.map((a) => a.name).join(", "),
            artwork: n.album.images?.[0]?.url ?? null,
            durationMs: n.duration_ms,
          })),
        );
        setNow({
          uri: t.uri,
          title: t.name,
          artist: t.artists.map((a) => a.name).join(", "),
          artistId: t.artists[0]?.uri?.startsWith("spotify:artist:") ? t.artists[0].uri.slice(15) : null,
          album: t.album.name,
          albumId: t.album.uri?.startsWith("spotify:album:") ? t.album.uri.slice(14) : null,
          artwork: t.album.images?.[0]?.url ?? null,
          durationMs: state.duration,
          positionMs: state.position,
          paused: state.paused,
        });
        setPositionMs(state.position);

      });

      await player.connect();
    })();

    return () => {
      cancelled = true;
      playerRef.current?.disconnect();
      playerRef.current = null;
    };
  }, []);

  // tick between SDK pushes; deps stay stable so the interval is not rebuilt
  const duration = now?.durationMs ?? 0;
  const paused = now?.paused ?? true;
  const trackUri = now?.uri ?? null;
  useEffect(() => {
    if (!trackUri || paused) return;
    const id = setInterval(() => {
      setPositionMs((p) => Math.min(p + 1000, duration));
    }, 1000);
    return () => clearInterval(id);
  }, [trackUri, paused, duration]);

  // bumping the nonce re-runs the fetch below; keeping the request inside the
  // effect gives it proper cancellation and avoids a setState in the effect body
  const [recentNonce, setRecentNonce] = useState(0);
  const refreshRecent = useCallback(async () => {
    setRecentNonce((n) => n + 1);
  }, []);

  /**
   * A track changing means one has just finished, and Spotify writes a play
   * into the history when it ends — so that is the moment the list goes stale.
   * It was only ever read on load before, which left a listener looking at the
   * history as of whenever they last opened the page.
   *
   * The wait gives Spotify time to record the play, and doubles as a debounce:
   * skipping through ten tracks cancels nine of these and asks once.
   */
  const lastUriRef = useRef<string | null>(null);
  useEffect(() => {
    if (!connected) return;
    const previous = lastUriRef.current;
    lastUriRef.current = trackUri;
    // the first track of a session finishes nothing; the load already asked
    if (previous === null || previous === trackUri) return;
    const id = setTimeout(() => setRecentNonce((n) => n + 1), RECENT_SETTLE_MS);
    return () => clearTimeout(id);
  }, [connected, trackUri]);

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/spotify/me/recently-played", {
        cache: "no-store",
      });
      if (cancelled) return;
      if (!res.ok) {
        setRecentError(
          res.status === 401 || res.status === 403
            ? "권한 부족 — DISCONNECT 후 다시 연결해 주세요"
            : "불러오지 못했습니다",
        );
        return;
      }
      const body = (await res.json()) as { tracks: RecentTrack[] };
      if (cancelled) return;
      setRecent(body.tracks);
      setRecentError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [connected, recentNonce]);

  /** The player takes the level whenever it changes, and when it first becomes ready. */
  useEffect(() => {
    void playerRef.current?.setVolume(muted ? 0 : volume);
  }, [volume, muted, ready]);
  /** Raising the level from a mute also lifts the mute. */
  const setVolume = useCallback((v: number) => writeVolume({ v, muted: false }), []);
  const toggleMute = useCallback(() => {
    const now = volumeSnapshot();
    writeVolume({ v: now.v, muted: !now.muted });
  }, []);

  const play = useCallback(
    async (opts: PlayOptions = {}): Promise<PlayOutcome> => {
      if (!deviceId) return "unavailable";
      /**
       * A play is a new queue, every time.
       *
       * Keeping the previous list when this one arrives without `tracks` is
       * what emptied UP NEXT on a playlist: 전체 재생 hands Spotify a context
       * and no rows, the old list stayed behind, and the panel sliced it for a
       * track that was never in it. Clearing hands the panel back to Spotify's
       * own window, which is all we honestly know in that case.
       */
      if (opts.tracks?.length) {
        sourceOrderRef.current = opts.tracks;
        setQueue(opts.tracks);
      } else if (sourceOrderRef.current.length) {
        sourceOrderRef.current = NO_QUEUE;
        setQueue(NO_QUEUE);
      }
      setQueueIndex(-1);

      const send = (activate: boolean) =>
        fetch("/api/spotify/play", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            deviceId,
            uris: opts.uris,
            contextUri: opts.contextUri,
            offsetUri: opts.offsetUri,
            positionMs: opts.positionMs,
            activate,
          }),
        });

      let res = await send(!activatedRef.current);
      activatedRef.current = true;

      /**
       * `404 Device not found` means Spotify no longer has the device this tab
       * registered — it was taken over, or the connection lapsed. The id is
       * still good; what is missing is the transfer that makes it current. One
       * retry that transfers first recovers it without the listener noticing.
       */
      if (res.status === 404) {
        console.warn("[play] device went missing; re-activating");
        activatedRef.current = false;
        res = await send(true);
        activatedRef.current = true;
      }

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn("[play]", res.status, data);
        setError(
          readableError(res.status, data.detail, "재생에 실패했습니다", data.restriction),
        );
        /**
         * Only a 403 is Spotify having looked at the track and said no.
         *
         * Reporting every failure as "refused" broke the contract `PlayOutcome`
         * states: a 502 from a failed transfer or a 500 from our own route is
         * the request never having reached the catalogue, and the station drops
         * a track for each one. Measured in the dev log: 36 of those against 36
         * real 403s — half the skips the station made were for tracks that
         * would have played fine.
         */
        return res.status === 403 ? "refused" : "unavailable";
      }
      setError(null);
      return "played";
    },
    [deviceId],
  );

  const station = useStation({
    onPlay: async (uri) => play({ uris: [uri] }),
    currentUri: now?.uri ?? null,
    isPaused: now?.paused ?? true,
    positionMs,
    repeatOne: repeatMode === 2,
    shuffled: shuffle,
  });

  /** shuffle and repeat are Web API settings; the SDK only reports them back */
  const setMode = useCallback(
    async (payload: Record<string, unknown>, silent = false) => {
      const res = await fetch("/api/spotify/player", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, deviceId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        console.warn("[player]", res.status, data);
        // housekeeping calls must not put an error in front of the listener
        if (!silent) {
          setError(readableError(res.status, data.detail, "설정을 바꾸지 못했습니다"));
        }
        return;
      }
      setError(null);
    },
    [deviceId],
  );

  const value = useMemo<Ctx>(
    () => ({
      connected,
      ready,
      deviceId,
      now,
      isPlaying: now !== null && !now.paused,
      nextUp,
      queue,
      queueIndex,
      shuffle,
      repeatMode,
      /**
       * A station owns its own queue, so shuffling is a local reorder: the list
       * on screen changes at once and the current track is never touched.
       *
       * Without a station, playback belongs to Spotify's context and only its
       * own shuffle can reorder it — it swaps the upcoming order without
       * reloading the stream, but never reports the order it produced.
       */
      volume,
      muted,
      setVolume,
      toggleMute,
      toggleShuffle: async () => {
        const next = !shuffle;
        setShuffle(next);
        if (station.isActive) {
          stationOwnsShuffleRef.current = next;
          if (next) station.shuffleQueue();
          return;
        }
        stationOwnsShuffleRef.current = false;
        await setMode({ action: "shuffle", state: next });
      },
      cycleRepeat: async () => {
        const next = ((repeatMode + 1) % 3) as 0 | 1 | 2;
        setRepeatMode(next);
        await setMode({
          action: "repeat",
          state: next === 0 ? "off" : next === 1 ? "context" : "track",
        });
      },
      recent: recent ?? [],
      recentLive: connected && Boolean(recent?.length),
      recentLoaded: connected && recent !== null,
      recentError,
      refreshRecent,
      stationQueue: station.queue,
      stationSeed: station.seedLabel,
      stationSeedTrack: station.seed,
      stationBusy: station.busy,
      stationActive: station.isActive,
      stationTags: station.tags,
      stationFilter: station.filter,
      setStationFilter: station.setFilter,
      stationMoodError: station.moodError,
      stationMoodMs: station.moodMs,
      startStation: async (seed) => {
        /**
         * A station owns shuffle for its whole life, not just once the user
         * turns it on: Spotify's flag can still be set from an earlier PLAY ALL,
         * and the SDK would report that back the moment playback starts.
         */
        stationOwnsShuffleRef.current = true;
        setShuffle(false);
        if (deviceId) await setMode({ action: "shuffle", state: false }, true);
        await station.startStation(seed);
      },
      stopStation: () => {
        stationOwnsShuffleRef.current = false;
        setShuffle(false);
        station.stopStation();
      },
      playFromStation: station.playFromQueue,
      removeFromStation: station.removeFromQueue,
      rejectFromStation: station.rejectTrack,
      error,
      play,
      toggle: async () => {
        const p = playerRef.current;
        if (!p) return;
        const state = await p.getCurrentState();
        if (!state) {
          await play();
          return;
        }
        await p.togglePlay();
      },
      /**
       * A station hands Spotify one track at a time, so its account-level skip
       * has nothing to advance to — the app's own queue is the real one.
       * The SDK's skip stalls on a uri-list queue, hence the endpoints below
       * for everything else.
       */
      next: async () => {
        /**
         * With 한 곡 반복 on, skipping restarts the track rather than leaving
         * it — the repeat setting is the user's stated intent, and seeking to
         * zero does it without reloading the stream.
         */
        if (repeatMode === 2 && now) {
          const p = playerRef.current;
          if (p) {
            await p.seek(0);
            const state = await p.getCurrentState();
            if (state?.paused) await p.resume();
            return;
          }
        }
        if (station.isActive) return station.playFromQueue();
        await setMode({ action: "next" });
      },
      previous: async () => {
        if (station.isActive && (await station.playPrevious())) return;
        if (station.isActive) return;
        await setMode({ action: "previous" });
      },
      seek: async (ms: number) => playerRef.current?.seek(ms),
      logout: async () => {
        await fetch("/api/spotify/logout", { method: "POST" });
        playerRef.current?.disconnect();
        setConnected(false);
        setReady(false);
        setNow(null);
        setNextUp([]);
        sourceOrderRef.current = NO_QUEUE;
        setQueue(NO_QUEUE);
        setQueueIndex(-1);
        setRecent(null);
        stationOwnsShuffleRef.current = false;
        station.stopStation();
      },
    }),
    [
      connected,
      ready,
      deviceId,
      now,
      nextUp,
      queue,
      queueIndex,
      shuffle,
      repeatMode,
      volume,
      muted,
      setVolume,
      toggleMute,
      setMode,
      recent,
      recentError,
      refreshRecent,
      station,
      error,
      play,
    ],
  );

  return (
    <SpotifyContext.Provider value={value}>
      <PositionContext.Provider value={positionMs}>{children}</PositionContext.Provider>
    </SpotifyContext.Provider>
  );
}

/** Live playback position in ms. Subscribe only where it is displayed. */
export function usePlaybackPosition(): number {
  return useContext(PositionContext);
}

export function useSpotify(): Ctx {
  const ctx = useContext(SpotifyContext);
  if (!ctx) throw new Error("useSpotify must be used inside <SpotifyProvider>");
  return ctx;
}
