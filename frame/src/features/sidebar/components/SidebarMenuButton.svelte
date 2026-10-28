<script lang="ts">
  import * as m from "$shared/i18n/messages";
  import { EllipsisIcon } from "@hugeicons/core-free-icons";
  import { untrack } from "svelte";
  import { uiCommands as ui } from "$domain/ui-commands";
  import IconButton from "$shared/ui/IconButton";
  import { followMenuCommand, openSidebarMenu } from "../lib/sidebar-menu";

  let {
    size = 15,
    buttonSize = 26,
  }: {
    size?: number;
    buttonSize?: number;
  } = $props();

  // An extension chosen from the menu answers as a command; whichever button
  // is mounted runs it, once.
  $effect(() => {
    const command = ui.uiCommand();
    untrack(() => followMenuCommand(command));
  });
</script>

<IconButton
  icon={EllipsisIcon}
  label={m.ui_sidebar_options()}
  {size}
  {buttonSize}
  haspopup
  onclick={(event) => {
    if (event.currentTarget instanceof HTMLElement) openSidebarMenu(event.currentTarget);
  }}
/>
