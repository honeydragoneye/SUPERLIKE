/**
 * Three dots riding a wave, for a screen that is still fetching.
 *
 * Sized relative to the text it sits in and coloured from `currentColor`, so it
 * belongs to whatever line it is dropped into rather than carrying its own
 * palette. The stagger is what makes it read as motion rather than a blink.
 */
export function LoadingDots({
  size = 5,
  label = "불러오는 중",
}: {
  size?: number;
  label?: string;
}) {
  return (
    <span
      role="status"
      aria-label={label}
      className="inline-flex items-end"
      style={{ gap: size * 0.6, height: size * 2.6 }}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          aria-hidden
          className="dot-wave inline-block shrink-0 rounded-pill bg-current"
          style={
            {
              width: size,
              height: size,
              // the lift scales with the dot, in pixels — a percentage of
              // something this small rounds away to nothing
              "--lift": `${Math.max(3, Math.round(size * 0.9))}px`,
              animationDelay: `${i * 0.14}s`,
            } as React.CSSProperties
          }
        />
      ))}
    </span>
  );
}
