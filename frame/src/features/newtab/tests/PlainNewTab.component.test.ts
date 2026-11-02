import { afterEach, expect, test, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { render } from "vitest-browser-svelte";
import "$styles/global.css";
import { preferences } from "$domain/preferences";
import PlainStage from "./PlainStage.svelte";

const native = vi.hoisted(() => ({
  settings: {} as Record<string, string>,
  stats: vi.fn(async () => ({ status: "ok" as const, data: { today: 1, last7Days: 1, days: [] } })),
  time: vi.fn(async () => ({ kind: "focus_days" as const, days: [] })),
}));
vi.mock("$shared/ipc/bindings", async () => {
  const { mockBindings } = await import("$shared/testing/bindings");
  return mockBindings({
    settingGet: async (key: string) => native.settings[key] ?? null,
    blockerStats: native.stats,
    timeCall: native.time,
  });
});
vi.mock("$domain/tabs", () => ({
  tabs: { profile: () => ({ id: "00000000000000000000000901", name: "Alex", kind: "default" }) },
}));

afterEach(() => {
  preferences.dispose();
  vi.clearAllMocks();
});

test("a plain page keeps the way to its own settings, and the window's title band", async () => {
  await page.viewport(1000, 700);
  native.settings = { "ui.newtab-background": "plain" };
  await preferences.init();
  const customize = vi.fn();
  const screen = await render(PlainStage, { oncustomize: customize });

  const gear = screen.getByRole("button", { name: "Customize New Tab" });
  await expect.element(gear).toBeVisible();
  // Nothing else is drawn or read for the page.
  expect(screen.container.querySelectorAll("button")).toHaveLength(1);
  expect(screen.container.querySelector(".newtab, .sky, .mark, .figures")).toBeNull();
  expect(native.stats).not.toHaveBeenCalled();
  expect(native.time).not.toHaveBeenCalled();

  // In the page's top corner, clear of the field, as on the sky.
  const pane = screen.container.querySelector(".plain")!.getBoundingClientRect();
  const box = gear.element().getBoundingClientRect();
  const field = screen.container.querySelector(".plain-field")!.getBoundingClientRect();
  expect(pane.right - box.right).toBe(14);
  expect(box.top - pane.top).toBe(9);
  expect(box.bottom).toBeLessThan(field.top);

  // The band along the top moves the window, and sits under the control.
  const band = screen.container.querySelector<HTMLElement>(".plain-drag")!;
  expect(band.hasAttribute("data-tauri-drag-region")).toBe(true);
  expect(band.getBoundingClientRect().height).toBe(50);
  expect(
    document
      .elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      ?.closest("button"),
  ).toBe(gear.element());

  await page.screenshot({ path: "../../../../../target/look/plain-corner.png" });
  await gear.click();
  expect(customize).toHaveBeenCalledOnce();
  // The keyboard reaches it after the field.
  screen.getByRole("textbox", { name: "Search the web" }).element().focus();
  await userEvent.keyboard("{Tab}");
  await expect.element(gear).toHaveFocus();
});

test("a plain page without a settings route draws no control", async () => {
  native.settings = { "ui.newtab-background": "plain" };
  await preferences.init();
  const screen = await render(PlainStage, {});
  await expect.element(screen.getByRole("textbox")).toBeVisible();
  expect(screen.container.querySelectorAll("button")).toHaveLength(0);
});

// In soft dark the field's own hairline and its focus ring were one list
// with the control's shadow, which was "none" there, so neither was drawn.
for (const mode of ["dark", "light"] as const)
  test(`the plain field is edged, and ringed while it has focus, ${mode}`, async () => {
    native.settings = { "ui.newtab-background": "plain" };
    document.documentElement.dataset.theme = mode;
    await preferences.init();
    const screen = await render(PlainStage, {});
    const field = screen.container.querySelector<HTMLElement>(".plain-field")!;
    await expect.element(screen.getByRole("textbox")).toBeVisible();
    const rest = getComputedStyle(field).boxShadow;
    expect(rest).toMatch(/inset/u);
    screen.getByRole("textbox").element().focus();
    await expect.poll(() => getComputedStyle(field).boxShadow).not.toBe(rest);
    expect(getComputedStyle(field).boxShadow).toMatch(/inset/u);
    delete document.documentElement.dataset.theme;
  });
