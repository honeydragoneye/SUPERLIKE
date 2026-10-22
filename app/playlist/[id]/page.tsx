import { PlaylistPage } from "@/components/detail/playlist-page";
import { SuperlikePlaylistPage } from "@/components/detail/superlike-playlist-page";
import { isPlaylistId } from "@/lib/db/playlists";

/**
 * Two kinds of playlist share this address: the ones made in Superlike have a
 * uuid for an id, Spotify's own are 22 characters of base62 and can never be one.
 */
export default async function Playlist({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return isPlaylistId(id) ? <SuperlikePlaylistPage id={id} /> : <PlaylistPage id={id} />;
}
