import type { BookmarkView } from "$shared/ipc/bindings";

/**
 * The native bookmark menu is modal and answers with a command that names the
 * entry chosen, never the bookmark. So one place holds the bookmark the last
 * menu was opened on and the view that opened it, and a view takes the answer
 * only if it is the one that asked: a menu dismissed in the bar can never be
 * answered by the panel's, or the other way round.
 */
let armed: { owner: symbol; item: BookmarkView } | null = null;

export function arm(owner: symbol, item: BookmarkView) {
  armed = { owner, item };
}

export function disarm(owner: symbol) {
  if (armed?.owner === owner) armed = null;
}

/** The bookmark `owner`'s menu was opened on, once; null if another view asked since. */
export function claim(owner: symbol): BookmarkView | null {
  if (armed?.owner !== owner) return null;
  const { item } = armed;
  armed = null;
  return item;
}
