<script lang="ts">
  import * as m from "$shared/i18n/messages";
  import { SidebarLeftIcon } from "@hugeicons/core-free-icons";
  import { IS_MAC, IS_WINDOWS } from "$shared/platform";
  import { fullscreen } from "$shared/lib/fullscreen.svelte";
  import IconButton from "$shared/ui/IconButton";
  import ModeTabs from "./ModeTabs.svelte";
  import NavigationButtons from "./NavigationButtons.svelte";
  import SidebarMenuButton from "./SidebarMenuButton.svelte";
  import SidebarSearch from "./SidebarSearch.svelte";
  import WindowControls from "$shared/ui/WindowControls";

  let {
    compact,
    ontoggle,
    pageControls = true,
    launcher = false,
    bar = false,
  }: {
    compact: boolean;
    ontoggle: () => void;
    /** Back, forward and reload act on a page; Work shows none. */
    pageControls?: boolean;
    /** Beside a tool panel, search stands where the shape toggle would. */
    launcher?: boolean;
    /** The tabs run across a bar at the window's top, which holds the
     *  lights, the toggle, the page's controls and the menu itself. */
    bar?: boolean;
  } = $props();

  // In fullscreen the lights are gone, and so is the room kept for them.
  let lights = $derived(IS_MAC && !fullscreen() && !bar);
</script>

<!--
  macOS keeps AppKit's traffic lights through the overlay title bar, so the
  leading 52px of the top row belongs to the system, except in fullscreen,
  where AppKit hides them. Windows reveals native
  controls at the top-right edge. On Linux the controls are ours, and at rail width they move into the collapsed menu
  because three buttons cannot fit beside anything else.
-->
{#if compact}
  <!--
    The rail's head: which environment you are in, then the two controls that
    act on the column. At 56px two 26px buttons are exactly what fits on one
    line, and the rule below them says where the head ends.
  -->
  <header class="flex shrink-0 flex-col items-center gap-[3px]" aria-label={m.ui_navigation()}>
    {#if lights}
      <div style:height="var(--titlebar-height)" aria-hidden="true"></div>
    {:else if IS_MAC && !bar}
      <div style:height="8px" aria-hidden="true"></div>
    {/if}
    <ModeTabs compact />
    <div class="flex items-center gap-0.5">
      <!-- Its menu acts on the page and the column's shape; Work has neither,
           and the bar keeps its own. -->
      {#if pageControls && !bar}<SidebarMenuButton />{/if}
      <SidebarSearch small />
    </div>
    <span class="mt-[6px] mb-[7px] h-px w-[22px] rounded-full bg-border" aria-hidden="true"></span>
  </header>
{:else if !bar || launcher}
  <header
    class="flex shrink-0 items-center gap-px pe-1.5"
    style:height="var(--titlebar-height)"
    style:padding-inline-start={lights
      ? "var(--traffic-light-inset)"
      : launcher && IS_WINDOWS
        ? "0"
        : "6px"}
    aria-label={m.ui_navigation()}
  >
    <!-- Beside a tool panel the panel's own close button already gives the
         column back, so a second way to the same shape would only crowd the
         lights; search stands there instead. -->
    {#if launcher && IS_WINDOWS}<span class="flex w-14 shrink-0 justify-center"
        ><ModeTabs compact /></span
      >{:else if launcher}<span class="ms-1.5 flex"><SidebarSearch /></span>{:else}<IconButton
        icon={SidebarLeftIcon}
        label={m.ui_compact_mode()}
        onclick={ontoggle}
      />{/if}<span class="flex-1" aria-hidden="true"></span>

    {#if pageControls && !bar}<NavigationButtons />{/if}

    {#if !IS_MAC && !IS_WINDOWS && !bar}
      <WindowControls />
    {/if}
  </header>
{/if}
