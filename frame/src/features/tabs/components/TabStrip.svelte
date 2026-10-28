<script lang="ts">
  import * as m from "$shared/i18n/messages";
  import { untrack } from "svelte";
  import type { TabView } from "$shared/ipc/bindings";
  import { tabs } from "$domain/tabs";
  import { favicons } from "$domain/favicons";
  import { preferences } from "$domain/preferences";
  import * as tabDrag from "$session/tab-drag.svelte";
  import { RowDrag } from "$session/row-drag.svelte";
  import { ListMotion } from "$shared/lib/list-motion";
  import { reducedMotion } from "$shared/lib/motion";
  import DragMark from "$shared/ui/DragMark";
  import type { SidebarEntry } from "../lib/sidebar-model";
  import { stripUnits } from "../lib/strip-model";
  import StripTab from "./StripTab.svelte";

  let {
    favorites,
    pinned,
    today,
    splitting = false,
    onSelect,
  }: {
    favorites: SidebarEntry[];
    pinned: SidebarEntry[];
    today: SidebarEntry[];
    splitting?: boolean;
    onSelect: (id: string) => void;
  } = $props();

  let units = $derived(stripUnits({ favorites, pinned, today }, tabs.splitGroup()));
  let list = $state<HTMLUListElement>();

  const drag = new RowDrag({
    list: () => list,
    // The column's in-place reorder steps rows vertically; the strip places
    // a drop by where it lands instead, read across the row.
    reorder: () => null,
    drop: ({ id, x, y, over, before }) => {
      if (!over?.closest("[data-strip-drop]")) {
        tabs.dropTab(id, x, y);
        return;
      }
      // Onto a kept site keeps the tab, as the column's kept sites do; a tab
      // that cannot be kept goes back where it was.
      const essential = !!over.closest("[data-kept]");
      if (essential && !tabDrag.keepable(id)) return;
      // A split's member leaves it for wherever it is let go, as in the column.
      if (tabs.inSplit(id)) {
        void tabDrag.leaveSplit(id, { essential, before });
        return;
      }
      // Let go where it already stands, in the same kind of place: nothing moves.
      const order = units.flatMap((unit) =>
        unit.kind === "split" ? unit.tabs.map((tab) => tab.id) : [unit.tab.id],
      );
      const kept = favorites.some((entry) => entry.kind === "tab" && entry.tab.id === id);
      if (before === (order[order.indexOf(id) + 1] ?? null) && essential === kept) return;
      void tabDrag.move(id, essential, before);
    },
  });
  const handlePointerDown = (event: PointerEvent, tab: TabView) => drag.down(event, tab.id);
  const handlePointerMove = (event: PointerEvent) => drag.move(event);
  const handlePointerUp = (event: PointerEvent) => drag.up(event);
  const handlePointerCancel = (event: PointerEvent) => drag.cancel(event);

  function handleContextMenu(event: MouseEvent, tab: TabView) {
    // A DOM menu cannot reach past the chrome WebView, so the tab menu is a
    // real native popup owned by Rust.
    event.preventDefault();
    drag.abandon();
    tabs.openTabMenu(tab.id, event.clientX, event.clientY);
  }

  function select(id: string) {
    if (drag.swallowClick()) return;
    onSelect(id);
  }

  const closable = (id: string, section: "favorites" | "pinned" | "today") =>
    section === "today" && !tabs.loneNewTab(id);

  // Motion follows the strip's shape, not its content, as the column's lists do.
  const motion = new ListMotion({ enter: () => "grow" });
  let shape = $derived(units.map((unit) => unit.key).join(" "));
  $effect.pre(() => {
    void shape;
    untrack(() => {
      motion.capture(list);
      drag.landed();
    });
  });
  $effect(() => {
    void shape;
    untrack(() => motion.play(list));
  });

  // The strip has no scrollbar to drag, so a wheel turned over it moves it
  // sideways; a trackpad's own sideways travel is left to the browser.
  $effect(() => {
    const strip = list;
    if (!strip) return;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      if (strip.scrollWidth <= strip.clientWidth) return;
      event.preventDefault();
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? strip.clientWidth
            : 1;
      const step = event.deltaY * unit;
      strip.scrollBy({ left: getComputedStyle(strip).direction === "rtl" ? -step : step });
    };
    strip.addEventListener("wheel", wheel, { passive: false });
    return () => strip.removeEventListener("wheel", wheel);
  });

  // The current tab is always in view: scrolled to as it changes, by as
  // little as brings it wholly inside the strip.
  $effect(() => {
    const id = tabs.activeId();
    void shape;
    untrack(() => reveal(id));
  });

  function reveal(id: string | null) {
    const strip = list;
    if (!strip || id === null) return;
    const row = strip.querySelector<HTMLElement>(`[data-motion-key="tab:${CSS.escape(id)}"]`);
    if (!row) return;
    const bounds = strip.getBoundingClientRect();
    const rect = row.getBoundingClientRect();
    const margin = 8;
    const shift =
      rect.left < bounds.left + margin
        ? rect.left - bounds.left - margin
        : rect.right > bounds.right - margin
          ? rect.right - bounds.right + margin
          : 0;
    if (shift !== 0) strip.scrollBy({ left: shift, behavior: reducedMotion() ? "auto" : "smooth" });
  }
