import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import { flushSync } from "svelte";
import "$styles/global.css";
import type {
  BookmarkCall,
  BookmarkResponse,
  BookmarkView,
  SidebarNodeView,
  TabView,
} from "$shared/ipc/bindings";
import { emitNativeEvent } from "$shared/testing/native-events";
import { revision, tabFixture } from "$shared/testing/fixtures";
import { favicons } from "$domain/favicons";
import { surface } from "$domain/surface";
import { tabs } from "$domain/tabs";
import { preferences } from "$domain/preferences";
import { theme } from "$domain/appearance";
import { uiCommands } from "$domain/ui-commands";
import * as sidebar from "$session/sidebar-mode.svelte";
import * as chrome from "$session/chrome-layout.svelte";
import { resetChromeRaise } from "$session/chrome-raise.svelte";
import * as launch from "$session/motion.svelte";
import Shell from "../Shell.svelte";
import { raster, wallpaper } from "./look-bench";

const native = vi.hoisted(() => ({
  settings: {} as Record<string, string>,
  flush: vi.fn(async (_flush: boolean) => {}),
  bookmarks: vi.fn(),
}));

vi.mock("$shared/ipc/bindings", async () => {
  const { mockBindings } = await import("$shared/testing/bindings");
  return mockBindings({
    pagePermissionCardHost: async () => {},
    tabsBootstrap: async () => {},
    sidebarSetHidden: async () => {},
    sidebarPeek: async () => {},
    sidebarSetWidth: async () => {},
    sidebarResize: async () => false,
    sidebarResizeGuide: async () => true,
    settingGet: async (key: string) => native.settings[key] ?? null,
    settingSet: async () => ({ accepted: true, operation_id: null }),
    chromeSetLayout: async () => {},
    chromeRaise: async () => {},
    chromeSetFlush: native.flush,
    bookmarkCall: native.bookmarks,
    newtabSearchContext: async () => ({
      window_id: "window",
      profile_id: "00000000000000000000000701",
      space_id: "space",
      session_id: "newtab:tab:1",
      request_id: "",
    }),
    newtabSearch: async () => true,
    newtabCancel: async () => true,
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
  preferences.dispose();
  uiCommands.dispose();
  native.flush.mockClear();
  document.getElementById("wallpaper")?.remove();
  theme.applyLayout({ density: "comfortable", contrast: false, look: "soft" });
  delete document.documentElement.dataset.material;
});

const shot = (name: string) =>
  page.screenshot({ path: `../../../../../target/look/flat-${name}.png` });
const settle = () => new Promise((resolve) => setTimeout(resolve, 450));

const SITES: Record<string, [title: string, fill: string]> = {
  mail: ["Inbox (3) - Mail", "#d93025"],
  calendar: ["Calendar", "#1a73e8"],
  chat: ["Chat", "#34a853"],
  music: ["Music", "#1ed760"],
  docs: ["Docs", "#4285f4"],
  rust: ["rust programming language at DuckDuckGo", "#de5833"],
  github: ["crynta (Crynta) · GitHub", "#f0f0f0"],
  x: ["X. It's what's happening / X", "#0f1419"],
  vercel: ["Agentic Infrastructure - Vercel", "#000000"],
  wiki: ["Wikipedia, the free encyclopedia", "#cfd2d6"],
  notion: ["The AI workspace that works for you", "#ffffff"],
};

const bookmark = (id: string, title: string, url: string | null): BookmarkView => ({
  id,
  title,
  url,
  icon: null,
  children: url === null ? 2 : 0,
  parent: null,
});
const BOOKMARKS = [
  bookmark("1", "Reading", null),
  bookmark("2", "Zephium", "https://zephium.app/"),
  bookmark("3", "Rust docs", "https://doc.rust-lang.org/std/"),
  bookmark("4", "Hacker News", "https://news.ycombinator.com/"),
  bookmark("5", "Figma", "https://figma.com/"),
];

let projection = 70;

/** A dozen tabs: kept sites, pinned and today's, with one new tab among them. */
function window(active: string): { tabs: TabView[]; nodes: SidebarNodeView[]; active: string } {
  const site = (id: string) =>
    tabFixture({
      id,
      title: SITES[id]![0],
      url: `https://${id}.example/`,
      icon: { origin: `https://${id}.example`, revision: "a" },
    });
  const kept = ["mail", "calendar", "chat"].map(site);
  const pinned = ["music", "docs"].map(site);
  const open = [
    ...["rust", "github", "x", "vercel", "wiki", "notion"].map(site),
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
    active,
  };
}

async function flat(
  mode: "dark" | "light",
  {
    layout = "horizontal",
    active = "x",
  }: { layout?: "horizontal" | "vertical"; active?: string } = {},
) {
  await page.viewport(1200, 720);
  native.settings = {
    appearance: mode,
    "ui.look": "flat",
    "ui.tab-layout": layout,
    "ui.bookmarks-bar": "true",
    "ui.newtab-background": "plain",
  };
  native.bookmarks.mockImplementation(
    async (_profile: string, call: BookmarkCall): Promise<BookmarkResponse> =>
      call.kind === "list"
        ? { kind: "listing", folder: call.folder, path: [], items: call.folder ? [] : BOOKMARKS }
        : { kind: "saved", id: null },
  );
  document.documentElement.dataset.theme = mode;
  // Glass is installed: the flat look must cover it, so the wallpaper under
  // the window may never show.
  document.documentElement.dataset.material = "liquid_glass";
  wallpaper("violet", mode, "transparent");
  theme.applyLayout({ density: "comfortable", contrast: false, look: "flat" });
  launch.dispose();
  await preferences.init();
  await uiCommands.init();
  await surface.init();
  await tabs.init();
  await favicons.init();
  chrome.adoptLayout(layout);
  chrome.adoptLook("flat");
  sidebar.followLayout();
  const shape = window(active);
  emitNativeEvent("favicons", {
    surface: "chrome",
    profile_id: "00000000000000000000000701",
    entries: Object.entries(SITES).map(([id, [, fill]]) => ({
      origin: `https://${id}.example`,
      revision: "a",
      rgba: raster(fill),
    })),
  });
  emitNativeEvent("itemsChanged", {
    projection_revision: revision((projection += 1)),
    profile: { id: "00000000000000000000000701", name: "Alex Rivera", kind: "default" },
    spaces: [],
    active_space_id: null,
    nodes: shape.nodes,
    tabs: shape.tabs,
    active: shape.active,
    split_group: null,
  });
  flushSync();
  const screen = await render(Shell);
  return { screen, all: shape.tabs };
}

const px = (value: string) => Number.parseFloat(value) || 0;
const opaque = (color: string) => !/rgba?\([^)]*,\s*0(?:\.\d+)?\)|transparent/u.test(color);

/** Every corner drawn in the bar's own rows, discs aside: an avatar, a badge. */
function corners(root: Element): { element: Element; radius: number }[] {
  return [...root.querySelectorAll("*")]
    .filter((element) => !element.closest(".ui-disclosure-panel"))
    .map((element) => {
      const style = getComputedStyle(element);
      const radius = Math.max(
        px(style.borderTopLeftRadius),
        px(style.borderTopRightRadius),
        px(style.borderBottomLeftRadius),
        px(style.borderBottomRightRadius),
      );
      return { element, radius, box: element.getBoundingClientRect() };
    })
    .filter(({ box, radius }) => {
      const disc = Math.abs(box.width - box.height) < 1 && radius >= box.width / 2 - 0.5;
      return box.width > 0 && box.height > 0 && !disc;
    });
}

for (const mode of ["dark", "light"] as const) {
  test(`the bar is flat, opaque and boxy, ${mode}`, async () => {
    const { screen, all } = await flat(mode);
    await expect.element(screen.getByRole("button", { name: "Rust docs" })).toBeVisible();
    await settle();
    await shot(mode);

    expect(all).toHaveLength(12);
    for (const tab of all)
      expect(document.querySelectorAll(`[data-zephium-tab-id="${tab.id}"]`)).toHaveLength(1);
    expect(document.querySelectorAll("[data-zephium-address]")).toHaveLength(1);
    expect(native.flush.mock.calls).toEqual([[true]]);

    // No gutter: the shell pads nothing and the page meets the bar's foot.
    const shell = document.querySelector<HTMLElement>(".shell")!;
    const style = getComputedStyle(shell);
    for (const side of ["Top", "Right", "Bottom", "Left"] as const)
      expect(style[`padding${side}`], side).toBe("0px");
    const bar = document.querySelector<HTMLElement>("[data-top-bar]")!;
    const stage = document.querySelector<HTMLElement>(".stage-column")!.getBoundingClientRect();
    expect(stage.top).toBe(bar.offsetHeight);
    expect(stage.left).toBe(0);
    expect(getComputedStyle(bar).boxShadow).toMatch(/inset/u);

    // One opaque ground over the glass, nothing lit and nothing blurred.
    expect(opaque(getComputedStyle(document.body).backgroundColor)).toBe(true);
    expect(opaque(getComputedStyle(document.documentElement).backgroundColor)).toBe(true);
    expect(getComputedStyle(document.querySelector(".sky-light")!).opacity).toBe("0");

    // Boxy: nothing in the bar's rows rounder than a row, discs aside.
    const round = corners(bar).filter(({ radius }) => radius > 6);
    expect(
      round.map(({ element, radius }) => `${element.className || element.tagName} ${radius}`),
    ).toEqual([]);
    const field = bar.querySelector<HTMLElement>(".address-field")!;
    expect(getComputedStyle(field).borderTopLeftRadius).toBe("5px");
    expect(getComputedStyle(field).boxShadow).toMatch(/inset/u);
    const current = bar.querySelector<HTMLElement>('.strip-tab[data-selected="true"]')!;
    expect(getComputedStyle(current).borderTopLeftRadius).toBe("5px");
    expect(getComputedStyle(current).boxShadow).toBe("none");

    // Hover, then a keyboard focus, each still reads on the flat ground.
    await screen
      .getByRole("button", { name: "Agentic Infrastructure - Vercel", exact: true })
      .hover();
    await settle();
    await shot(`${mode}-hover`);

    // The profile's stack hangs from the bar, solid and edged by a hairline.
    bar.querySelector<HTMLElement>(".shelf .case")!.click();
    await settle();
    const stack = bar.querySelector<HTMLElement>(".shelf-stack")!;
    const panel = getComputedStyle(stack);
    expect(opaque(panel.backgroundColor)).toBe(true);
    expect(panel.backdropFilter).toBe("none");
    expect(px(panel.borderTopLeftRadius)).toBeLessThanOrEqual(8);
    expect(panel.boxShadow).not.toMatch(/\d+px \d+px \d+px/u);
    await shot(`${mode}-stack`);
    bar.querySelector<HTMLElement>(".shelf .case")!.click();

    // A folder of the bookmarks row opens the same flat menu.
    await screen.getByRole("button", { name: "Reading" }).click();
    await settle();
    await shot(`${mode}-folder`);
  });

  test(`the plain new tab is a hairline field on the page, ${mode}`, async () => {
    const { screen } = await flat(mode, { active: "fresh" });
    await expect
      .poll(() => screen.container.querySelector("[data-zephium-new-tab] .plain-field"))
      .not.toBeNull();
    const field = screen.container.querySelector<HTMLElement>(".plain-field")!;
    await expect.element(screen.getByRole("combobox")).toBeVisible();
    await settle();
    await shot(`${mode}-newtab`);

    const pane = screen.container.querySelector<HTMLElement>("[data-zephium-new-tab]")!;
    expect(getComputedStyle(pane).paddingInlineStart).toBe("0px");
    expect(getComputedStyle(pane.querySelector(".content-pane")!).borderTopLeftRadius).toBe("0px");
    const style = getComputedStyle(field);
    expect(style.backgroundColor).toBe("rgba(0, 0, 0, 0)");
    expect(style.boxShadow).toMatch(/inset/u);
    expect(px(style.borderTopLeftRadius)).toBeLessThanOrEqual(8);
    const plain = screen.container.querySelector(".plain")!;
    expect(plain.querySelectorAll("svg, img, canvas").length).toBeLessThanOrEqual(1);
  });
}

test("the flat look is the same in the column beside the page", async () => {
  await flat("dark", { layout: "vertical" });
  await settle();
  await shot("dark-vertical");
  const shell = document.querySelector<HTMLElement>(".shell")!;
  expect(getComputedStyle(shell).paddingTop).toBe("0px");
  const column = document.querySelector<HTMLElement>(".browser-sidebar")!;
  expect(getComputedStyle(column).paddingInlineStart).toBe("8px");
  const stage = document.querySelector<HTMLElement>(".stage-column")!.getBoundingClientRect();
  expect(stage.left).toBe(column.getBoundingClientRect().right);
});
