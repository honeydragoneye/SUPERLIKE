import { AlbumPage } from "@/components/detail/album-page";

export default async function Album({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AlbumPage id={id} />;
}
