import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ settings: {} as Record<string, string> }));
vi.mock("$shared/ipc/bindings", async () => {
  const { mockBindings } = await import("$shared/testing/bindings");
  return mockBindings({
    settingGet: async (key: string) => native.settings[key] ?? null,
    settingSet: async () => ({ operation_id: null, accepted: true }),
  });
});
vi.mock("$shared/ipc/native-events", () => ({
  events: { uiCommand: { listen: () => Promise.resolve(() => {}) } },
}));
vi.mock("$domain/tabs", () => ({
  tabs: { profile: () => ({ id: "00000000000000000000000001", name: "Alex", kind: "default" }) },
}));

const DIGEST = "ab01".repeat(16);

async function load(settings: Record<string, string>) {
  native.settings = settings;
  const { preferences } = await import("$domain/preferences");
  await preferences.init();
  const background = await import("../newtab-background.svelte");
  return { preferences, ...background };
}

beforeEach(() => vi.resetModules());
afterEach(async () => {
  const { preferences } = await import("$domain/preferences");
  preferences.dispose();
});

describe("the new tab's background", () => {
  it("is the sky until another is chosen", async () => {
    const { newTabPlain, newTabImage } = await load({});
    expect(newTabPlain()).toBe(false);
    expect(newTabImage()).toBeNull();
  });

  it("is plain only for the plain choice, and then has no picture", async () => {
    const { newTabPlain, newTabImage } = await load({
      "ui.newtab-background": "plain",
      "ui.newtab-image": DIGEST,
    });
    expect(newTabPlain()).toBe(true);
    // An image kept from before is not shown while plain is chosen.
    expect(newTabImage()).toBeNull();
  });

  it("is not plain with an image chosen", async () => {
    const { newTabPlain, newTabImage } = await load({
      "ui.newtab-background": "image",
      "ui.newtab-image": DIGEST,
    });
    expect(newTabPlain()).toBe(false);
    expect(newTabImage()?.digest).toBe(DIGEST);
  });
});
