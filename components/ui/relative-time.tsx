"use client";

import { useEffect, useState } from "react";
import { playedAgo } from "@/lib/time";

/**
 * "12분 전" — computed on the client only.
 *
 * Relative time depends on `Date.now()`, which differs between the server
 * render and hydration, so the server emits a neutral dash and the real label
 * appears once mounted. Re-ticks every minute so the list stays honest.
 */
export function RelativeTime({ iso }: { iso: string }) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setLabel(playedAgo(iso));
    update();
    const id = setInterval(update, 60_000);
    return () => clearInterval(id);
  }, [iso]);

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {label ?? "—"}
    </time>
  );
}
