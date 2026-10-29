import { redirect } from "next/navigation";
import { PlaylistPage } from "@/components/detail/playlist-page";
import { isPlaylistId } from "@/lib/db/playlists";

/**
 * Two kinds of playlist share this address: the ones made in Superlike have a
 * uuid for an id, Spotify's own are 22 characters of base62 and can never be one.
 *
 * A Superlike playlist has no page of its own any more: it opens in the panel
 * on the mypage. The address still works for links made before that, and sends
 * them there.
 */
export default async function Playlist({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (isPlaylistId(id)) redirect(`/mypage?playlist=${id}`);
  return <PlaylistPage id={id} />;
}
