/**
 * The column beside an artist, an album or the search results.
 *
 * Plain text on the page's own colour, divided from the screen by one rule —
 * these are notes beside the list, not cards competing with it. It scrolls on
 * its own when what it holds is taller than the window.
 */
export function RailShell({ children }: { children: React.ReactNode }) {
  return (
    <section data-slot="rail" className="rail-scroll flex h-full w-full flex-col gap-[16px] border-l-[1.5px] border-ink bg-chart p-[16px]">
      {children}
    </section>
  );
}

/** The small caps label above a block. */
export function RailLabel({ children }: { children: React.ReactNode }) {
  return <h3 className="shrink-0 text-[8px] tracking-[1px] text-on-bright-muted">{children}</h3>;
}
