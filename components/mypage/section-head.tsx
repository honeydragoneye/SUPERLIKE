import { useId } from "react";

/**
 * Title, a hint that only shows on demand, and whatever acts on the section.
 *
 * The hint (where the data comes from, how it is ordered) used to sit under the
 * title as a line of small print. It now opens as a bubble when the title is
 * hovered or focused, so the title stays alone on its line. The title takes
 * focus (`tabIndex`), which is also how a tap opens it on a touch screen.
 */
export function SectionHead({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: React.ReactNode;
  children?: React.ReactNode;
}) {
  const tipId = useId();
  return (
    <div className="flex w-full shrink-0 items-start justify-between gap-[16px]">
      <div className="group relative flex min-w-0 flex-col">
        {hint ? (
          <h2
            tabIndex={0}
            aria-describedby={tipId}
            className="w-fit cursor-default whitespace-nowrap text-[19px] font-black tracking-[-0.4px] underline-offset-[4px] outline-none group-hover:underline group-focus-within:underline"
          >
            {title}
          </h2>
        ) : (
          <h2 className="whitespace-nowrap text-[19px] font-black tracking-[-0.4px]">
            {title}
          </h2>
        )}
        {hint && (
          <p
            id={tipId}
            role="tooltip"
            className="pointer-events-none invisible absolute left-0 top-[calc(100%+6px)] z-20 flex items-center gap-[8px] whitespace-nowrap rounded-[4px] bg-panel px-[10px] py-[6px] text-[9px] tracking-[0.8px] text-on-dark opacity-0 shadow-[0_4px_12px_rgba(0,0,0,0.35)] transition-opacity group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100"
          >
            {hint}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-[16px] pt-[2px]">
        {children}
      </div>
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
