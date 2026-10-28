import { describe, expect, it } from "vitest";
import type { BookmarkView } from "$shared/ipc/bindings";
import { arm, claim, disarm } from "../lib/menu-target";

const view = (id: string): BookmarkView => ({
  id,
  title: id,
  url: `https://${id}.example/`,
  icon: null,
  children: 0,
  parent: null,
});
const panel = Symbol("panel");
const bar = Symbol("bar");

describe("the bookmark a native menu was opened on", () => {
  it("answers the view that asked, once", () => {
    arm(bar, view("a"));
    expect(claim(bar)?.id).toBe("a");
    expect(claim(bar)).toBeNull();
  });

  it("never answers a view that did not ask last", () => {
    arm(bar, view("a"));
    arm(panel, view("b"));
    expect(claim(bar)).toBeNull();
    expect(claim(panel)?.id).toBe("b");
  });

  it("is let go by the view that failed to open its menu, and only by it", () => {
    arm(bar, view("a"));
    disarm(panel);
    disarm(bar);
    expect(claim(bar)).toBeNull();
    arm(bar, view("c"));
    disarm(panel);
    expect(claim(bar)?.id).toBe("c");
  });
});
