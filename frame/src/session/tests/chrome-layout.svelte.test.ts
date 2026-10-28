import { afterEach, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({
  layout: vi.fn(async (_height: number | null) => {}),
  flush: vi.fn(async (_flush: boolean) => {}),
}));
vi.mock("$shared/ipc/bindings", async () => {
  const { mockBindings } = await import("$shared/testing/bindings");
  return mockBindings({ chromeSetLayout: native.layout, chromeSetFlush: native.flush });
});

const { adoptLayout, adoptLook, reportBarHeight, resetChromeLayout } =
  await import("../chrome-layout.svelte");

afterEach(() => {
  resetChromeLayout();
  native.layout.mockClear();
  native.flush.mockClear();
});

it("tells native the look only when it changes, and never the soft it starts in", () => {
  adoptLook("soft");
  expect(native.flush).not.toHaveBeenCalled();

  adoptLook("flat");
  adoptLook("flat");
  expect(native.flush.mock.calls).toEqual([[true]]);

  adoptLook("soft");
  expect(native.flush.mock.calls).toEqual([[true], [false]]);
});

it("keeps the look apart from the shape", () => {
  adoptLook("flat");
  adoptLayout("horizontal");
  reportBarHeight(40.4);
  expect(native.layout.mock.calls).toEqual([[0], [40]]);
  adoptLayout("vertical");
  expect(native.layout).toHaveBeenLastCalledWith(null);
  expect(native.flush.mock.calls).toEqual([[true]]);
});
