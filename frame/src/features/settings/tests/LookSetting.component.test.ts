import "$styles/global.css";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import { page } from "vitest/browser";
import { preferences } from "$domain/preferences";
import { theme } from "$domain/appearance";
import AppearanceStage from "./AppearanceStage.svelte";

const native = vi.hoisted(() => ({
  settings: {} as Record<string, string>,
  writes: [] as [string, string][],
}));
vi.mock("$shared/ipc/bindings", async () => {
  const { mockBindings } = await import("$shared/testing/bindings");
  return mockBindings({
    settingGet: async (key: string) => native.settings[key] ?? null,
    settingSet: async (key: string, value: string) => {
      native.writes.push([key, value]);
      native.settings[key] = value;
      return { accepted: true, operation_id: null };
    },
  });
});

afterEach(() => {
  preferences.dispose();
  native.writes = [];
  theme.applyLayout({ density: "comfortable", contrast: false, look: "soft" });
  theme.applyCustomization({
    theme: "zephium",
    custom: "",
    level: "50",
    contrast: false,
    font: "system",
    fontSize: "13",
    codeFont: "system",
  });
  delete document.documentElement.dataset.material;
});

for (const mode of ["dark", "light"] as const)
  test(`Flat lets the glass go with it and Soft leaves the material, ${mode}`, async () => {
    await page.viewport(1100, 1200);
    native.settings = { appearance: mode, "ui.material": "liquid_glass" };
    document.documentElement.dataset.theme = mode;
    document.documentElement.dataset.material = "liquid_glass";
    await preferences.init();
    const screen = await render(AppearanceStage);

    // The first row of Layout, before the tab layout it sits beside.
    const look = screen.container.querySelector('[data-setting="appearance.look"]')!;
    const layout = screen.container.querySelector('[data-setting="appearance.layout"]')!;
    expect(look.compareDocumentPosition(layout) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await expect
      .element(screen.getByText("Flat has no glass, gutters or shadows, and square corners."))
      .toBeVisible();

    await screen.getByRole("radio", { name: "Flat" }).click();
    await expect.poll(() => native.settings["ui.material"]).toBe("none");
    expect(native.writes).toEqual([
      ["ui.look", "flat"],
      ["ui.material", "none"],
    ]);
    await expect.poll(() => document.documentElement.dataset.look).toBe("flat");
    look.scrollIntoView({ block: "center" });
    await new Promise((done) => setTimeout(done, 450));
    await page.screenshot({ path: `../../../../../target/look/flat-${mode}-settings.png` });

    await screen.getByRole("radio", { name: "Soft" }).click();
    await expect.poll(() => native.settings["ui.look"]).toBe("soft");
    expect(native.writes.at(-1)).toEqual(["ui.look", "soft"]);
    expect(native.settings["ui.material"]).toBe("none");
  });

/** Drawn at all: a shadow with a colour that is not wholly transparent. */
const drawn = (value: string) =>
  value !== "none" &&
  value.split(/,(?![^(]*\))/u).some((shadow) => !/rgba\(0, 0, 0, 0\)/u.test(shadow));

/** The shadow a token gives, read off an element that wears only it. */
function wears(token: string) {
  const probe = document.createElement("div");
  probe.style.boxShadow = `var(${token})`;
  document.body.append(probe);
  const value = getComputedStyle(probe).boxShadow;
  probe.remove();
  return value;
}

// A chosen theme declares its light rims and drops one attribute more
// specifically than the look does; flat still has none of them.
for (const look of ["soft", "flat"] as const)
  test(`a chosen theme in light keeps the ${look} look's edges`, async () => {
    await page.viewport(1100, 900);
    native.settings = { appearance: "light", "ui.theme": "mono", "ui.look": look };
    document.documentElement.dataset.theme = "light";
    await preferences.init();
    const screen = await render(AppearanceStage);
    await expect.poll(() => document.documentElement.dataset.look).toBe(look);
    expect(document.documentElement.hasAttribute("data-palette")).toBe(true);

    const card = screen.container.querySelector<HTMLElement>(".ui-settings-group")!;
    const edges = [
      getComputedStyle(card).boxShadow,
      wears("--row-rim"),
      wears("--row-rim-ink"),
      wears("--shadow-control"),
      wears("--shadow-segment-thumb"),
    ];
    if (look === "soft") expect(edges.map(drawn)).toEqual([true, true, true, true, true]);
    else expect(edges.map(drawn)).toEqual([false, false, false, false, false]);
  });

// One "none" in a list voids the whole declaration, so a shadow that is
// nothing is still written as a shadow in every look and mode.
for (const mode of ["dark", "light"] as const)
  for (const look of ["soft", "flat"] as const)
    test(`a shadow list keeps its light, ${look} ${mode}`, () => {
      document.documentElement.dataset.theme = mode;
      theme.applyLayout({ density: "comfortable", contrast: false, look });
      for (const token of [
        "--shadow-tile",
        "--shadow-control",
        "--shadow-control-strong",
        "--shadow-card",
        "--shadow-field",
      ]) {
        const probe = document.createElement("div");
        probe.style.boxShadow = `inset 0 0 0 1px red, var(${token})`;
        document.body.append(probe);
        expect(getComputedStyle(probe).boxShadow, token).toMatch(/inset/u);
        probe.remove();
      }
    });
