import { RecentlyPlayed } from "@/components/recently-played";
import { MyPlaylist } from "@/components/my-playlist";

/**
 * Home: the listening history over the user's own playlists.
 *
 * The blocks sit directly in the shell's column, with no wrapper between. A
 * `flex-1` wrapper here stopped the page scrolling: flex-basis 0 made the
 * column measure its content as nothing, so it stayed at viewport height while
 * two and a half thousand pixels of rows sat inside it. Every other screen is
 * a direct child for the same reason.
 */
export default function Home() {
  return (
    <>
      <RecentlyPlayed />
      <MyPlaylist />
    </>
  );
}
