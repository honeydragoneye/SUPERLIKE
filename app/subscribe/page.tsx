import { SubscribePage } from "@/components/detail/subscribe-page";

/**
 * Where STAY CONNECTED's 신청하기 button lands, and where the links in the
 * mails land (?confirm= / ?unsubscribe=).
 */
export default async function Subscribe({
  searchParams,
}: {
  searchParams: Promise<{ confirm?: string; unsubscribe?: string }>;
}) {
  const { confirm, unsubscribe } = await searchParams;
  return <SubscribePage confirm={confirm} unsubscribe={unsubscribe} />;
}
