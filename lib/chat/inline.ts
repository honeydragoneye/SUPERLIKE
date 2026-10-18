/** A run of text, and whether it was written between `**` markers. */
export type Span = { text: string; bold: boolean };

/**
 * `**굵게**` as spans, so the asterisks never reach the screen.
 *
 * The small local model writes markdown whatever it is told, and the chat shows
 * plain text, so the one marker it uses is turned into weight instead. Every
 * `**` flips the state, which also covers a reply that is still arriving: an
 * opening `**` with no closing one yet makes what follows bold for now, rather
 * than flashing two stray asterisks until the closing pair is typed.
 */
export function boldSpans(text: string): Span[] {
  const spans: Span[] = [];
  let bold = false;
  for (const part of text.split("**")) {
    if (part) spans.push({ text: part, bold });
    bold = !bold;
  }
  return spans;
}
