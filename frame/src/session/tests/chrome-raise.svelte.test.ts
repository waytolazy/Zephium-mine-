import { afterEach, expect, it, vi } from "vitest";
import { tick } from "svelte";

const native = vi.hoisted(() => ({
  raise: vi.fn(
    async (
      _raised: boolean,
      _x: number | null,
      _y: number | null,
      _width: number | null,
      _height: number | null,
    ) => {},
  ),
}));
vi.mock("$shared/ipc/bindings", async () => {
  const { mockBindings } = await import("$shared/testing/bindings");
  return mockBindings({ chromeRaise: native.raise });
});

const { followPanel, raisedPanel, resetChromeRaise } = await import("../chrome-raise.svelte");

/** A panel that settles from its opening motion: its box, and its own events. */
type Box = { x: number; y: number; width: number; height: number };
type Panel = {
  box: Box;
  getBoundingClientRect: () => Box;
  addEventListener: (type: string, listener: (event: unknown) => void) => void;
  removeEventListener: (type: string) => void;
  settle: (target?: unknown) => void;
};

function panel(box: Box): Panel {
  const listeners = new Map<string, (event: unknown) => void>();
  const element: Panel = {
    box,
    getBoundingClientRect: () => element.box,
    addEventListener: (type, listener) => void listeners.set(type, listener),
    removeEventListener: (type) => void listeners.delete(type),
    settle(target: unknown = element) {
      listeners.get("transitionend")?.({ target });
    },
  };
  return element;
}

afterEach(() => {
  resetChromeRaise();
  native.raise.mockClear();
});

it("raises once the panel is laid out and again as it settles from its motion", async () => {
  const opening = panel({ x: 400, y: 44, width: 290, height: 192 });
  const lower = followPanel(opening as unknown as HTMLElement);
  expect(native.raise).not.toHaveBeenCalled();
  await tick();
  expect(native.raise).toHaveBeenLastCalledWith(true, 400, 44, 290, 192);

  // Mid-motion the box was scaled; at rest it is the panel's own.
  opening.box = { x: 394, y: 48, width: 302, height: 200 };
  opening.settle({});
  expect(native.raise).toHaveBeenCalledTimes(1);
  opening.settle();
  expect(native.raise).toHaveBeenLastCalledWith(true, 394, 48, 302, 200);

  lower();
  expect(native.raise).toHaveBeenLastCalledWith(false, 394, 48, 302, 200);
  expect(raisedPanel()).toBeNull();
  opening.settle();
  expect(native.raise).toHaveBeenCalledTimes(3);
});

it("never raises a panel closed before it was laid out", async () => {
  const lower = followPanel(
    panel({ x: 0, y: 40, width: 48, height: 300 }) as unknown as HTMLElement,
  );
  lower();
  await tick();
  expect(native.raise).not.toHaveBeenCalled();
});
