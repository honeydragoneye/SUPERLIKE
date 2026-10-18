/**
 * Tags the listener wrote themselves: a name and what it means.
 *
 * Kept in the browser, beside the likes and the rejects, and judged like the
 * mood tags — Gemini reads a title and an artist against the definition. The
 * server never stores them; each request that needs one carries its spec.
 */
import type { CustomMoodKey, MoodKey } from "./filter";
import {
  CUSTOM_DEFINITION_MAX,
  CUSTOM_LABEL_MAX,
  moodTag,
  type CustomMoodSpec,
} from "./moods";

const KEY = "superlike:custom-tags:v1";

/** Five is what the panel has room for, and what a list of moods can stay readable at. */
export const MAX_CUSTOM_TAGS = 5;

export type CustomTag = {
  key: CustomMoodKey;
  label: string;
  /** what the model is told the tag means; the label alone when none was given */
  definition: string;
  /** epoch ms */
  at: number;
};

/** Cache for useSyncExternalStore, rebuilt on write — see lib/likes. */
let list: CustomTag[] | null = null;
const listeners = new Set<() => void>();
const NOTHING: CustomTag[] = [];

function valid(v: unknown): v is CustomTag {
  if (!v || typeof v !== "object") return false;
  const t = v as Record<string, unknown>;
  return (
    typeof t.key === "string" &&
    /^u:[a-z0-9]{1,16}$/.test(t.key) &&
    typeof t.label === "string" &&
    typeof t.definition === "string" &&
    typeof t.at === "number"
  );
}

function read(): CustomTag[] {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    return Array.isArray(parsed) ? parsed.filter(valid).slice(0, MAX_CUSTOM_TAGS) : [];
  } catch {
    return [];
  }
}

function ensure(): CustomTag[] {
  return (list ??= read());
}

function persist(next: CustomTag[]): void {
  list = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // still holds for this session even if it cannot be kept
  }
  for (const fn of listeners) fn();
}

export function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    list = null;
    onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** The same array until something is written, which is what a snapshot needs. */
export const snapshot = (): CustomTag[] => ensure();
export const serverSnapshot = (): CustomTag[] => NOTHING;

const flat = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/** null when added, otherwise why it was not. */
export function addCustomTag(label: string, definition: string): string | null {
  const l = flat(label, CUSTOM_LABEL_MAX);
  const d = flat(definition, CUSTOM_DEFINITION_MAX);
  const tags = ensure();
  if (!l) return "태그 이름을 입력해 주세요";
  if (tags.length >= MAX_CUSTOM_TAGS) return `태그는 ${MAX_CUSTOM_TAGS}개까지 만들 수 있습니다`;
  if (tags.some((t) => t.label === l)) return "같은 이름의 태그가 있습니다";
  const key = `u:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` as CustomMoodKey;
  persist([...tags, { key, label: l, definition: d || l, at: Date.now() }]);
  return null;
}

export function removeCustomTag(key: CustomMoodKey): void {
  persist(ensure().filter((t) => t.key !== key));
}

/** What the server is told about a tag; undefined for a built-in or one since deleted. */
export function customSpecFor(mood: MoodKey | null): CustomMoodSpec | undefined {
  if (mood === null) return undefined;
  const t = ensure().find((c) => c.key === mood);
  return t && { key: t.key, label: t.label, definition: t.definition };
}

/** A tag's name on screen, whether built in or the listener's own. */
export function moodLabel(mood: MoodKey): string {
  if (mood.startsWith("u:")) return ensure().find((c) => c.key === mood)?.label ?? "내 태그";
  return moodTag(mood as Exclude<MoodKey, CustomMoodKey>).label;
}

export { CUSTOM_DEFINITION_MAX, CUSTOM_LABEL_MAX };
