/**
 * The page is drawn for a 1512px window (the Figma frames). A wider window
 * scales the whole page by the same factor instead of letting only the middle
 * column stretch, so the proportions stay what the design shows. A narrower one
 * stays at 1:1 and scrolls sideways, as before.
 *
 * The factor lives in the `--z` custom property on <html>; `.page-zoom` in
 * globals.css turns it into CSS `zoom`. Anything sized from the window (100vh,
 * pointer distances) is in screen pixels and has to be divided by it.
 */
export const DESIGN_WIDTH = 1512;

/** Same maths as the head script below, for code that runs after hydration. */
export function pageZoom(): number {
  if (typeof document === "undefined") return 1;
  return Math.max(1, document.documentElement.clientWidth / DESIGN_WIDTH);
}

export function applyPageZoom(): number {
  const z = pageZoom();
  document.documentElement.style.setProperty("--z", String(z));
  return z;
}

/** Runs while the HTML is parsed, so the first paint is already at the right size. */
export const PAGE_ZOOM_SCRIPT = `try{var d=document.documentElement;d.style.setProperty("--z",String(Math.max(1,d.clientWidth/${DESIGN_WIDTH})))}catch(e){}`;
