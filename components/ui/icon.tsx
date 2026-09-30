import Image from "next/image";

/**
 * Icons are exported straight out of Figma as SVG and live in /public/icons.
 *
 * Renders the <img> itself rather than wrapping it, so callers can position it
 * freely — stacking concentric vinyl layers needs `absolute` on the icon.
 */
export function Icon({
  name,
  size = 16,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <Image
      src={`/icons/${name}.svg`}
      alt=""
      width={size}
      height={size}
      style={{ width: size, height: size }}
      className={`block max-w-none shrink-0 ${className}`}
      aria-hidden
    />
  );
}

/**
 * Same artwork, painted in the current text colour.
 *
 * The exported transport icons are black, which disappears on the near-black
 * player. Masking keeps Figma\'s shape as the source of truth while letting the
 * surface decide the colour — and gives shuffle/repeat an active state for free.
 */
export function TintedIcon({
  name,
  size = 16,
  className = "",
}: {
  name: string;
  size?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={`block shrink-0 bg-current ${className}`}
      style={{
        width: size,
        height: size,
        maskImage: `url(/icons/${name}.svg)`,
        WebkitMaskImage: `url(/icons/${name}.svg)`,
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
}

/** Concentric stack: every layer shares one centre point. */
export const CENTRED =
  "absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2";
