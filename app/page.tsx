import { LikedTracks } from "@/components/mypage/liked-tracks";
import { PlaylistShelf } from "@/components/mypage/playlist-shelf";
import { ReleasesBlock } from "@/components/home/releases-block";
import { TasteBlock } from "@/components/home/taste-block";

/**
 * Home: what to listen to next, then what the listener keeps.
 *
 * Taste and recommendations first, then what came out lately, and the hearted
 * songs and the playlists under them. The history that used to open this screen is on the mypage, with the
 * account it belongs to.
 *
 * The blocks sit directly in the shell's column, with no flex-1 wrapper
 * between: that stopped the page scrolling once, because flex-basis 0 made the
 * column measure its content as nothing. Every other screen is a direct child
 * for the same reason.
 */
export default function Home() {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-chart text-on-bright">
      <TasteBlock />
      <ReleasesBlock />
      <LikedTracks />
      <PlaylistShelf />
    </div>
  );
}
