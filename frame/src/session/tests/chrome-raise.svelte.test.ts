import { afterEach, beforeEach, expect, it, vi } from "vitest";
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

const { followPanel, lowerAll, raiseFor, raisedPanel, resetChromeRaise } =
  await import("../chrome-raise.svelte");

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

// The window the panels hang in: only its resizing is listened to.
let host: EventTarget;
beforeEach(() => {
  host = new EventTarget();
  vi.stubGlobal("window", host);
});

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

it("brings a panel still open back into view as the one over it closes", () => {
  // The page's request card hangs from the field; the tray is opened over it
  // from the keyboard, so nothing pressed outside the card folded it.
  const card = panel({ x: 120, y: 44, width: 320, height: 160 });
  const tray = panel({ x: 300, y: 44, width: 290, height: 220 });
  const lowerCard = raiseFor(card as unknown as HTMLElement);
  const lowerTray = raiseFor(tray as unknown as HTMLElement);
  expect(native.raise).toHaveBeenLastCalledWith(true, 300, 44, 290, 220);

  // Measured again while the tray is in view, the card stays beneath it.
  card.box = { x: 120, y: 44, width: 320, height: 172 };
  raiseFor(card as unknown as HTMLElement);
  expect(native.raise).toHaveBeenLastCalledWith(true, 300, 44, 290, 220);

  // Escape closes the tray: the card, still open, is in view again, not
  // left beneath the page with the chrome lowered.
  lowerTray();
  expect(native.raise).toHaveBeenLastCalledWith(true, 120, 44, 320, 172);
  expect(raisedPanel()).not.toBeNull();

  // The card's first raise was replaced by its second; only the newest
  // lowers it.
  lowerCard();
  expect(native.raise).toHaveBeenLastCalledWith(true, 120, 44, 320, 172);
});

it("lowers once the last panel open closes, whichever order they close in", () => {
  const first = panel({ x: 0, y: 44, width: 200, height: 100 });
  const second = panel({ x: 400, y: 44, width: 200, height: 100 });
  const lowerFirst = raiseFor(first as unknown as HTMLElement);
  const lowerSecond = raiseFor(second as unknown as HTMLElement);
  // The one beneath closes first: the one in view stays raised.
  lowerFirst();
  expect(native.raise).toHaveBeenLastCalledWith(true, 400, 44, 200, 100);
  lowerSecond();
  expect(native.raise).toHaveBeenLastCalledWith(false, 400, 44, 200, 100);
  expect(raisedPanel()).toBeNull();
});

it("lets a panel that left the document go instead of raising it again", () => {
  const gone = panel({ x: 0, y: 44, width: 200, height: 100 });
  const tray = panel({ x: 400, y: 44, width: 200, height: 100 });
  raiseFor(gone as unknown as HTMLElement);
  const lowerTray = raiseFor(tray as unknown as HTMLElement);
  Object.assign(gone, { isConnected: false });
  lowerTray();
  expect(native.raise).toHaveBeenLastCalledWith(false, 400, 44, 200, 100);
  expect(raisedPanel()).toBeNull();
});

it("forgets every panel when the bar goes", () => {
  const card = panel({ x: 0, y: 44, width: 200, height: 100 });
  const tray = panel({ x: 400, y: 44, width: 200, height: 100 });
  raiseFor(card as unknown as HTMLElement);
  const lowerTray = raiseFor(tray as unknown as HTMLElement);
  lowerAll();
  expect(native.raise).toHaveBeenLastCalledWith(false, 400, 44, 200, 100);
  const calls = native.raise.mock.calls.length;
  lowerTray();
  expect(native.raise).toHaveBeenCalledTimes(calls);
});

it("follows a panel the window's resizing moved", async () => {
  const tray = panel({ x: 300, y: 44, width: 290, height: 220 });
  const lower = followPanel(tray as unknown as HTMLElement);
  await tick();
  expect(native.raise).toHaveBeenLastCalledWith(true, 300, 44, 290, 220);
  // A wider window widens the field, and the tray at its end moves along.
  tray.box = { x: 380, y: 44, width: 290, height: 220 };
  host.dispatchEvent(new Event("resize"));
  expect(native.raise).toHaveBeenLastCalledWith(true, 380, 44, 290, 220);
  lower();
  host.dispatchEvent(new Event("resize"));
  expect(native.raise).toHaveBeenLastCalledWith(false, 380, 44, 290, 220);
});
