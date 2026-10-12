import { Placeholder } from "@/components/detail/placeholder";

/**
 * Where the rail's EDITOR'S PICK block lands.
 *
 * Routed and empty on purpose, like the signup screen: the block has been on
 * the home screen since the first frame with nothing behind it. No planned
 * list — what a pick consists of is not decided yet, and inventing sections
 * here would commit the design.
 */
export default function EditorsPick() {
  return (
    <Placeholder
      eyebrow="EDITOR'S PICK"
      title="에디터스 픽"
      subtitle="이번 주에 고른 플레이리스트"
    />
  );
}
