"use client";

import type { Playlist, RecentTrack } from "@/lib/data";
import {
  useStation,
  type StationSeed,
} from "@/components/station/use-station";
import type { StationCandidate } from "@/app/api/station/similar/route";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const SDK_SRC = "https://sdk.scdn.co/spotify-player.js";

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
  album: string;
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
  shuffle: boolean;
  /** 0 off · 1 whole context · 2 single track — the SDK's own encoding */
  repeatMode: 0 | 1 | 2;
  toggleShuffle: () => Promise<void>;
  cycleRepeat: () => Promise<void>;
  /** the signed-in user's listening history */
  recent: RecentTrack[];
  recentLive: boolean;
  recentError: string | null;
  refreshRecent: () => Promise<void>;
  /** station: an app-managed queue, rebuildable without touching what plays */
  stationQueue: StationCandidate[];
  stationSeed: string | null;
  stationBusy: string | null;
  stationActive: boolean;
  startStation: (seed: StationSeed) => Promise<void>;
  stopStation: () => void;
  playFromStation: (track: StationCandidate) => Promise<void>;
  /** the signed-in user's own playlists and stations */
  playlists: Playlist[];
  playlistTotal: number;
  playlistsLoaded: boolean;
  playlistError: string | null;
  error: string | null;
  isPlaying: boolean;
  play: (opts?: PlayOptions) => Promise<void>;
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
  const sourceOrderRef = useRef<QueueTrack[]>([]);
  const [shuffle, setShuffle] = useState(false);
  const [repeatMode, setRepeatMode] = useState<0 | 1 | 2>(0);
  const [recent, setRecent] = useState<RecentTrack[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [playlistTotal, setPlaylistTotal] = useState(0);
  const [playlistError, setPlaylistError] = useState<string | null>(null);
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
      player.addListener("not_ready", () => setReady(false));
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
          album: t.album.name,
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

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/spotify/me/playlists", { cache: "no-store" });
      if (cancelled) return;
      if (!res.ok) {
        setPlaylistError(
          res.status === 401 || res.status === 403
            ? "권한 부족 — DISCONNECT 후 다시 연결해 주세요"
            : "불러오지 못했습니다",
        );
        return;
      }
      const body = (await res.json()) as { playlists: Playlist[]; total: number };
      if (cancelled) return;
      setPlaylists(body.playlists);
      setPlaylistTotal(body.total);
      setPlaylistError(null);
    })();
    return () => {
      cancelled = true;
    };
  }, [connected]);

  const play = useCallback(
    async (opts: PlayOptions = {}) => {
      if (!deviceId) return;
      if (opts.tracks) {
        sourceOrderRef.current = opts.tracks;
        setQueue(opts.tracks);
      }
      const res = await fetch("/api/spotify/play", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          deviceId,
          uris: opts.uris,
          contextUri: opts.contextUri,
          offsetUri: opts.offsetUri,
          positionMs: opts.positionMs,
          activate: !activatedRef.current,
        }),
      });
      activatedRef.current = true;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? data.error ?? "재생에 실패했습니다.");
      } else {
        setError(null);
      }
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
    async (payload: Record<string, unknown>) => {
      const res = await fetch("/api/spotify/player", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, deviceId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.detail ?? data.error ?? "설정을 바꾸지 못했습니다.");
      } else {
        setError(null);
      }
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
      recentError,
      refreshRecent,
      stationQueue: station.queue,
      stationSeed: station.seedLabel,
      stationBusy: station.busy,
      stationActive: station.isActive,
      startStation: async (seed) => {
        stationOwnsShuffleRef.current = false;
        setShuffle(false);
        await station.startStation(seed);
      },
      stopStation: station.stopStation,
      playFromStation: station.playFromQueue,
      playlists: playlists ?? [],
      playlistTotal,
      playlistsLoaded: connected && playlists !== null,
      playlistError,
      error,
      play,
      toggle: async () => {
        const p = playerRef.current;
        if (!p) return;
        const state = await p.getCurrentState();
        if (!state) return play();
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
        setRecent(null);
        setPlaylists(null);
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
      shuffle,
      repeatMode,
      setMode,
      recent,
      recentError,
      refreshRecent,
      station,
      playlists,
      playlistTotal,
      playlistError,
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
