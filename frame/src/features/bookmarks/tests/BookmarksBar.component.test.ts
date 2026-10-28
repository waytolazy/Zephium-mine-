import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { render } from "vitest-browser-svelte";
import { page, userEvent } from "vitest/browser";
import "$styles/global.css";
import type { BookmarkCall, BookmarkResponse, BookmarkView } from "$shared/ipc/bindings";
import { emitNativeEvent } from "$shared/testing/native-events";
import { uiCommands } from "$domain/ui-commands";
import { adoptLayout, resetChromeLayout } from "$session/chrome-layout.svelte";
import { resetChromeRaise } from "$session/chrome-raise.svelte";
import BookmarksBar from "../components/BookmarksBar.svelte";

const view = (id: string, title: string, url: string | null, children = 0): BookmarkView => ({
  id,
  title,
  url,
  icon: null,
  children,
  parent: null,
});

const top = [
  view("1", "Reading", null, 2),
  view("2", "Zephium", "https://zephium.app/"),
  view("3", "Rust docs", "https://doc.rust-lang.org/std/"),
];
const reading = [view("4", "Long read", "https://essay.example/a"), view("5", "Nested", null, 1)];

const native = vi.hoisted(() => ({
  active: "tab-1" as string | null,
  call: vi.fn(),
  navigate: vi.fn(async (_id: string, _input: string) => ({ operation_id: null, accepted: true })),
  open: vi.fn(async (_url: string, _newTab: boolean) => ({ operation_id: null, accepted: true })),
  menu: vi.fn(async (_x: number | null, _y: number | null, _folder: boolean) => true),
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
  return mockBindings({
    bookmarkCall: native.call,
    tabsNavigate: native.navigate,
    browserOpenUrl: native.open,
    bookmarkMenuPopup: native.menu,
    chromeRaise: native.raise,
    chromeSetLayout: async () => {},
  });
});
vi.mock("$domain/tabs", () => ({ tabs: { activeId: () => native.active } }));

let items = top;
function answer(call: BookmarkCall): BookmarkResponse {
  if (call.kind === "list" && call.folder === "1") {
    return { kind: "listing", folder: "1", path: [{ id: "1", title: "Reading" }], items: reading };
  }
  if (call.kind === "list") return { kind: "listing", folder: null, path: [], items };
  return { kind: "saved", id: null };
}

beforeEach(async () => {
  items = top;
  native.active = "tab-1";
  native.call.mockImplementation(async (_profile: string, call: BookmarkCall) => answer(call));
  await page.viewport(900, 400);
  await uiCommands.init();
});
afterEach(() => {
  uiCommands.dispose();
  resetChromeLayout();
  resetChromeRaise();
  vi.clearAllMocks();
});

test("shows the top level as one row of chips, clipped at its end with no scrollbar", async () => {
  const screen = await render(BookmarksBar, { profile: "p" });
  await expect.element(screen.getByRole("button", { name: "Zephium" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Rust docs" })).toBeVisible();
  await expect.element(screen.getByRole("button", { name: "Reading" })).toBeVisible();
  expect(native.call).toHaveBeenCalledWith("p", { kind: "list", folder: null });

  const bar = screen.container.querySelector<HTMLElement>(".bookmarks-bar")!;
  expect(bar.getBoundingClientRect().height).toBe(28);
  const chips = bar.querySelector<HTMLElement>(".chips")!;
  expect(getComputedStyle(chips).maskImage).toMatch(/linear-gradient/u);
  expect(getComputedStyle(chips).overflowX).not.toBe("visible");
  expect(chips.offsetHeight - chips.clientHeight).toBe(0);
  expect(screen.container.querySelector(".hint")).toBeNull();
});

test("a link opens in the tab in front, or in a tab of its own when there is none", async () => {
  const screen = await render(BookmarksBar, { profile: "p" });
  await screen.getByRole("button", { name: "Zephium" }).click();
  expect(native.navigate).toHaveBeenLastCalledWith("tab-1", "https://zephium.app/");
  expect(native.open).not.toHaveBeenCalled();

  native.active = null;
  await screen.getByRole("button", { name: "Rust docs" }).click();
  expect(native.open).toHaveBeenLastCalledWith("https://doc.rust-lang.org/std/", false);
});

test("a folder is a menu of its children one level deep, raised over the page while open", async () => {
  adoptLayout("horizontal");
  const screen = await render(BookmarksBar, { profile: "p" });
  await screen.getByRole("button", { name: "Reading" }).click();
  expect(native.call).toHaveBeenCalledWith("p", { kind: "list", folder: "1" });

  const link = screen.getByRole("menuitem", { name: "Long read" });
  await expect.element(link).toBeVisible();
  // A folder inside it is shown, not entered.
  await expect.element(screen.getByRole("menuitem", { name: "Nested" })).toBeDisabled();
  await expect
    .element(screen.getByRole("button", { name: "Reading" }))
    .toHaveAttribute("aria-expanded", "true");

  // The menu hangs under its chip and past the row's clip.
  const chip = screen.getByRole("button", { name: "Reading" }).element().getBoundingClientRect();
  const panel = screen.container.querySelector<HTMLElement>(".bar-menu")!.getBoundingClientRect();
  expect(panel.top).toBeGreaterThanOrEqual(chip.bottom);
  expect(Math.abs(panel.left - chip.left)).toBeLessThan(2);
  expect(getComputedStyle(screen.container.querySelector(".chips")!).maskImage).toBe("none");

  await vi.waitFor(() => expect(native.raise).toHaveBeenCalled());
  const [raised, , , width, height] = native.raise.mock.calls.at(-1)!;
  expect(raised).toBe(true);
  expect(width).toBeGreaterThan(100);
  expect(height).toBeGreaterThan(30);

  await link.click();
  expect(native.navigate).toHaveBeenLastCalledWith("tab-1", "https://essay.example/a");
  await vi.waitFor(() => expect(native.raise.mock.calls.at(-1)![0]).toBe(false));
});

test("a menu opened while the column stands beside the page raises nothing", async () => {
  const screen = await render(BookmarksBar, { profile: "p" });
  await screen.getByRole("button", { name: "Reading" }).click();
  await expect.element(screen.getByRole("menuitem", { name: "Long read" })).toBeVisible();
  await userEvent.keyboard("{Escape}");
  expect(native.raise).not.toHaveBeenCalled();
});

test("a folder menu opens from the keyboard onto its first row", async () => {
  const screen = await render(BookmarksBar, { profile: "p" });
  const folder = screen.getByRole("button", { name: "Reading" });
  await expect.element(folder).toBeVisible();
  folder.element().focus();
  await vi.waitFor(() =>
    expect(native.call).toHaveBeenCalledWith("p", { kind: "list", folder: "1" }),
  );
  await userEvent.keyboard("{Enter}");
  await expect.element(screen.getByRole("menuitem", { name: "Long read" })).toHaveFocus();
  await userEvent.keyboard("{Escape}");
  await expect.element(folder).toHaveFocus();
});

test("the native menu opens on a link, and what it chooses is applied to that link", async () => {
  const screen = await render(BookmarksBar, { profile: "p" });
  await expect.element(screen.getByRole("button", { name: "Zephium" })).toBeVisible();
  const chip = screen.getByRole("button", { name: "Zephium" }).element();
  const event = new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: 120,
    clientY: 14,
  });
  chip.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
  expect(native.menu).toHaveBeenCalledWith(120, 14, false);

  emitNativeEvent("uiCommand", "bookmark.menu.openNewTab");
  await vi.waitFor(() =>
    expect(native.open).toHaveBeenLastCalledWith("https://zephium.app/", true),
  );

  // The answer is taken once: a second one belongs to no menu.
  emitNativeEvent("uiCommand", "bookmark.menu.remove");
  await new Promise((done) => setTimeout(done, 50));
  expect(native.call).not.toHaveBeenCalledWith("p", expect.objectContaining({ kind: "remove" }));

  chip.dispatchEvent(
    new MouseEvent("contextmenu", { bubbles: true, cancelable: true, clientX: 1, clientY: 1 }),
  );
  emitNativeEvent("uiCommand", "bookmark.menu.remove");
  await vi.waitFor(() =>
    expect(native.call).toHaveBeenCalledWith("p", { kind: "remove", id: "2" }),
  );
});

test("a link is renamed in place from the native menu", async () => {
  const screen = await render(BookmarksBar, { profile: "p" });
  await expect.element(screen.getByRole("button", { name: "Rust docs" })).toBeVisible();
  screen
    .getByRole("button", { name: "Rust docs" })
    .element()
    .dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  emitNativeEvent("uiCommand", "bookmark.menu.rename");
  const field = screen.getByRole("textbox", { name: "Rename" });
  await expect.element(field).toHaveFocus();
  await userEvent.clear(field);
  await userEvent.type(field, "Std{Enter}");
  await vi.waitFor(() =>
    expect(native.call).toHaveBeenCalledWith("p", { kind: "rename", id: "3", title: "Std" }),
  );
});

test("an empty top level says so once, faintly, and fills as bookmarks arrive", async () => {
  items = [];
  const screen = await render(BookmarksBar, { profile: "p" });
  await expect.element(screen.getByText("Bookmarks you add appear here.")).toBeVisible();
  expect(screen.container.querySelectorAll(".chip")).toHaveLength(0);

  items = [view("9", "Fresh", "https://fresh.example/")];
  emitNativeEvent("uiCommand", "bookmark.added=9");
  await expect.element(screen.getByRole("button", { name: "Fresh" })).toBeVisible();
  await expect.element(screen.getByText("Bookmarks you add appear here.")).not.toBeInTheDocument();
});

test("a failed read says the bookmarks are unavailable instead of looking empty", async () => {
  native.call.mockResolvedValue({ kind: "error", error: "unavailable" });
  const screen = await render(BookmarksBar, { profile: "p" });
  await expect.element(screen.getByText("Bookmarks are unavailable")).toBeVisible();
});

test("many bookmarks stay in one row, and the last is reachable by the keyboard", async () => {
  items = Array.from({ length: 40 }, (_, index) =>
    view(String(index + 10), `Bookmark number ${index}`, `https://site${index}.example/`),
  );
  const screen = await render(BookmarksBar, { profile: "p" });
  await expect.element(screen.getByRole("button", { name: "Bookmark number 0" })).toBeVisible();
  const chips = screen.container.querySelector<HTMLElement>(".chips")!;
  expect(chips.scrollWidth).toBeGreaterThan(chips.clientWidth);
  expect(screen.container.querySelector(".bookmarks-bar")!.getBoundingClientRect().height).toBe(28);

  const last = screen.getByRole("button", { name: "Bookmark number 39" });
  last.element().focus();
  expect(chips.scrollLeft).toBeGreaterThan(0);
});
