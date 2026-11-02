import type { SplitGroupView, TabView } from "$shared/ipc/bindings";
import { sidebarDisplayUnits, type SidebarEntry } from "./sidebar-model";

/** Where a tab stands in the strip: kept and pinned tabs are icons, today's carry titles. */
export type StripSection = "favorites" | "pinned" | "today";

/** One place along the strip: a tab, or a split's members side by side. */
export type StripUnit =
  | { kind: "tab"; key: string; tab: TabView; section: StripSection }
  | { kind: "split"; key: string; tabs: TabView[] };

/**
 * The sidebar's three lists laid end to end, kept sites first. A row has no
 * room for a folder's name, so folders give up their tabs in order; a split
 * among today's tabs stays one place, as the column draws it. Every tab the
 * tree admitted appears exactly once.
 */
export function stripUnits(
  sections: Record<StripSection, readonly SidebarEntry[]>,
  splitGroup: SplitGroupView | null,
): StripUnit[] {
  const flat = (section: StripSection): StripUnit[] =>
    sections[section].flatMap((entry) =>
      entry.kind === "tab" ? [{ kind: "tab", key: entry.key, tab: entry.tab, section }] : [],
    );
  const today = sidebarDisplayUnits("today", sections.today, splitGroup).flatMap(
    (unit): StripUnit[] => {
      if (unit.kind === "folder") return [];
      if (unit.kind === "split")
        return [{ kind: "split", key: unit.key, tabs: unit.tabs.map((member) => member.tab) }];
      return [{ kind: "tab", key: unit.key, tab: unit.tab, section: "today" }];
    },
  );
  return [...flat("favorites"), ...flat("pinned"), ...today];
}

/** Where a tab let go on the strip is put, as native can put it. */
export type StripDrop = {
  /** The tab under the pointer, if any. */
  onto: string | null;
  /** The tab the drop goes before in the strip's order; null past its end. */
  before: string | null;
  /** Let go on a kept site: the tab is kept. */
  essential: boolean;
};

/**
 * Native places a tab among the kept sites or today's tabs before another
 * item standing at the top of that same list, or at its end; anything else
 * it refuses. The strip draws the three lists end to end with folders given
 * up, so the tab a drop lands before may belong to another list, or sit in
 * a folder. This finds the place native can take that is nearest to where
 * the tab was let go: before the first item of its list at or after that
 * point (a folder, for a tab inside one), else that list's end. A pinned
 * row takes no drop: pinning is the tab menu's, and moving a pinned tab
 * there would unpin it. Null is no move at all.
 */
export function stripPlacement(
  sections: Record<StripSection, readonly SidebarEntry[]>,
  units: readonly StripUnit[],
  id: string,
  drop: StripDrop,
): { before: string | null } | null {
  const where = new Map<string, { section: StripSection; root: string }>();
  const roots: Record<StripSection, string[]> = { favorites: [], pinned: [], today: [] };
  for (const section of ["favorites", "pinned", "today"] as const) {
    let root: string | null = null;
    for (const entry of sections[section]) {
      if (entry.depth === 0) {
        root = entry.node.id;
        roots[section].push(root);
      }
      if (entry.kind === "tab") where.set(entry.tab.id, { section, root: root ?? entry.node.id });
    }
  }
  if (drop.onto !== null && where.get(drop.onto)?.section === "pinned" && !drop.essential)
    return null;
  const target: StripSection = drop.essential ? "favorites" : "today";
  const order = units.flatMap((unit) =>
    unit.kind === "split" ? unit.tabs.map((tab) => tab.id) : [unit.tab.id],
  );
  const from = drop.before === null ? order.length : order.indexOf(drop.before);
  let before: string | null = null;
  for (const candidate of order.slice(from === -1 ? order.length : from)) {
    const place = where.get(candidate);
    if (candidate === id || place?.section !== target) continue;
    before = place.root;
    break;
  }
  // Let go where it already stands: nothing moves.
  const self = where.get(id);
  if (self?.section === target && self.root === id) {
    const list = roots[target];
    const after = list.slice(list.indexOf(id) + 1).find((root) => root !== id) ?? null;
    if (before === after) return null;
  }
  return { before };
}
