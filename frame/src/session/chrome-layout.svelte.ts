import { commands } from "$shared/ipc/bindings";

/**
 * The chrome's shape, as the person chose it: the column beside the page, or
 * a bar across the top of the window with the column waiting beneath the
 * page as a card. Native tiles the page from it, so the choice is published
 * there whenever it or the bar's height changes.
 */
export type ChromeLayout = "vertical" | "horizontal";

/** How the chrome is drawn: soft has gutters, glass and rounded pages; flat
 *  lays the page flush against the chrome and the window's edges. */
export type ChromeLook = "soft" | "flat";

let layout = $state.raw<ChromeLayout>("vertical");
/** The bar's height in chrome points, from the window's top to the bar's
 *  foot, bookmarks row included. Zero until the bar has been measured. */
let barHeight = $state.raw(0);
let published: string | null = null;
/** What native was last told. It starts every window soft and remembers
 *  nothing across a reload, so the first look adopted is always sent. */
let look: ChromeLook | null = null;

export const chromeLayout = () => layout;
export const horizontal = () => layout === "horizontal";
export const topBarHeight = () => barHeight;

function publish() {
  const next = layout === "horizontal" ? Math.max(0, Math.round(barHeight)) : null;
  const key = String(next);
  if (key === published) return;
  published = key;
  void commands.chromeSetLayout(next);
}

/** A stored preference reached the chrome: from Settings, here or elsewhere. */
export function adoptLayout(next: ChromeLayout) {
  if (next === layout) return;
  layout = next;
  publish();
}

/** The stored look reached the chrome. Its tokens are the root's
 *  (`theme.applyLayout`); the page's gutter and corners are native's. */
export function adoptLook(next: ChromeLook) {
  if (next === look) return;
  look = next;
  void commands.chromeSetFlush(next === "flat");
}

/** The bar reports its own height as it is laid out; a vertical chrome has no bar. */
export function reportBarHeight(height: number) {
  if (!Number.isFinite(height) || height < 0) return;
  const rounded = Math.round(height);
  if (rounded === barHeight) return;
  barHeight = rounded;
  if (layout === "horizontal") publish();
}

/** Tests only: forget what was published, so the next change is sent again. */
export function resetChromeLayout() {
  layout = "vertical";
  barHeight = 0;
  published = null;
  look = null;
}
