import { describe, expect, it } from "vitest";
import type { SidebarNodeView } from "$shared/ipc/bindings";
import { tabFixture } from "$shared/testing/fixtures";
import { sidebarTree } from "../lib/sidebar-model";
import { stripUnits } from "../lib/strip-model";

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
