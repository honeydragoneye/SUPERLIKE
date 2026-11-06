import { UserPage } from "@/components/detail/user-page";

export default async function User({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <UserPage id={decodeURIComponent(id)} />;
}
