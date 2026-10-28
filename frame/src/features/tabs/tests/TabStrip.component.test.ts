import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { flushSync } from "svelte";
import "$styles/global.css";
import type { SidebarNodeView, TabView } from "$shared/ipc/bindings";
import { emitNativeEvent } from "$shared/testing/native-events";
import { revision, tabFixture } from "$shared/testing/fixtures";
import { tabs } from "$domain/tabs";
import TabStrip from "../components/TabStrip.svelte";
import { sidebarTree } from "../lib/sidebar-model";

const native = vi.hoisted(() => ({
  setEssential: vi.fn(async (_id: string, _essential: boolean, _before: string | null) => ({
    accepted: true,
    operation_id: null,
  })),
  close: vi.fn(async (_id: string) => ({ accepted: true, operation_id: null })),
  drop: vi.fn(async (_id: string, _x: number | null, _y: number | null) => ({
    accepted: true,
    operation_id: null,
  })),
  menu: vi.fn(async (..._args: unknown[]) => true),
}));

vi.mock("$shared/ipc/bindings", async () => {
  const { mockBindings } = await import("$shared/testing/bindings");
  return mockBindings({
    tabsBootstrap: async () => {},
    tabsSetEssential: native.setEssential,
    tabsClose: native.close,
    tabDragOver: async () => undefined,
    tabDrop: native.drop,
    tabMenuPopup: native.menu,
  });
});

vi.mock("$domain/operations", () => ({
  settle: async () => ({ outcome: "succeeded" }),
}));

afterEach(() => {
  tabs.dispose();
  native.setEssential.mockClear();
  native.close.mockClear();
  native.drop.mockClear();
  native.menu.mockClear();
});

const site = (id: string, title = `Tab ${id}`) =>
  tabFixture({ id, title, url: `https://${id}.example/` });
const kept = [site("k1", "Mail"), site("k2", "Calendar")];
const pinnedTabs = [site("p1", "Music")];

let projection = 100;

async function strip(open: TabView[], options: { active?: string; width?: number } = {}) {
  await page.viewport(options.width ?? 900, 200);
  await tabs.init();
  const node = (tab: TabView, section: SidebarNodeView["section"]): SidebarNodeView => ({
    id: tab.id,
    parent_id: null,
    section,
    kind: { type: "tab", tab_id: tab.id },
  });
  const nodes = [
    ...kept.map((tab) => node(tab, "favorites")),
    ...pinnedTabs.map((tab) => node(tab, "pinned")),
    ...open.map((tab) => node(tab, "today")),
  ];
  const all = [...kept, ...pinnedTabs, ...open];
  emitNativeEvent("itemsChanged", {
    projection_revision: revision((projection += 1)),
    profile: null,
    spaces: [],
    active_space_id: null,
    nodes,
    tabs: all,
    active: options.active ?? open[0]!.id,
    split_group: null,
  });
  flushSync();
  const tree = sidebarTree(nodes, all);
  const onSelect = vi.fn();
  const screen = await render(TabStrip, {
    favorites: tree.favorites,
    pinned: tree.pinned,
    today: tree.today,
    onSelect,
  });
  const row = (id: string) =>
    screen.container.querySelector<HTMLElement>(`[data-zephium-tab-id="${id}"]`)!;
  const list = screen.container.querySelector<HTMLElement>("[data-strip-drop]")!;
  return { screen, row, list, onSelect, nodes, all };
}

const frame = () => new Promise((resolve) => requestAnimationFrame(() => resolve(undefined)));

function press(handle: HTMLElement, from: { x: number; y: number }, to: { x: number; y: number }) {
  const init = { bubbles: true, pointerId: 1, button: 0, isPrimary: true };
  handle.dispatchEvent(
    new PointerEvent("pointerdown", { ...init, clientX: from.x, clientY: from.y }),
  );
  handle.dispatchEvent(
    new PointerEvent("pointermove", { ...init, clientX: from.x + 8, clientY: from.y }),
  );
  handle.dispatchEvent(new PointerEvent("pointermove", { ...init, clientX: to.x, clientY: to.y }));
  return () =>
    handle.dispatchEvent(new PointerEvent("pointerup", { ...init, clientX: to.x, clientY: to.y }));
}

test("every tab is one row with its title, kept and pinned ones as marks", async () => {
  const open = ["a", "b", "c"].map((id) => site(id));
  const { screen, row } = await strip(open);
  for (const tab of [...kept, ...pinnedTabs, ...open]) {
    expect(screen.container.querySelectorAll(`[data-zephium-tab-id="${tab.id}"]`)).toHaveLength(1);
    expect(row(tab.id).querySelector("[data-zephium-tab-label]")!.textContent).toBe(tab.title);
  }
  // Icons alone: their titles are there for native and for assistive technology.
  expect(row("k1").getBoundingClientRect().width).toBe(32);
  expect(row("p1").getBoundingClientRect().width).toBe(32);
  expect(row("k1").querySelector(".sr-only[data-zephium-tab-label]")).not.toBeNull();
  expect(row("a").getBoundingClientRect().width).toBeGreaterThan(56);
});

