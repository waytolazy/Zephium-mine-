import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { flushSync } from "svelte";
import "$styles/global.css";
import type { SidebarNodeView, TabView } from "$shared/ipc/bindings";
import { emitNativeEvent } from "$shared/testing/native-events";
import { revision, tabFixture } from "$shared/testing/fixtures";
import { favicons } from "$domain/favicons";
import { surface } from "$domain/surface";
import { tabs } from "$domain/tabs";
import * as sidebar from "$session/sidebar-mode.svelte";
import * as chrome from "$session/chrome-layout.svelte";
import { resetChromeRaise } from "$session/chrome-raise.svelte";
import * as launch from "$session/motion.svelte";
import Shell from "../Shell.svelte";

const native = vi.hoisted(() => ({
  layout: vi.fn(async (_height: number | null) => {}),
  raise: vi.fn(
    async (
      _raised: boolean,
      _x: number | null,
      _y: number | null,
      _width: number | null,
      _height: number | null,
    ) => {},
  ),
  hidden: vi.fn(async (_hidden: boolean) => {}),
}));

vi.mock("$shared/ipc/bindings", async () => {
  const { mockBindings } = await import("$shared/testing/bindings");
  return mockBindings({
    pagePermissionCardHost: async () => {},
    tabsBootstrap: async () => {},
    sidebarSetHidden: native.hidden,
    sidebarPeek: async () => {},
    sidebarSetWidth: async () => {},
    sidebarResize: async () => false,
    sidebarResizeGuide: async () => true,
    settingSet: async () => ({ accepted: true, operation_id: null }),
    chromeSetLayout: native.layout,
    chromeRaise: native.raise,
  });
});

afterEach(() => {
  chrome.adoptLayout("vertical");
  sidebar.followLayout();
  chrome.resetChromeLayout();
  resetChromeRaise();
  sidebar.setMode("default");
  favicons.dispose();
  surface.dispose();
  tabs.dispose();
  native.layout.mockClear();
  native.raise.mockClear();
});

const shot = (name: string) => page.screenshot({ path: `../../../../../target/look/${name}.png` });
const settle = () => new Promise((resolve) => setTimeout(resolve, 450));

let projection = 40;

/** Kept sites, pinned tabs and today's, as the strip lays them out. */
function window(): { tabs: TabView[]; nodes: SidebarNodeView[] } {
  const titled = (id: string, title: string) =>
    tabFixture({ id, title, url: `https://${id}.example/` });
  const kept = [titled("mail", "Inbox"), titled("calendar", "Calendar"), titled("chat", "Chat")];
  const pinned = [titled("music", "Music"), titled("docs", "Docs")];
  const open = [
    titled("rust", "rust programming language at DuckDuckGo"),
    titled("raycast", "Raycast - Your shortcut to everything"),
    titled("x", "X. It's what's happening / X"),
    titled("vercel", "Agentic Infrastructure - Vercel"),
    titled("wiki", "Wikipedia"),
    titled("notion", "The AI workspace that works for you"),
    tabFixture({ id: "fresh", title: "New Tab", url: null }),
  ];
  const node = (tab: TabView, section: SidebarNodeView["section"]): SidebarNodeView => ({
    id: tab.id,
    parent_id: null,
    section,
    kind: { type: "tab", tab_id: tab.id },
  });
  return {
    tabs: [...kept, ...pinned, ...open],
    nodes: [
      ...kept.map((tab) => node(tab, "favorites")),
      ...pinned.map((tab) => node(tab, "pinned")),
      ...open.map((tab) => node(tab, "today")),
    ],
  };
}

async function across(theme: "dark" | "light") {
  await page.viewport(1200, 720);
  document.documentElement.dataset.theme = theme;
  document.body.style.background = theme === "dark" ? "#232326" : "#e9e9ec";
  launch.dispose();
  await surface.init();
  await tabs.init();
  await favicons.init();
  chrome.adoptLayout("horizontal");
  sidebar.followLayout();
  const { tabs: all, nodes } = window();
  emitNativeEvent("itemsChanged", {
    projection_revision: revision((projection += 1)),
    profile: null,
    spaces: [],
    active_space_id: null,
    nodes,
    tabs: all,
    active: "x",
    split_group: null,
  });
  flushSync();
  const screen = await render(Shell);
  return { screen, all };
}

