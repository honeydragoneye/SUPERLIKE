"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type Hls from "hls.js";
import { useSpotify } from "@/components/player/spotify-provider";

/** A station as the bar and the popover draw it. `matched` is set on a pick, and says which of the listener's genres it carries. */
export type RadioStation = {
  uuid: string;
  name: string;
  country: string;
  countryCode: string;
  tags: string[];
  favicon: string | null;
  /** the station's own website; a link on its name */
  homepage?: string | null;
  matched?: string[];
};

export type FavoriteStation = RadioStation & { favoritedAt: number; lastPlayedAt: number | null };

export type RadioStatus = "idle" | "loading" | "playing" | "error";

type Picks = {
  /** the first answer is still on its way */
  loading: boolean;
  /** false: not enough listening yet to say what the listener likes */
  ready: boolean;
  tags: string[];
  stations: RadioStation[];
  failed: boolean;
};

type Ctx = {
  /** the station the bar shows: playing, or about to be */
  current: RadioStation | null;
  status: RadioStatus;
  picks: Picks;
  favorites: FavoriteStation[];
  isFavorite: (uuid: string) => boolean;
  /** plays `station`, or the current one when none is given; a playing station is paused instead */
  toggle: (station?: RadioStation) => Promise<void>;
  toggleFavorite: (station: RadioStation) => Promise<void>;
  /** asks for the next set of picks */
  refreshPicks: () => Promise<void>;
  /** set when a heart could not be saved */
  favoriteError: string | null;
};

const RadioContext = createContext<Ctx | null>(null);

const NO_FAVORITES: FavoriteStation[] = [];
const NO_PICKS: Picks = { loading: true, ready: false, tags: [], stations: [], failed: false };

type PickBody = { ready?: boolean; tags?: string[]; stations?: RadioStation[] };

/**
 * The ON AIR bar's radio.
 *
 * Lives above the page so a station keeps playing as the listener moves around,
 * exactly like Spotify does. One `<audio>` element plays it; a stream that is
 * HLS (a signed `.m3u8`, as KBS serves) goes through hls.js, except where the
 * browser plays that natively.
 *
 * Radio and Spotify never play together: starting one pauses the other.
 */
