<script lang="ts">
  import * as m from "$shared/i18n/messages";
  import { ArrowLeft02Icon, ArrowRight02Icon, Refresh01Icon } from "@hugeicons/core-free-icons";
  import { tabs } from "$domain/tabs";
  import { commands } from "$shared/ipc/bindings";
  import IconButton from "$shared/ui/IconButton";

  let {
    disabled = false,
  }: {
    /** Work has no page in front for them to act on. */
    disabled?: boolean;
  } = $props();

  let active = $derived(tabs.activeTab());

  // Back and Forward hold the pages behind and ahead; a held press or a right
  // click lists them in a native menu.
  function openHistoryMenu(forward: boolean, anchor: DOMRect) {
    const id = tabs.activeId();
    if (id) void commands.historyMenuPopup(id, forward, anchor.left, anchor.bottom);
  }
</script>

<div class="flex items-center gap-0.5" role="group" aria-label={m.ui_navigation()}>
  <IconButton
    icon={ArrowLeft02Icon}
    label={m.ui_back()}
    shape="rounded"
    buttonSize={28}
    size={16}
    disabled={disabled || active?.can_go_back !== true}
    onclick={tabs.backActive}
    onmenu={(anchor) => openHistoryMenu(false, anchor)}
  />
  <IconButton
    icon={ArrowRight02Icon}
    label={m.ui_forward()}
    shape="rounded"
    buttonSize={28}
    size={16}
    disabled={disabled || active?.can_go_forward !== true}
    onclick={tabs.forwardActive}
    onmenu={(anchor) => openHistoryMenu(true, anchor)}
  />
  <IconButton
    icon={Refresh01Icon}
    label={m.ui_reload()}
    shape="rounded"
    buttonSize={28}
    size={16}
    disabled={disabled || active === undefined}
    onclick={tabs.reloadActive}
  />
</div>
