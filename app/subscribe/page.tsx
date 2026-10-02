import { Placeholder } from "@/components/detail/placeholder";

/**
 * Where STAY CONNECTED's 신청하기 button lands.
 *
 * Routed and empty on purpose: the rail has been advertising a newsletter
 * since the first frame, and a button that goes nowhere reads as a broken
 * screen rather than an unbuilt one. No planned list — what the signup asks
 * for is not decided yet, and inventing fields here would commit the design.
 */
export default function Subscribe() {
  return (
    <Placeholder
      eyebrow="SUBSCRIBE"
      title="신청하기"
      subtitle="매주 금요일, 취향으로 고른 25곡"
    />
  );
}
