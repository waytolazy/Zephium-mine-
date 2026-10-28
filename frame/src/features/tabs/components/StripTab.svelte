<script lang="ts">
  import * as m from "$shared/i18n/messages";
  import { Cancel01Icon } from "@hugeicons/core-free-icons";
  import type { TabView } from "$shared/ipc/bindings";
  import FavIcon from "$shared/ui/FavIcon";
  import Icon from "$shared/ui/Icon";
  import AudioControl from "$shared/ui/AudioControl";
  import CaptureControl from "$shared/ui/CaptureControl";
  import { favicons } from "$domain/favicons";
  import { tabs } from "$domain/tabs";
  import { tabFallbackIcon } from "../lib/tab-icon";
  import { closeOnMiddleClick } from "../lib/middle-click";

  let {
    tab,
    active,
    iconOnly = false,
    kept = false,
    closable = true,
    grouped = false,
    splitCandidate,
    onSelect,
    onClose,
    onContextMenu,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
  }: {
    tab: TabView;
    active: boolean;
    /** Kept sites and pinned tabs are their marks alone; the title stays for native and for assistive technology. */
    iconOnly?: boolean;
    /** A kept site: dropping onto it keeps what is dropped. */
    kept?: boolean;
    closable?: boolean;
    /** One of a split's members, which share an enclosure. */
    grouped?: boolean;
    splitCandidate: boolean;
    onSelect: (id: string) => void;
    onClose: (id: string) => void;
    onContextMenu: (event: MouseEvent, tab: TabView) => void;
    onPointerDown: (event: PointerEvent, tab: TabView) => void;
    onPointerMove: (event: PointerEvent) => void;
    onPointerUp: (event: PointerEvent) => void;
    onPointerCancel: (event: PointerEvent) => void;
  } = $props();

  let name = $derived(tab.title || m.untitled_tab());
  // A tab with no page yet is a different thing from a page whose site simply
  // supplies no icon, and the mark should say which.
  let fallback = $derived(tabFallbackIcon(tab.content));

  function closeTab(event: MouseEvent) {
    event.stopPropagation();
    onClose(tab.id);
  }
</script>

<!--
  The row owns the presentation sentinels, whatever it draws: native
  resolves the tab by id and verifies its url, revision and title through
  this element before it reveals the page, so an icon-only row hides its
  title from sight and never from the document.
-->
<li
  data-motion-key={`tab:${tab.id}`}
  data-plate
  data-zephium-tab-id={tab.id}
  data-zephium-tab-url={tab.url ?? ""}
  data-zephium-projection-revision={tab.projection_revision}
  data-audio-host
  data-kept={kept || undefined}
  class={["strip-tab", iconOnly && "strip-tab-icon", grouped && "strip-tab-grouped"]}
  data-selected={active}
  data-split-candidate={splitCandidate}
