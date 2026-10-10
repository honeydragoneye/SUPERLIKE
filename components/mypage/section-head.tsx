/** Title, a line of small print under it, and whatever acts on the section. */
export function SectionHead({
  title,
  note,
  children,
}: {
  title: string;
  note: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex w-full shrink-0 items-start justify-between gap-[16px]">
      <div className="flex min-w-0 flex-col gap-px">
        <h2 className="whitespace-nowrap text-[19px] font-black tracking-[-0.4px]">
          {title}
        </h2>
        <p className="flex items-center gap-[8px] whitespace-nowrap text-[8px] tracking-[0.8px] text-on-bright-muted">
          {note}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-[16px] pt-[2px]">{children}</div>
    </div>
  );
}

/**
 * Switches a section between its rail and everything it holds.
 *
 * A button, not a link: nothing is navigated to, the same section redraws
 * itself. The arrow turns round with the state so the label says which way
 * the next press goes.
 */
export function ViewToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      aria-expanded={open}
      onClick={onToggle}
      className="cursor-pointer whitespace-nowrap text-[8px] tracking-[0.8px] text-on-bright-muted transition-colors hover:text-on-bright"
    >
      {open ? "접기 ←" : "전체 보기 →"}
    </button>
  );
}
