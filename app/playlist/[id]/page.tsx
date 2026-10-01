import { PlaylistPage } from "@/components/detail/playlist-page";

export default async function Playlist({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PlaylistPage id={id} />;
}
