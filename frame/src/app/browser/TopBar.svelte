<script lang="ts">
  import * as m from "$shared/i18n/messages";
  import type { ComponentProps } from "svelte";
  import { Add01Icon, SidebarLeftIcon } from "@hugeicons/core-free-icons";
  import IconButton from "$shared/ui/IconButton";
  import LazyView from "$shared/ui/LazyView";
  import WindowControls from "$shared/ui/WindowControls";
  import { IS_MAC, IS_WINDOWS } from "$shared/platform";
  import { fullscreen } from "$shared/lib/fullscreen.svelte";
  import { tabs } from "$domain/tabs";
  import { preferences } from "$domain/preferences";
  import { surface as browserPage } from "$domain/surface";
  import * as toolHost from "$session/tools.svelte";
  import { reportBarHeight } from "$session/chrome-layout.svelte";
  import { sidebarPinned, toggleMode } from "$session/sidebar-mode.svelte";
  import { AddressField } from "$features/address";
  import { TabStrip } from "$features/tabs";
  import { ExtensionActions } from "$features/extensions";
  import { DownloadPulse } from "$features/downloads";
  import { ToolShelf } from "$features/dock";
  import { NavigationButtons, SidebarMenuButton } from "$features/sidebar";
  import { StoreInstallRail } from "$features/webext";
  import { loadBookmarksBar } from "$features/bookmarks";

  type Strip = ComponentProps<typeof TabStrip>;

  let {
    favorites,
    pinned,
    today,
    splitting,
    onSelect,
    tray,
  }: {
    favorites: Strip["favorites"];
    pinned: Strip["pinned"];
    today: Strip["today"];
    splitting: boolean;
    onSelect: (id: string) => void;
    /** What the field offers about the page: the same tray the column's field carries. */
    tray: ComponentProps<typeof AddressField>["trailing"];
  } = $props();

  // In fullscreen the lights are gone, and so is the room kept for them.
  let lights = $derived(IS_MAC && !fullscreen());
  // Work has no page in front: the field shows nothing and the page's
  // controls rest, while the strip still opens a tab over the canvas.
  let inWork = $derived(browserPage.currentPage() === "work");
  let incognito = $derived(tabs.profile()?.kind === "incognito");
  let profile = $derived(tabs.profile()?.id ?? null);
  // A private window keeps no bookmarks of its own to show.
  let bookmarks = $derived(
    preferences.value("ui.bookmarks-bar") === "true" && profile !== null && !incognito,
  );

  // The toggle stands the column beside the page or puts it back; with a
  // tool open it closes the tool, as the column's own toggle does.
  function toggle() {
    if (toolHost.activeTool() !== null) toolHost.close();
    else toggleMode();
  }

  // Native tiles the page below the bar, so the bar says how tall it is
  // whenever that changes, the bookmarks row included.
  let bar = $state<HTMLElement>();
  $effect(() => {
    const root = bar;
    if (!root) return;
    reportBarHeight(root.offsetHeight);
    const observer = new ResizeObserver(() => reportBarHeight(root.offsetHeight));
    observer.observe(root);
    return () => observer.disconnect();
  });
</script>

<!--
  The chrome as a bar across the window's top: the lights, the column's
  toggle, the page's controls and its address, the tabs, and what belongs to
  the window at the end. The bar's own ground moves the window; none of its
  controls do. What hangs from it over the page is opaque, since the page is
  another view the chrome cannot blur.
-->
<header
  bind:this={bar}
  class="top-bar"
  data-top-bar
  data-tauri-drag-region
  data-glass-text
  data-menu-material="opaque"
  aria-label={m.ui_top_bar()}
>
  <div class="bar-row" data-tauri-drag-region data-lights={lights || undefined}>
    <IconButton
      icon={SidebarLeftIcon}
      label={m.ui_compact_mode()}
      active={sidebarPinned()}
      onclick={toggle}
    />
    <NavigationButtons disabled={inWork} />
    <div class="bar-address">
      <AddressField variant="bar" compact={inWork} trailing={tray} />
    </div>
    {#if !inWork}<StoreInstallRail />{/if}
    <TabStrip {favorites} {pinned} {today} {splitting} {onSelect} />
    <IconButton icon={Add01Icon} label={m.new_tab()} onclick={tabs.open} />
    <span class="bar-end">
      <ExtensionActions bar />
      {#if tabs.profile()?.id && !inWork}<DownloadPulse profile={tabs.profile()?.id ?? ""} />{/if}
      {#if !incognito}<ToolShelf compact bar />{/if}
      {#if !inWork}<SidebarMenuButton size={16} buttonSize={28} />{/if}
      {#if !IS_MAC && !IS_WINDOWS}<WindowControls />{/if}
    </span>
    {#if IS_WINDOWS}<span class="caption-room" data-tauri-drag-region aria-hidden="true"
      ></span>{/if}
  </div>
  {#if bookmarks && profile !== null}<div class="bar-bookmarks">
      <LazyView
        loader={loadBookmarksBar}
        loadingLabel={m.surface_loading()}
        failureLabel={m.surface_render_failed()}
        retryLabel={m.surface_retry()}
        >{#snippet children(View)}<View {profile} />{/snippet}</LazyView
      >
    </div>{/if}
</header>

<style>
  /* On the window's own ground. Flat, the page meets its foot, so a rule
     draws where the two part and the row keeps a little room above it. */
  .top-bar {
    display: flex;
    flex-direction: column;
    grid-row: 1;
    grid-column: 1 / -1;
    min-width: 0;
    padding-block-end: calc(var(--chrome-inset) / 2);
    color: var(--color-text);
    box-shadow: var(--top-bar-rule);
    user-select: none;
  }

  /* The row's controls centre where the column's head does, on the band
     the window's own lights are lined up with. Flush with the window's
     edges, the bar keeps the gutter's room inside its own. */
  .bar-row {
    display: flex;
    align-items: center;
    gap: 4px;
    block-size: calc(var(--titlebar-height) + 8px);
    padding-block-start: 8px;
    padding-inline: calc(6px + var(--chrome-inset)) var(--chrome-inset);
    min-width: 0;
  }

  .bar-row[data-lights] {
    padding-inline-start: calc(var(--traffic-light-inset) + var(--chrome-inset));
  }

  .bar-address {
    display: flex;
    flex: none;
    margin-inline: 4px 8px;
  }

  .bar-end {
    display: flex;
    flex: none;
    align-items: center;
    gap: 4px;
  }

  /* The bookmarks row keeps its height from the first frame, so the page is
     tiled under it once rather than again when its chips arrive. */
  .bar-bookmarks {
    display: flex;
    flex-direction: column;
    justify-content: center;
    block-size: 28px;
    margin-block-start: 4px;
    min-width: 0;
  }

  .bar-bookmarks :global(.load-state) {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-block: 0;
    padding-inline: 8px;
    color: var(--color-faint);
    font-size: var(--text-label);
  }

  /* Windows draws the window's own buttons at its top-right corner. */
  .caption-room {
    flex: none;
    inline-size: var(--caption-reserve);
    align-self: stretch;
  }
</style>
