import "$styles/global.css";
import { afterEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import { emitNativeEvent } from "$shared/testing/native-events";
import { tabFixture, revision, spaceFixture } from "$shared/testing/fixtures";
import { tabs } from "$domain/tabs";
import { surface } from "$domain/surface";
import { preferences } from "$domain/preferences";
import Shell from "../Shell.svelte";

vi.mock("../WorkWorkspace.svelte", async () => await import("./StageStub.svelte"));
vi.mock("$shared/ipc/bindings", async () => {
  const { mockBindings } = await import("$shared/testing/bindings");
  return mockBindings({
    pagePermissionCardHost: async () => {},
    tabsBootstrap: async () => {},
    settingGet: async (key: string) => (key === "ui.newtab-background" ? "plain" : null),
    sidebarSetWidth: async () => {},
    sidebarSetHidden: async () => {},
    blockerStats: async () => ({ status: "ok", data: { today: 0, last7Days: 0, days: [] } }),
    timeCall: async () => ({ kind: "focus_days", days: [] }),
  });
});
afterEach(() => {
  surface.dispose();
  tabs.dispose();
  preferences.dispose();
});

test("a plain new tab takes none of the sky's light, and the sky gives it back", async () => {
  await preferences.init();
  await surface.init();
  await tabs.init();
  const fresh = tabFixture({ id: "tab", url: null, title: "", projection_revision: revision(30) });
  emitNativeEvent("itemsChanged", {
    profile: { id: "00000000000000000000000902", name: "Personal", kind: "default" },
    spaces: [spaceFixture("space", "Home")],
    active_space_id: "space",
    nodes: [],
    split_group: null,
    projection_revision: revision(30),
    tabs: [fresh],
    active: fresh.id,
  });
  emitNativeEvent("uiCommand", "preference.ui.newtab-tasks=false");
  const screen = await render(Shell);
  await expect
    .poll(() => screen.container.querySelector("[data-zephium-new-tab] .plain"))
    .not.toBeNull();
  const light = () => screen.container.querySelector(".sky-light");
  expect(light()?.hasAttribute("data-shown")).toBe(false);
  expect(screen.container.querySelectorAll("[data-zephium-new-tab]")).toHaveLength(1);

  emitNativeEvent("uiCommand", "preference.ui.newtab-background=sky");
  await expect.poll(() => light()?.hasAttribute("data-shown")).toBe(true);
  emitNativeEvent("uiCommand", "preference.ui.newtab-background=plain");
  await expect.poll(() => light()?.hasAttribute("data-shown")).toBe(false);
});
