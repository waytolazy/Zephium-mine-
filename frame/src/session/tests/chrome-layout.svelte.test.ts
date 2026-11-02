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
  expect(native.layout.mock.calls).toEqual([[40]]);
  adoptLayout("vertical");
  expect(native.layout).toHaveBeenLastCalledWith(null);
  expect(native.flush.mock.calls).toEqual([[true]]);
});

it("never tells native of a bar it has not measured", () => {
  // Native tiles the page under the bar from this height; a bar of none
  // would put the page at the window's top for a frame, and the height that
  // follows moves it down again without the slide.
  adoptLayout("horizontal");
  expect(native.layout).not.toHaveBeenCalled();
  reportBarHeight(0);
  expect(native.layout).not.toHaveBeenCalled();
  reportBarHeight(44);
  expect(native.layout.mock.calls).toEqual([[44]]);
});

it("measures a bar that comes back anew", () => {
  adoptLayout("horizontal");
  reportBarHeight(40);
  adoptLayout("vertical");
  // What a bar on its way out reports is not kept.
  reportBarHeight(0);
  // The look changed meanwhile: the old height is not the bar's any more.
  adoptLayout("horizontal");
  expect(native.layout.mock.calls).toEqual([[40], [null]]);
  reportBarHeight(44);
  expect(native.layout.mock.calls).toEqual([[40], [null], [44]]);
});