test("a click chooses a tab, kept sites included", async () => {
  const { screen, onSelect } = await strip(["a", "b"].map((id) => site(id)));
  await screen.getByRole("button", { name: "Tab b", exact: true }).click();
  expect(onSelect).toHaveBeenLastCalledWith("b");
  await screen.getByRole("button", { name: "Mail", exact: true }).click();
  expect(onSelect).toHaveBeenLastCalledWith("k1");
});

test("today's tabs close from their button and on a middle click; kept and pinned never", async () => {
  const { screen, row } = await strip(["a", "b", "c"].map((id) => site(id)));
  expect(row("k1").querySelector(".strip-close")).toBeNull();
  expect(row("p1").querySelector(".strip-close")).toBeNull();
  // The current tab shows its close button without the pointer.
  expect(getComputedStyle(row("a").querySelector(".strip-close")!).opacity).toBe("1");

  await screen.getByRole("button", { name: "Close Tab b" }).click();
  expect(native.close).toHaveBeenLastCalledWith("b");

  const middle = { bubbles: true, button: 1 };
  row("c").querySelector("button")!.dispatchEvent(new MouseEvent("auxclick", middle));
  expect(native.close).toHaveBeenLastCalledWith("c");
  row("p1").querySelector("button")!.dispatchEvent(new MouseEvent("auxclick", middle));
  expect(native.close).toHaveBeenCalledTimes(2);
});

test("the tab menu is native and names its tab", async () => {
  const { row } = await strip(["a", "b"].map((id) => site(id)));
  const button = row("b").querySelector("button")!;
  const box = button.getBoundingClientRect();
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: box.left + 4,
    clientY: box.top + 4,
  });
  button.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(native.menu.mock.calls.at(-1)?.slice(0, 3)).toEqual(["b", box.left + 4, box.top + 4]);
});

test("a crowded strip scrolls sideways on the wheel and keeps the current tab in view", async () => {
  const open = Array.from({ length: 14 }, (_, index) => site(`t${index}`));
  const { list, row, nodes, all } = await strip(open, { width: 500 });
  expect(list.scrollWidth).toBeGreaterThan(list.clientWidth);
  // Tabs give up width only down to their floor.
  expect(row("t3").getBoundingClientRect().width).toBe(56);
  expect(getComputedStyle(list).scrollbarWidth).toBe("none");

  list.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
  await expect.poll(() => list.scrollLeft).toBeGreaterThan(0);

  list.scrollLeft = 0;
  emitNativeEvent("itemsChanged", {
    projection_revision: revision((projection += 1)),
    profile: null,
    spaces: [],
    active_space_id: null,
    nodes,
    tabs: all,
    active: "t13",
    split_group: null,
  });
  flushSync();
  await expect
    .poll(() => row("t13").getBoundingClientRect().right <= list.getBoundingClientRect().right)
    .toBe(true);
});

test("a tab dropped across the strip goes before the tab past the far half it reached", async () => {
  const { row } = await strip(["a", "b", "c", "d"].map((id) => site(id)));
  const handle = row("a").querySelector("button")!;
  const from = handle.getBoundingClientRect();
  const target = row("c").getBoundingClientRect();
  const release = press(
    handle,
    { x: from.left + 20, y: from.top + 15 },
    { x: target.right - 10, y: target.top + 15 },
  );
  await frame();
  expect(document.querySelector(".drag-card")).not.toBeNull();
  release();
  await expect.poll(() => native.setEssential.mock.calls.length).toBe(1);
  expect(native.setEssential).toHaveBeenLastCalledWith("a", false, "d");
});

test("onto a kept site keeps the tab; let go where it stood, nothing moves", async () => {
  const { row } = await strip(["a", "b", "c"].map((id) => site(id)));
  const handle = row("b").querySelector("button")!;
  const from = handle.getBoundingClientRect();
  const kept = row("k2").getBoundingClientRect();
  press(handle, { x: from.left + 20, y: from.top + 15 }, { x: kept.left + 4, y: kept.top + 15 })();
  await expect.poll(() => native.setEssential.mock.calls.length).toBe(1);
  expect(native.setEssential).toHaveBeenLastCalledWith("b", true, "k2");

  const again = row("c").querySelector("button")!;
  const home = again.getBoundingClientRect();
  press(again, { x: home.left + 20, y: home.top + 15 }, { x: home.left + 24, y: home.top + 15 })();
  await frame();
  expect(native.setEssential).toHaveBeenCalledTimes(1);
});

test("let go off the strip, the tab is native's to place", async () => {
  const { row } = await strip(["a", "b"].map((id) => site(id)));
  const handle = row("b").querySelector("button")!;
  const from = handle.getBoundingClientRect();
  press(handle, { x: from.left + 20, y: from.top + 15 }, { x: from.left + 20, y: 180 })();
  expect(native.drop).toHaveBeenLastCalledWith("b", from.left + 20, 180);
  expect(native.setEssential).not.toHaveBeenCalled();
});
