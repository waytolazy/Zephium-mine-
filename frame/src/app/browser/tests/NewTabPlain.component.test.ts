import { afterEach, expect, test, vi } from "vitest";
import { page } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import "$styles/global.css";
import { emitNativeEvent } from "$shared/testing/native-events";
import { resourceTestServer } from "$shared/testing/resources/server";
import type { SearchResult } from "$shared/ipc/bindings";
import { preferences } from "$domain/preferences";
import { loadNewTab } from "$features/newtab";
import { loadNewTabSearch } from "$features/search";
import NewTabLook from "./NewTabLook.svelte";

const native = vi.hoisted(() => ({
  call: vi.fn(),
  search: vi.fn(async (_query: string, _context: unknown) => true),
  stats: vi.fn(async () => ({
    status: "ok" as const,
    data: { today: 1284, last7Days: 9120, days: [1100, 1250, 1400, 1310, 1380, 1396, 1284] },
  })),
  time: vi.fn(async () => ({ kind: "focus_days" as const, days: [] })),
  settings: {} as Record<string, string>,
  profile: "00000000000000000000000601",
}));
vi.mock("$shared/ipc/bindings", async () => {
  const { mockBindings } = await import("$shared/testing/bindings");
  return mockBindings({
    resourceCall: native.call,
    settingGet: async (key: string) => native.settings[key] ?? null,
    newtabSearchContext: async () => ({
      window_id: "window",
      profile_id: native.profile,
      space_id: "space",
      session_id: "newtab:tab:1",
      request_id: "",
    }),
    newtabSearch: native.search,
    newtabRun: async () => ({ accepted: true, operation_id: null }),
    newtabCancel: async () => true,
    timeCall: native.time,
    blockerStats: native.stats,
  });
});
vi.mock("$domain/tabs", () => ({
  tabs: { profile: () => ({ id: native.profile, name: "Alex Rivera", kind: "default" }) },
}));

await Promise.all([loadNewTab(), loadNewTabSearch()]);

afterEach(() => {
  vi.clearAllMocks();
  preferences.dispose();
  delete document.documentElement.dataset.theme;
});

async function setup(settings: Record<string, string> = { "ui.newtab-background": "plain" }) {
  native.profile = String(BigInt(native.profile) + 1n).padStart(26, "0");
  native.settings = settings;
  native.call.mockImplementation(resourceTestServer(native.profile).call);
  await preferences.init();
  await page.viewport(1320, 860);
  const screen = await render(NewTabLook, {});
  screen.container.style.cssText = "inline-size:1200px;block-size:780px;padding:6px";
  return screen;
}

const result = (title: string): SearchResult => ({
  kind: "tab",
  title,
  detail: "rust-lang.org",
  icon: null,
  action: { type: "OpenUrl", url: `https://rust-lang.org/${encodeURIComponent(title)}` },
});

test("the plain page is its own colour with the field and nothing else", async () => {
  const screen = await setup();
  const field = screen.getByRole("combobox");
  await expect.element(field).toBeVisible();
  await expect.element(field).toHaveFocus();

  const root = screen.container;
  for (const gone of [
    ".newtab",
    ".sky",
    ".page",
    ".mark",
    ".rim",
    ".drag",
    ".greeting",
    ".when",
    ".control",
    ".figures",
    ".figure",
    ".note",
  ])
    expect(root.querySelector(gone), gone).toBeNull();
  await expect.element(screen.getByRole("img", { name: "Zephium" })).not.toBeInTheDocument();
  await expect.element(screen.getByRole("button")).not.toBeInTheDocument();
  expect(root.querySelector("defs, linearGradient")).toBeNull();

  // The page's own ground, the window's sky never asked for.
  const plain = root.querySelector<HTMLElement>(".plain")!;
  const ground = getComputedStyle(root.querySelector(".content-pane")!).backgroundColor;
  expect(getComputedStyle(plain).backgroundColor).toBe(ground);
  expect(getComputedStyle(plain).backgroundImage).toBe("none");

  // A 560px box, centred, with its top at 38% of the page's height.
  const pane = plain.getBoundingClientRect();
  const box = root.querySelector<HTMLElement>(".plain-field")!.getBoundingClientRect();
  expect(box.width).toBe(560);
  expect(box.left + box.width / 2).toBeCloseTo(pane.left + pane.width / 2, 0);
  expect(box.top - pane.top).toBeCloseTo(pane.height * 0.38, 0);

  // Nothing is read for what is not shown.
  expect(native.stats).not.toHaveBeenCalled();
  expect(native.time).not.toHaveBeenCalled();
});

test("a narrow pane keeps the field inside the page", async () => {
  const screen = await setup();
  screen.container.style.inlineSize = "420px";
  await expect.element(screen.getByRole("combobox")).toBeVisible();
  const pane = screen.container.querySelector(".plain")!.getBoundingClientRect();
  const box = screen.container.querySelector(".plain-field")!.getBoundingClientRect();
  expect(box.left).toBeGreaterThan(pane.left);
  expect(box.right).toBeLessThan(pane.right);
});

test("results drop from the field onto a solid sheet", async () => {
  const screen = await setup();
  const input = screen.getByRole("combobox");
  await input.fill("rust");
  await vi.waitFor(() => expect(native.search).toHaveBeenCalled());
  const context = native.search.mock.calls.at(-1)![1];
  emitNativeEvent("searchChanged", {
    context: context as never,
    query: "rust",
    completion: null,
    pending: false,
    results: [result("Rust docs"), result("The Rust Book")],
  });
  await expect.element(screen.getByRole("option", { name: /Rust docs/u })).toBeVisible();
  const sheet = screen.container.querySelector<HTMLElement>(".sheet")!;
  // The sheet's card tint resolves here, so it is not left transparent.
  expect(getComputedStyle(sheet).backgroundImage).toMatch(/linear-gradient/u);
  const field = screen.container.querySelector(".plain-field")!.getBoundingClientRect();
  expect(sheet.getBoundingClientRect().top).toBeGreaterThanOrEqual(field.bottom);
  expect(sheet.getBoundingClientRect().width).toBe(field.width);
});

test("the sky comes back when another background is chosen, and goes again when plain is", async () => {
  const screen = await setup();
  await expect.element(screen.getByRole("combobox")).toBeVisible();
  expect(screen.container.querySelector(".newtab")).toBeNull();

  emitNativeEvent("uiCommand", "preference.ui.newtab-background=sky");
  await expect.poll(() => screen.container.querySelector(".newtab .sky")).not.toBeNull();
  expect(screen.container.querySelector(".plain")).toBeNull();
  await expect.element(screen.getByRole("img", { name: "Zephium" })).toBeVisible();

  emitNativeEvent("uiCommand", "preference.ui.newtab-background=plain");
  await expect.poll(() => screen.container.querySelector(".plain")).not.toBeNull();
  expect(screen.container.querySelector(".newtab")).toBeNull();
  expect(screen.container.querySelector(".sky")).toBeNull();
});

test("the sky page is unchanged by the plain one", async () => {
  const screen = await setup({});
  await expect.element(screen.getByRole("img", { name: "Zephium" })).toBeVisible();
  expect(screen.container.querySelector(".newtab .sky")).not.toBeNull();
  expect(screen.container.querySelector(".plain")).toBeNull();
});
