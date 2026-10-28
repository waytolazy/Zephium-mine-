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

it("tells native the first look it adopts, then only a change", () => {
  adoptLook("soft");
  adoptLook("soft");
  expect(native.flush.mock.calls).toEqual([[false]]);

  adoptLook("flat");
  adoptLook("flat");
  expect(native.flush.mock.calls).toEqual([[false], [true]]);

  adoptLook("soft");
  expect(native.flush.mock.calls).toEqual([[false], [true], [false]]);
});

it("sends a flat look stored before the first adoption at once", () => {
  adoptLook("flat");
  expect(native.flush.mock.calls).toEqual([[true]]);
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
