import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("$shared/ipc/bindings", async () => {
  const { mockBindings } = await import("$shared/testing/bindings");
  return mockBindings({});
});

const { placeBefore } = await import("../row-drag.svelte");

/** Just enough of an element for placement: attributes, a box, ancestry. */
class Node {
  readonly children: Node[] = [];
  parent: Node | null = null;
  readonly dataset: { zephiumTabId?: string } = {};
  constructor(
    readonly tag: string,
    readonly attributes: string[] = [],
    readonly box = { left: 0, top: 0, width: 0, height: 0 },
    readonly direction: "ltr" | "rtl" = "ltr",
  ) {}
  add(...nodes: Node[]) {
    for (const node of nodes) {
      node.parent = this;
      this.children.push(node);
    }
    return this;
  }
  matches(selector: string) {
    return selector.startsWith("[")
      ? this.attributes.includes(selector.slice(1, -1))
      : this.tag === selector;
  }
  closest(selector: string): Node | null {
    return this.matches(selector) ? this : (this.parent?.closest(selector) ?? null);
  }
  querySelectorAll(selector: string): Node[] {
    return this.children.flatMap((child) => [
      ...(child.matches(selector) ? [child] : []),
      ...child.querySelectorAll(selector),
    ]);
  }
  getBoundingClientRect() {
    return this.box;
  }
}

function tab(id: string, box: Node["box"], direction: Node["direction"] = "ltr") {
  const row = new Node("li", ["data-zephium-tab-id"], box, direction);
  row.dataset.zephiumTabId = id;
  return row;
}

/** Tabs side by side, 100 points wide each, in the bar's strip. */
function strip(ids: string[], direction: Node["direction"] = "ltr") {
  const rows = ids.map((id, at) =>
    tab(
      id,
      {
        left: (direction === "rtl" ? ids.length - 1 - at : at) * 100,
        top: 0,
        width: 100,
        height: 30,
      },
      direction,
    ),
  );
  new Node("ul", ["data-strip-drop"]).add(...rows);
  return rows;
}

const drop = (row: Node, x: number, y: number, dragged = "dragged") =>
  placeBefore(row as unknown as Element, x, y, dragged);

describe("where a drop lands", () => {
  beforeEach(() => {
    vi.stubGlobal("getComputedStyle", (node: Node) => ({ direction: node.direction }));
  });

  it("reads the strip across: the near half is before a tab, the far half after it", () => {
    const [a, b, c] = strip(["a", "b", "c"]);
    expect(drop(b!, 120, 29)).toBe("b");
    expect(drop(b!, 180, 1)).toBe("c");
    expect(drop(a!, 10, 15)).toBe("a");
    // Past the last tab's middle is the end of the strip.
    expect(drop(c!, 260, 15)).toBeNull();
  });

  it("never places a tab before itself", () => {
    const [, b] = strip(["a", "b", "c"]);
    expect(drop(b!, 110, 15, "b")).toBe("c");
  });

  it("takes a right-to-left strip's far half to be its left one", () => {
    const [a, b] = strip(["a", "b", "c"], "rtl");
    // "a" stands rightmost, from 200 to 300.
    expect(drop(a!, 280, 15)).toBe("a");
    expect(drop(a!, 220, 15)).toBe("b");
    expect(drop(b!, 120, 15)).toBe("c");
  });

  it("goes from a split's last member to the strip's next tab", () => {
    const left = tab("left", { left: 0, top: 0, width: 100, height: 30 });
    const right = tab("right", { left: 100, top: 0, width: 100, height: 30 });
    const next = tab("next", { left: 200, top: 0, width: 100, height: 30 });
    const members = new Node("ul").add(left, right);
    new Node("ul", ["data-strip-drop"]).add(new Node("li").add(members), next);
    expect(drop(right, 190, 15)).toBe("next");
  });

  it("still reads the column's lists down, whatever the pointer's x", () => {
    const rows = ["a", "b"].map((id, at) =>
      tab(id, { left: 0, top: at * 30, width: 200, height: 30 }),
    );
    new Node("ul").add(...rows);
    expect(drop(rows[0]!, 190, 10)).toBe("a");
    expect(drop(rows[0]!, 10, 20)).toBe("b");
    expect(drop(rows[1]!, 10, 50)).toBeNull();
  });
});
