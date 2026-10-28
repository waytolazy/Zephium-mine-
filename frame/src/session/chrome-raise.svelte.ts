import { tick } from "svelte";
import { commands } from "$shared/ipc/bindings";

/**
 * With the chrome across the top of the window, the page's own view stands
 * over the rest of the chrome's document. A panel that hangs down from the
 * bar (the address field's tray, a bookmark folder, the profile's stack)
 * would open beneath the page, so while one is open native brings the chrome
 * over the page within the panel's own rect, and puts it back as the panel
 * closes. One panel at a time is raised: the last to ask is the one in view.
 */
type Raised = { id: number; rect: DOMRect };

// Read by the column's card, which shares native's one raised state with
// these panels and so must stay in while one is raised.
let open = $state.raw<Raised | null>(null);
let next = 0;
/** What native was last told, so closing an already-lowered chrome is free. */
let sent: string | null = null;

export const raisedPanel = () => open;

function send(raised: boolean, rect: DOMRect) {
  const key = raised
    ? [
        Math.round(rect.x),
        Math.round(rect.y),
        Math.round(rect.width),
        Math.round(rect.height),
      ].join()
    : "down";
  if (key === sent) return;
  sent = key;
  void commands.chromeRaise(
    raised,
    Math.max(0, Math.round(rect.x)),
    Math.max(0, Math.round(rect.y)),
    Math.max(0, Math.round(rect.width)),
    Math.max(0, Math.round(rect.height)),
  );
}

/**
 * Raises the chrome over the page for `panel`, measured as it stands now,
 * and returns the way to lower it again. A panel that moves or grows calls
 * again with itself; the previous raise for it is replaced. Only the chrome
 * laid out as a top bar needs this: a column beside the page tiles with it
 * and never asks.
 */
export function raiseFor(panel: HTMLElement): () => void {
  const id = ++next;
  const rect = panel.getBoundingClientRect();
  open = { id, rect };
  send(true, rect);
  return () => {
    if (open?.id !== id) return;
    open = null;
    send(false, rect);
  };
}

/**
 * Keeps the chrome raised for `panel` while it is open: measured once it is
 * laid out, and again as it settles from its opening motion (a rect taken
 * mid-motion is the smaller, scaled one) or changes size as its contents
 * arrive. Returns the way to lower it and stop following. Callers check
 * `horizontal()` first, as they do for `raiseFor`.
 */
export function followPanel(panel: HTMLElement): () => void {
  let live = true;
  let lower: (() => void) | null = null;
  const raise = () => {
    if (live) lower = raiseFor(panel);
  };
  void tick().then(raise);
  const settled = (event: TransitionEvent) => {
    if (event.target === panel) raise();
  };
  panel.addEventListener("transitionend", settled);
  const resized = typeof ResizeObserver === "function" ? new ResizeObserver(raise) : null;
  resized?.observe(panel);
  return () => {
    live = false;
    panel.removeEventListener("transitionend", settled);
    resized?.disconnect();
    lower?.();
  };
}

/** Lowers whatever is raised, as the layout leaves the top bar. */
export function lowerAll() {
  if (open === null) return;
  const { rect } = open;
  open = null;
  send(false, rect);
}

/** Tests only. */
export function resetChromeRaise() {
  open = null;
  sent = null;
}
