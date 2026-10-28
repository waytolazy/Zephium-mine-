import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
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
import { palette, theme } from "$domain/appearance";
import { uiCommands } from "$domain/ui-commands";
import * as sidebar from "$session/sidebar-mode.svelte";
import * as chrome from "$session/chrome-layout.svelte";
import { resetChromeRaise } from "$session/chrome-raise.svelte";
import * as launch from "$session/motion.svelte";
import Shell from "../Shell.svelte";
import { raster, themed, wallpaper } from "./look-bench";

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
  document.getElementById("live-page")?.remove();
  theme.applyLayout({ density: "comfortable", contrast: false, look: "soft" });
  themed("zephium");
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
const READING = [
  bookmark("6", "The flat design manifesto", "https://essay.example/flat"),
  bookmark("7", "Chromium UI guidelines", "https://chromium.example/ui"),
];
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
  await page.viewport(1440, 900);
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
        ? {
            kind: "listing",
            folder: call.folder,
            path: [],
            items: call.folder ? READING : BOOKMARKS,
          }
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
/** Each shadow in a computed list, colour aside: [x, y, blur, spread]. */
const shadows = (value: string) =>
  value === "none"
    ? []
    : value
        .replace(/rgba?\([^)]*\)/gu, "")
        .split(",")
        .map((shadow) => (shadow.match(/-?[\d.]+px/gu) ?? []).map(px));
/** Drawn at all: a shadow with a colour that is not wholly transparent. */
const drawn = (value: string) =>
  value !== "none" &&
  value.split(/,(?![^(]*\))/u).some((shadow) => !/rgba\(0, 0, 0, 0\)/u.test(shadow));

/** Native's page view stands over the chrome in the stage's rect; a sheet in
 *  a site's colours stands in for it, under anything raised over the page. */
function livePage(mode: "dark" | "light") {
  const stage = document.querySelector(".stage-column")!.getBoundingClientRect();
  const [ground, ink] = mode === "dark" ? ["#0f1115", "#262a31"] : ["#ffffff", "#ececef"];
  const sheet = document.createElement("div");
  sheet.id = "live-page";
  sheet.style.cssText = `position:fixed;z-index:10;left:${stage.left}px;top:${stage.top}px;width:${stage.width}px;height:${stage.height}px;background:${ground};padding:28px 48px;box-sizing:border-box;display:grid;align-content:start;gap:14px`;
  for (const width of [18, 62, 88, 80, 84, 46, 0, 72, 90, 64])
    sheet.append(
      Object.assign(document.createElement("i"), {
        style: `display:block;height:${width === 18 ? 22 : 10}px;width:${width}%;background:${ink};border-radius:3px`,
      }),
    );
  document.body.append(sheet);
}

/** The pointer rests on the page, away from the chrome. */
const rest = () => userEvent.hover(page.elementLocator(document.getElementById("live-page")!));

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
    livePage(mode);
    await rest();
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
    const light = document.querySelector<HTMLElement>(".sky-light")!;
    light.setAttribute("data-shown", "");
    expect(getComputedStyle(light).opacity).toBe("0");
    light.removeAttribute("data-shown");

    // The column waits beneath the page as a bordered panel: no frost, no drop.
    const card = document.querySelector<HTMLElement>(".browser-sidebar")!;
    expect(card.hasAttribute("data-hidden")).toBe(true);
    const ground = getComputedStyle(card);
    expect(ground.backgroundImage).toBe("none");
    expect(opaque(ground.backgroundColor)).toBe(true);
    expect(drawn(ground.boxShadow)).toBe(false);
    expect(drawn(getComputedStyle(card, "::after").boxShadow)).toBe(true);

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
    expect(drawn(getComputedStyle(current).boxShadow)).toBe(false);

    // Hover stays a step below the current tab's plate.
    const vercel = screen.getByRole("button", {
      name: "Agentic Infrastructure - Vercel",
      exact: true,
    });
    await vercel.hover();
    await settle();
    const hovered = vercel.element().closest<HTMLElement>(".strip-tab")!;
    expect(getComputedStyle(hovered).backgroundColor).not.toBe(
      getComputedStyle(current).backgroundColor,
    );
    await shot(`${mode}-hover`);

    // A keyboard focus rings the control it lands on.
    await rest();
    current.querySelector<HTMLElement>(".strip-open")!.focus();
    await userEvent.keyboard("{Tab}");
    expect(document.activeElement?.closest(".strip-tab")).toBe(current);
    expect(getComputedStyle(document.activeElement!).outlineStyle).not.toBe("none");
    await shot(`${mode}-focus`);

    // The profile's stack hangs from the bar, solid and edged by a hairline.
    bar.querySelector<HTMLElement>(".shelf .case")!.click();
    await settle();
    const stack = bar.querySelector<HTMLElement>(".shelf-stack")!;
    const panel = getComputedStyle(stack);
    expect(opaque(panel.backgroundColor)).toBe(true);
    expect(panel.backdropFilter).toBe("none");
    expect(px(panel.borderTopLeftRadius)).toBeLessThanOrEqual(8);
    expect(shadows(panel.boxShadow).every(([, , blur]) => !blur)).toBe(true);
    await shot(`${mode}-stack`);
    bar.querySelector<HTMLElement>(".shelf .case")!.click();

    // Brought out over the page, as a pointer at the window's edge does.
    card.style.translate = "0 0";
    await settle();
    await shot(`${mode}-card`);
    card.style.translate = "";

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
    await userEvent.hover(page.elementLocator(screen.container.querySelector(".plain")!));
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

// Mono is the flat look's plain black-grey, chosen by hand like any theme.
for (const mode of ["dark", "light"] as const)
  test(`mono is plain grey under the flat look, ${mode}`, async () => {
    themed("mono");
    await flat(mode);
    await expect.element(page.getByRole("button", { name: "Rust docs" })).toBeVisible();
    livePage(mode);
    await rest();
    await settle();
    await shot(`mono-${mode}`);
    // The window is the ground native paints for Mono, and it has no hue.
    const context = document.createElement("canvas").getContext("2d")!;
    context.fillStyle = getComputedStyle(document.body).backgroundColor;
    context.fillRect(0, 0, 1, 1);
    const painted = [...context.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    const ground = palette.preset("mono")!.ground[mode];
    const native = [1, 3, 5].map((at) => parseInt(ground.slice(at, at + 2), 16));
    painted.forEach((channel, at) =>
      expect(Math.abs(channel - native[at]!)).toBeLessThanOrEqual(1),
    );
    expect(Math.max(...painted) - Math.min(...painted)).toBeLessThanOrEqual(3);
  });

test("the flat look is the same in the column beside the page", async () => {
  await flat("dark", { layout: "vertical" });
  livePage("dark");
  await rest();
  await settle();
  await shot("dark-vertical");
  const shell = document.querySelector<HTMLElement>(".shell")!;
  expect(getComputedStyle(shell).paddingTop).toBe("0px");
  const column = document.querySelector<HTMLElement>(".browser-sidebar")!;
  expect(getComputedStyle(column).paddingInlineStart).toBe("8px");
  const stage = document.querySelector<HTMLElement>(".stage-column")!.getBoundingClientRect();
  expect(stage.left).toBe(column.getBoundingClientRect().right);
});
