import { ArtistPage } from "@/components/detail/artist-page";

export default async function Artist({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ArtistPage id={id} />;
}
