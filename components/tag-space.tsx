/**
 * The rail slot on the station and search screens.
 *
 * Deliberately empty — this is where the station's tag filters
 * (전체 / 가사 없음 / 가사 있음) will live. It renders as the plain grey block
 * the Figma frames reserve so the column never collapses in the meantime.
 */
export function TagSpace() {
  return (
    <section
      aria-hidden
      className="h-full w-full overflow-hidden bg-[#d9d9d9]"
      data-slot="tag-space"
    />
  );
}