export function RadioProvider({ children }: { children: ReactNode }) {
  const { connected, isPlaying: spotifyPlaying, toggle: toggleSpotify } = useSpotify();

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  /** a newer play request makes an older one's late answer void */
  const attempt = useRef(0);

  const [current, setCurrent] = useState<RadioStation | null>(null);
  const [status, setStatus] = useState<RadioStatus>("idle");
  const [picks, setPicks] = useState<Picks>(NO_PICKS);
  const [favorites, setFavorites] = useState<FavoriteStation[]>([]);
  const [favoriteError, setFavoriteError] = useState<string | null>(null);
  const round = useRef(0);

  const stop = useCallback(() => {
    attempt.current++;
    hlsRef.current?.destroy();
    hlsRef.current = null;
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
    }
    setStatus("idle");
  }, []);

  // the account's hearted stations, and picks for its taste, once there is an account
  useEffect(() => {
    if (!connected) return;
    let live = true;
    (async () => {
      const [fav, pick] = await Promise.all([
        fetch("/api/me/radio", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
        fetch("/api/radio/recommend", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null),
      ]);
      if (!live) return;
      if (fav?.stations) setFavorites(fav.stations as FavoriteStation[]);
      const body = pick as PickBody | null;
      setPicks({
        loading: false,
        ready: body?.ready === true,
        tags: body?.tags ?? [],
        stations: body?.stations ?? [],
        failed: body === null,
      });
    })();
    return () => {
      live = false;
    };
  }, [connected]);

  // nothing of a previous account shows once the session is gone
  const favoritesShown = connected ? favorites : NO_FAVORITES;
  const picksShown = connected ? picks : NO_PICKS;

  // what the bar offers before anything is played: the first pick, else the favourite heard last
  const offered = picksShown.stations[0] ?? favoritesShown[0] ?? null;
  const shown = current ?? offered;

  const play = useCallback(
    async (station: RadioStation) => {
      const audio = audioRef.current;
      if (!audio) return;
      const mine = ++attempt.current;
      setCurrent(station);
      setStatus("loading");

      // two things never play at once
      if (spotifyPlaying) await toggleSpotify();

      try {
        const res = await fetch(`/api/radio/stream?uuid=${encodeURIComponent(station.uuid)}`, { cache: "no-store" });
        if (mine !== attempt.current) return;
        if (!res.ok) throw new Error("no_stream");
        const { url, hls } = (await res.json()) as { url: string; hls: boolean };

        hlsRef.current?.destroy();
        hlsRef.current = null;

        if (hls && !audio.canPlayType("application/vnd.apple.mpegurl")) {
          const { default: HlsJs } = await import("hls.js");
          if (mine !== attempt.current) return;
          if (!HlsJs.isSupported()) throw new Error("hls_unsupported");
          const player = new HlsJs();
          hlsRef.current = player;
          player.on(HlsJs.Events.ERROR, (_e, data) => {
            if (data.fatal && mine === attempt.current) setStatus("error");
          });
          player.loadSource(url);
          player.attachMedia(audio);
        } else {
          audio.src = url;
        }
        await audio.play();
        if (mine !== attempt.current) return;
        setStatus("playing");

        // the list is ordered by when each was heard last
        if (favorites.some((f) => f.uuid === station.uuid)) {
          setFavorites((list) =>
            list.map((f) => (f.uuid === station.uuid ? { ...f, lastPlayedAt: Date.now() } : f)),
          );
          void fetch("/api/me/radio", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "played", station: { uuid: station.uuid } }),
          }).catch(() => {});
        }
      } catch {
        if (mine === attempt.current) setStatus("error");
      }
    },
    [favorites, spotifyPlaying, toggleSpotify],
  );

  const toggle = useCallback(
    async (station?: RadioStation) => {
      const target = station ?? shown;
      if (!target) return;
      if (target.uuid === current?.uuid && (status === "playing" || status === "loading")) {
        stop();
        return;
      }
      await play(target);
    },
    [shown, current, status, stop, play],
  );

  // Spotify starting takes the sound back
  useEffect(() => {
    // the radio's state follows Spotify's, an external player: that is what this effect is for
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (spotifyPlaying && (status === "playing" || status === "loading")) stop();
    // only the moment Spotify starts matters
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotifyPlaying]);

  // a stream that ends or stalls for good is an error, not silence
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const failed = () => setStatus((s) => (s === "playing" || s === "loading" ? "error" : s));
    audio.addEventListener("error", failed);
    audio.addEventListener("ended", failed);
    return () => {
      audio.removeEventListener("error", failed);
      audio.removeEventListener("ended", failed);
    };
  }, []);

  useEffect(() => () => hlsRef.current?.destroy(), []);

  const toggleFavorite = useCallback(
    async (station: RadioStation) => {
      if (!connected) return;
      const was = favorites.some((f) => f.uuid === station.uuid);
      setFavoriteError(null);
      // the heart moves at once; it goes back if the account could not take it
      setFavorites((list) =>
        was
          ? list.filter((f) => f.uuid !== station.uuid)
          : [{ ...station, favoritedAt: Date.now(), lastPlayedAt: null }, ...list],
      );
      try {
        const res = await fetch("/api/me/radio", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: was ? "remove" : "add",
            station: {
              uuid: station.uuid,
              name: station.name,
              country: station.country,
              countryCode: station.countryCode,
              tags: station.tags,
              favicon: station.favicon,
              homepage: station.homepage ?? null,
            },
          }),
        });
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error ?? "failed");
        }
      } catch (e) {
        setFavorites((list) =>
          was
            ? [{ ...station, favoritedAt: Date.now(), lastPlayedAt: null }, ...list]
            : list.filter((f) => f.uuid !== station.uuid),
        );
        setFavoriteError(
          e instanceof Error && e.message === "favorites_limit"
            ? "즐겨찾기는 100개까지 담을 수 있어요"
            : "즐겨찾기를 저장하지 못했어요",
        );
      }
    },
    [connected, favorites],
  );

  const refreshPicks = useCallback(async () => {
    round.current += 1;
    const res = await fetch(`/api/radio/recommend?round=${round.current}`, { cache: "no-store" }).catch(() => null);
    if (!res?.ok) return;
    const body = (await res.json()) as PickBody;
    setPicks((p) => ({ ...p, stations: body.stations ?? p.stations, tags: body.tags ?? p.tags }));
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      current: shown,
      status,
      picks: picksShown,
      favorites: favoritesShown,
      isFavorite: (uuid) => favoritesShown.some((f) => f.uuid === uuid),
      toggle,
      toggleFavorite,
      refreshPicks,
      favoriteError,
    }),
    [shown, status, picksShown, favoritesShown, toggle, toggleFavorite, refreshPicks, favoriteError],
  );

  return (
    <RadioContext.Provider value={value}>
      {children}
      <audio ref={audioRef} preload="none" />
    </RadioContext.Provider>
  );
}

export function useRadio(): Ctx {
  const ctx = useContext(RadioContext);
  if (!ctx) throw new Error("useRadio must be used inside RadioProvider");
  return ctx;
}