</script>

<nav
  class="tab-strip"
  aria-label={m.open_tabs()}
  data-close-buttons={preferences.value("tabs.close-button")}
>
  <ul bind:this={list} class="strip-list" data-strip-drop role="list">
    {#each units as unit (unit.key)}
      {#if unit.kind === "split"}
        {@const holdsActive = unit.tabs.some((tab) => tab.id === tabs.activeId())}
        <!-- A split reads as one object here as in the column: its members
             share an enclosure and a hairline seam. -->
        <li class="strip-split" data-motion-key={unit.key} data-holds-active={holdsActive}>
          <ul class="strip-split-members" role="list" aria-label={m.ui_split_group()}>
            {#each unit.tabs as tab (tab.id)}
              <StripTab
                {tab}
                grouped
                closable={closable(tab.id, "today")}
                active={tab.id === tabs.activeId()}
                splitCandidate={splitting && tab.id !== tabs.activeId()}
                onSelect={select}
                onClose={tabs.close}
                onContextMenu={handleContextMenu}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
              />
            {/each}
          </ul>
        </li>
      {:else}
        <StripTab
          tab={unit.tab}
          iconOnly={unit.section !== "today"}
          kept={unit.section === "favorites"}
          closable={closable(unit.tab.id, unit.section)}
          active={unit.tab.id === tabs.activeId()}
          splitCandidate={splitting && unit.tab.id !== tabs.activeId()}
          onSelect={select}
          onClose={tabs.close}
          onContextMenu={handleContextMenu}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerCancel}
        />
      {/if}
    {/each}
  </ul>
</nav>

{#if drag.ghost !== null}{@const held = tabs
    .tabs()
    .find((tab) => tab.id === drag.ghost?.id)}<DragMark
    x={drag.ghost.x}
    y={drag.ghost.y}
    image={favicons.image(held?.icon)}
    tone={favicons.tone(held?.icon)}
    title={held?.title}
  />{/if}

<style>
  .tab-strip {
    display: flex;
    flex: 1;
    min-width: 0;
  }

  /* Tabs give up width down to a readable floor, then the row scrolls; the
     scrollbar itself is never drawn, the wheel and the current tab move it. */
  .strip-list {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 2px;
    min-width: 0;
    overflow: auto hidden;
    overscroll-behavior-x: contain;
    scrollbar-width: none;
  }

  .strip-list::-webkit-scrollbar {
    display: none;
  }

  .strip-split {
    display: flex;
    flex: 2 1 320px;
    min-width: 112px;
    max-width: 440px;
    overflow: hidden;
    border-radius: var(--radius-tab);
    background: var(--color-fill);
    transition: box-shadow var(--motion-fast) var(--ease-out);
  }

  .strip-split[data-holds-active="true"] {
    background: transparent;
    box-shadow: var(--shadow-raised);
  }

  .strip-split-members {
    display: flex;
    flex: 1;
    min-width: 0;
  }

  .strip-split-members > :global(li + li) {
    border-inline-start: 1px solid var(--color-border);
  }

  .strip-split-members > :global(li) {
    max-width: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .strip-split {
      transition: none;
    }
  }
</style>
