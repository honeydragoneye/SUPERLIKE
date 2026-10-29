/**
 * Lets a screen other than the ON AIR bar ask for the "다른 방송국" popup,
 * which is the bar's own state. The bar listens; nothing here knows how it opens.
 */
const OPEN_RADIO = "superlike:open-radio";

/**
 * `from` is the control that was pressed. The popup hangs from the bar at the
 * top of the page, so every scrolling box around the control is taken back to
 * its top first, or the popup would open out of sight.
 */
export function openRadioPopover(from?: HTMLElement | null): void {
  for (let el = from?.parentElement; el; el = el.parentElement) {
    if (el.scrollTop > 0) el.scrollTo({ top: 0, behavior: "smooth" });
  }
  window.scrollTo({ top: 0, behavior: "smooth" });
  window.dispatchEvent(new Event(OPEN_RADIO));
}

export function onOpenRadioPopover(listener: () => void): () => void {
  window.addEventListener(OPEN_RADIO, listener);
  return () => window.removeEventListener(OPEN_RADIO, listener);
}
