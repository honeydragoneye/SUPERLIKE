"use client";

import { useEffect, useRef, useState } from "react";

/**
 * How many rows of `rowHeight` fit in the measured element, without cutting one
 * in half.
 *
 * A fixed count cannot answer this: the same ten rows that fit a 15" display
 * leave a sliced thirteenth on a taller one. Measuring is the only way to end
 * the list on a whole row at every window size.
 *
 * Returns null until the first measurement, so the caller renders nothing
 * rather than guessing and reflowing.
 */
export function useRowCapacity(rowHeight: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [capacity, setCapacity] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // the observer fires once on observe, so the first measurement arrives
    // through the same path as every later one
    const observer = new ResizeObserver(([entry]) => {
      const h = entry.contentRect.height;
      setCapacity(Math.max(1, Math.floor(h / rowHeight)));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [rowHeight]);

  return { ref, capacity };
}
