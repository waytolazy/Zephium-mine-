import { describe, expect, it } from "vitest";
import type { SidebarNodeView } from "$shared/ipc/bindings";
import { tabFixture } from "$shared/testing/fixtures";
import { sidebarTree } from "../lib/sidebar-model";
import { stripPlacement, stripUnits } from "../lib/strip-model";

const tab = (id: string) => tabFixture({ id, title: `Tab ${id}`, url: `https://${id}.example/` });
const node = (
  id: string,
  section: SidebarNodeView["section"],
  parent_id: string | null = null,
): SidebarNodeView => ({ id, parent_id, section, kind: { type: "tab", tab_id: id } });

describe("the strip's order", () => {
  const nodes: SidebarNodeView[] = [
    node("k", "favorites"),
    { id: "f", parent_id: null, section: "pinned", kind: { type: "folder", name: "Work" } },
    node("p", "pinned", "f"),
    node("a", "today"),
    { id: "g", parent_id: null, section: "today", kind: { type: "folder", name: "Reading" } },
    node("b", "today", "g"),
    node("c", "today"),
    node("d", "today"),
  ];
  const all = ["k", "p", "a", "b", "c", "d"].map(tab);

  it("lays kept sites, pinned and today's tabs end to end, folders given up", () => {
    const units = stripUnits(sidebarTree(nodes, all), null);
    expect(units.map((unit) => unit.key)).toEqual([
      "tab:k",
      "tab:p",
      "tab:a",
      "tab:b",
      "tab:c",
      "tab:d",
    ]);
    expect(units.map((unit) => unit.kind === "tab" && unit.section)).toEqual([
      "favorites",
      "pinned",
      "today",
      "today",
      "today",
      "today",
    ]);
  });

  it("keeps a split among today's tabs as one place, each tab still once", () => {
    const units = stripUnits(sidebarTree(nodes, all), { members: ["c", "a"] });
    expect(units.map((unit) => unit.key)).toEqual([
      "tab:k",
      "tab:p",
      "split:today",
      "tab:b",
      "tab:d",
    ]);
    const split = units.find((unit) => unit.kind === "split");
    expect(split?.kind === "split" && split.tabs.map((member) => member.id)).toEqual(["c", "a"]);
    const ids = units.flatMap((unit) =>
      unit.kind === "split" ? unit.tabs.map((member) => member.id) : [unit.tab.id],
    );
    expect(new Set(ids).size).toBe(all.length);
  });
});

describe("where a tab let go on the strip lands", () => {
  // Kept sites, a pinned tab, and today's tabs with a folder among them, the
  // way native lists them: an item goes only before another at the top of
  // the list it joins.
  const nodes: SidebarNodeView[] = [
    node("k1", "favorites"),
    node("k2", "favorites"),
    node("p1", "pinned"),
    node("p2", "pinned"),
    node("a", "today"),
    { id: "g", parent_id: null, section: "today", kind: { type: "folder", name: "Reading" } },
    node("b1", "today", "g"),
    node("b2", "today", "g"),
    node("c", "today"),
  ];
  const all = ["k1", "k2", "p1", "p2", "a", "b1", "b2", "c"].map(tab);
  const tree = sidebarTree(nodes, all);
  const units = stripUnits(tree, null);
  const place = (id: string, onto: string | null, before: string | null, essential = false) =>
    stripPlacement(tree, units, id, { onto, before, essential });

  it("keeps a tab at the kept sites' end when let go on the far half of the last one", () => {
    // The strip's next tab is pinned: native would refuse to put a kept
    // site before it.
    expect(place("c", "k2", "p1", true)).toEqual({ before: null });
    expect(place("c", "k2", "k2", true)).toEqual({ before: "k2" });
  });

  it("puts a tab let go before a folder's tab before the folder itself", () => {
    // A tab in a folder is not at the top of today's list.
    expect(place("c", "b1", "b1")).toEqual({ before: "g" });
    expect(place("c", "b2", "b2")).toEqual({ before: "g" });
    // Just before the folder is where "a" already stands.
    expect(place("a", "b2", "b2")).toBeNull();
  });

  it("puts a tab let go just past the pinned tabs first among today's", () => {
    expect(place("c", "p2", "a")).toBeNull();
    expect(place("c", "a", "a")).toEqual({ before: "a" });
  });

  it("takes no drop on a pinned tab, which would unpin it or be refused", () => {
    expect(place("p1", "p2", "a")).toBeNull();
    expect(place("p2", "p1", "p1")).toBeNull();
    expect(place("c", "p1", "p1")).toBeNull();
  });

  it("moves a pinned tab let go among today's tabs into them, as the column does", () => {
    expect(place("p1", "c", "c")).toEqual({ before: "c" });
    expect(place("p1", "c", null)).toEqual({ before: null });
  });

  it("moves nothing for a tab let go where it already stands", () => {
    expect(place("a", "a", "b1")).toBeNull();
    expect(place("a", "a", "a")).toBeNull();
    expect(place("c", "c", null)).toBeNull();
    expect(place("k1", "k1", "k2", true)).toBeNull();
    // Out of its folder, to the folder's place: that is a move.
    expect(place("b2", "b2", "c")).toEqual({ before: "c" });
    // A kept site let go among today's tabs is no longer kept.
    expect(place("k1", "c", "c")).toEqual({ before: "c" });
  });
});
