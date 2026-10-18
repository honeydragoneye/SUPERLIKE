"use client";

import { useSyncExternalStore } from "react";
import { serverSnapshot, snapshot, subscribe, type CustomTag } from "@/lib/station/custom-tags";

/**
 * The listener's own tags.
 *
 * Empty on the server and through hydration: the list lives in this browser,
 * and React uses the server snapshot until the first render has matched.
 */
export function useCustomTags(): CustomTag[] {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot);
}
