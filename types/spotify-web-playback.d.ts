/** Minimal typings for the Spotify Web Playback SDK global. */
declare namespace Spotify {
  type Artist = { name: string; uri: string };
  type Image = { url: string; height: number | null; width: number | null };

  type Track = {
    id: string | null;
    uri: string;
    name: string;
    duration_ms: number;
    artists: Artist[];
    album: { name: string; uri: string; images: Image[] };
  };

  type PlaybackState = {
    context: { uri: string | null; metadata?: unknown };
    paused: boolean;
    position: number;
    duration: number;
    shuffle: boolean;
    repeat_mode: 0 | 1 | 2;
    track_window: { current_track: Track; next_tracks: Track[] };
  };

  type ErrorEvent = { message: string };
  type ReadyEvent = { device_id: string };

  class Player {
    constructor(options: {
      name: string;
      getOAuthToken: (cb: (token: string) => void) => void;
      volume?: number;
    });
    connect(): Promise<boolean>;
    disconnect(): void;
    togglePlay(): Promise<void>;
    pause(): Promise<void>;
    resume(): Promise<void>;
    nextTrack(): Promise<void>;
    previousTrack(): Promise<void>;
    seek(positionMs: number): Promise<void>;
    setVolume(volume: number): Promise<void>;
    getCurrentState(): Promise<PlaybackState | null>;
    addListener(event: "ready" | "not_ready", cb: (e: ReadyEvent) => void): boolean;
    addListener(event: "player_state_changed", cb: (s: PlaybackState | null) => void): boolean;
    addListener(
      event: "initialization_error" | "authentication_error" | "account_error" | "playback_error",
      cb: (e: ErrorEvent) => void,
    ): boolean;
    removeListener(event: string): boolean;
  }
}

interface Window {
  Spotify?: typeof Spotify;
  onSpotifyWebPlaybackSDKReady?: () => void;
}