test("the bar is the one list of tabs and the one address, over the column it hides", async () => {
  const { screen, all } = await across("dark");
  await settle();
  await shot("topbar-dark");

  expect(all).toHaveLength(12);
  for (const tab of all) {
    expect(document.querySelectorAll(`[data-zephium-tab-id="${tab.id}"]`)).toHaveLength(1);
  }
  expect(document.querySelectorAll("[data-zephium-tab-id]")).toHaveLength(all.length);
  expect(document.querySelectorAll("[data-zephium-address]")).toHaveLength(1);
  expect(document.querySelector("[data-top-bar] [data-zephium-address]")).not.toBeNull();
  expect(document.querySelector(".shell")!.getAttribute("data-layout")).toBe("horizontal");

  // The column waits beneath the page as a card, under the bar.
  const column = document.querySelector<HTMLElement>(".browser-sidebar")!;
  expect(column.hasAttribute("data-hidden")).toBe(true);
  expect(native.hidden).toHaveBeenLastCalledWith(true);

  // Native is told how tall the bar is, and the card's top follows it.
  const bar = document.querySelector<HTMLElement>("[data-top-bar]")!;
  const height = native.layout.mock.calls.at(-1)?.[0];
  expect(height).toBeGreaterThan(0);
  expect(height).toBe(bar.offsetHeight);
  expect(column.getBoundingClientRect().top).toBe(bar.offsetHeight + 8);

  // The page stands a gap under the bar, across the window less its gutters.
  const stage = document.querySelector<HTMLElement>(".stage-column")!.getBoundingClientRect();
  expect(stage.top).toBe(bar.offsetHeight);
  expect(stage.left).toBe(8);

  await screen
    .getByRole("button", { name: "Agentic Infrastructure - Vercel", exact: true })
    .hover();
  await shot("topbar-dark-hover");
});

test("the toggle stands the column beside the page and puts it back", async () => {
  const { screen } = await across("light");
  await settle();
  await screen.getByRole("button", { name: "Toggle sidebar", exact: true }).first().click();
  await settle();
  const column = document.querySelector<HTMLElement>(".browser-sidebar")!;
  expect(column.hasAttribute("data-hidden")).toBe(false);
  expect(native.hidden).toHaveBeenLastCalledWith(false);
  // Still the only rows: the column lists no tabs of its own.
  expect(column.querySelectorAll("[data-zephium-tab-id]")).toHaveLength(0);
  expect(column.querySelectorAll("[data-zephium-address]")).toHaveLength(0);
  await shot("topbar-light-pinned");

  await screen.getByRole("button", { name: "Toggle sidebar", exact: true }).first().click();
  await expect.poll(() => native.hidden.mock.calls.at(-1)?.[0]).toBe(true);
});

test("the profile's stack drops over the page with the chrome raised for it", async () => {
  const { screen } = await across("dark");
  await settle();
  const bar = screen.container.querySelector<HTMLElement>("[data-top-bar]")!;
  const trigger = bar.querySelector<HTMLElement>(".shelf .case")!;
  trigger.click();
  await expect.poll(() => native.raise.mock.calls.at(-1)?.[0]).toBe(true);
  const [, x, y, width, height] = native.raise.mock.calls.at(-1)!;
  const stack = bar.querySelector<HTMLElement>(".shelf-stack")!.getBoundingClientRect();
  expect(y).toBeGreaterThanOrEqual(bar.offsetHeight);
  expect(width).toBeGreaterThan(0);
  expect(height).toBeGreaterThan(0);
  await expect.poll(() => [x, y, width, height].join()).toBeTruthy();
  await settle();
  await shot("topbar-dark-shelf");
  expect(stack.right).toBeLessThanOrEqual(1200);

  trigger.click();
  await expect.poll(() => native.raise.mock.calls.at(-1)?.[0]).toBe(false);
});