>
  <button
    type="button"
    class="strip-open"
    aria-current={active ? "page" : undefined}
    aria-label={name}
    title={name}
    oncontextmenu={(event) => onContextMenu(event, tab)}
    onpointerdown={(event) => onPointerDown(event, tab)}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerCancel}
    onclick={() => onSelect(tab.id)}
    {...closable ? closeOnMiddleClick(() => onClose(tab.id)) : {}}
  >
    <FavIcon
      image={favicons.image(tab.icon)}
      tone={favicons.tone(tab.icon)}
      loading={tab.loading}
      size={16}
      lit={active || iconOnly}
      {fallback}
      notched={!!tab.audio}
    />
    <span data-zephium-tab-label class={iconOnly ? "sr-only" : "strip-label"}>{tab.title}</span>
  </button>
  {#if tab.audio}
    <AudioControl
      audio={tab.audio}
      size={16}
      offset={iconOnly ? undefined : 10}
      onToggle={(muted) => void tabs.setMuted(tab.id, muted)}
    />
  {/if}
  {#if tab.capture}
    <span class={iconOnly ? "strip-capture-badge" : "strip-status"}>
      <CaptureControl
        badge={iconOnly}
        site={tab.url ?? tab.title}
        capture={tab.capture}
        onOpen={(x, y) => tabs.openMediaMenu(tab.id, x, y)}
      />
    </span>
  {/if}
  {#if closable}
    <button
      type="button"
      aria-label={m.close_named_tab({ title: name })}
      title={m.close_tab()}
      class="strip-close"
      onclick={closeTab}
    >
      <Icon icon={Cancel01Icon} size={12} />
    </button>
  {/if}
</li>

<style>
  /* A pill in the bar's row: the column's fills and rim, at the bar's size. */
  .strip-tab {
    position: relative;
    display: flex;
    flex: 1 1 160px;
    align-items: center;
    min-width: 56px;
    max-width: 220px;
    height: 30px;
    border-radius: var(--radius-tab);
    color: var(--color-label-secondary);
    font-size: var(--sidebar-row-text);
    font-weight: var(--sidebar-row-weight);
    letter-spacing: -0.005em;
    transition:
      background-color var(--motion-fast) var(--ease-out),
      box-shadow var(--motion-fast) var(--ease-out),
      color var(--motion-base) var(--ease-out);
  }

  .strip-tab-icon {
    flex: none;
    width: 32px;
    min-width: 32px;
  }

  .strip-tab-grouped {
    border-radius: 0;
  }

  .strip-tab:not([data-selected="true"]):hover {
    background: var(--row-hover);
    color: var(--color-text);
  }

  .strip-tab:not([data-selected="true"]):has(> .strip-open:active) {
    background: var(--row-pressed);
  }

  .strip-tab[data-selected="true"] {
    background: var(--row-active);
    color: var(--color-row-current, var(--color-text));
    font-weight: var(--sidebar-row-weight-current);
  }

  .strip-tab[data-selected="true"]:not(.strip-tab-grouped) {
    box-shadow: var(--row-rim);
  }

  .strip-tab[data-split-candidate="true"] {
    box-shadow: inset 0 0 0 1px var(--color-accent);
  }

  .strip-open {
    display: flex;
    flex: 1;
    align-items: center;
    align-self: stretch;
    gap: 8px;
    min-width: 0;
    padding-inline: 10px 6px;
    border: 0;
    border-radius: inherit;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: start;
    cursor: default;
  }

  .strip-tab-icon .strip-open {
    justify-content: center;
    padding-inline: 0;
  }

  .strip-open:focus-visible {
    outline-offset: -2px;
  }

  /* The title dissolves into the pill's end rather than stopping on an ellipsis. */
  .strip-label {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    white-space: nowrap;
    mask-image: var(--mask-fade-end);
    transition: margin-inline-end var(--motion-fast) var(--ease-out);
  }

  .strip-label:dir(rtl) {
    mask-image: var(--mask-fade-end-rtl);
  }

  /* While the close control shows, the title ends before it. */
  .strip-tab:is(:hover, :focus-within, [data-selected="true"]) .strip-label,
  :global([data-close-buttons="always"]) .strip-tab:has(.strip-close) .strip-label {
    margin-inline-end: 20px;
  }

  .strip-status {
    display: flex;
    flex: none;
    align-items: center;
    margin-inline-end: 28px;
  }

  .strip-capture-badge {
    position: absolute;
    inset-block-start: 1px;
    inset-inline-end: 1px;
  }

  .strip-close {
    position: absolute;
    inset-inline-end: 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border: 0;
    border-radius: var(--radius-inset);
    background: transparent;
    color: var(--color-faint);
    opacity: 0;
    cursor: default;
    transition:
      opacity var(--motion-fast) var(--ease-out),
      background-color var(--motion-fast) var(--ease-out),
      color var(--motion-fast) var(--ease-out);
  }

  .strip-close:hover {
    background: var(--row-pressed);
    color: var(--color-text);
  }

  .strip-close:active {
    background: var(--color-fill-pressed);
  }

  :global([data-close-buttons="always"]) .strip-close,
  .strip-close:focus-visible,
  .strip-tab:is(:hover, [data-selected="true"]) .strip-close {
    opacity: 1;
  }

  @media (prefers-reduced-motion: reduce) {
    .strip-tab,
    .strip-label,
    .strip-close {
      transition: none;
    }
  }

  @media (forced-colors: active) {
    .strip-label {
      mask-image: none;
    }

    .strip-tab[data-selected="true"] {
      outline: 1px solid Highlight;
    }
  }
</style>
