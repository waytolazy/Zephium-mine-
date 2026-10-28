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
