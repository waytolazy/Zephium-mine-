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
