import { tabs } from "$domain/tabs";
import { blocker, siteMenuState } from "$domain/blocker";
import { pageSite } from "$domain/site-data";
import { extensions } from "$domain/extensions";
import { webext } from "$domain/webext";
import { commands } from "$shared/ipc/bindings";

/**
 * The column's native menu: the page's controls, the column's shape and,
 * where there is no room for their buttons, the extensions'. A popup chosen
 * there hangs from the button that opened the menu, so the button is kept
 * for the command that comes back.
 */
let anchor: DOMRect | null = null;
let handled = 0;

export function openSidebarMenu(button: HTMLElement) {
  const rect = button.getBoundingClientRect();
  anchor = rect;
  const active = tabs.activeTab();
  const { siteProtected, canHide } = siteMenuState(blocker.status());
  // A private window keeps nothing to clear, and only a web page has a site.
  const canClearData =
    tabs.profile()?.kind !== "incognito" &&
    (active?.content ?? "web") === "web" &&
    pageSite(active?.url) !== null;
  const listed = extensions
    .activeActions(tabs.profile()?.id ?? null, tabs.activeId())
    .map((action) => ({
      id: action.runtime.install_id,
      label: action.badge ? `${action.label} (${action.badge})` : action.label,
      icon: action.icon_rgba_base64,
      enabled: action.enabled,
    }));
  void commands.sidebarMenuPopup(
    rect.left,
    rect.bottom,
    siteProtected,
    canHide,
    canClearData,
    listed,
    webext.isAvailable(),
  );
}

/** Runs an extension chosen from the menu, once, whichever button hears it. */
export function followMenuCommand(command: { seq: number; id: string }) {
  if (command.seq === 0 || command.seq === handled) return;
  handled = command.seq;
  if (!command.id.startsWith("extension.action=")) return;
  const id = command.id.slice("extension.action=".length);
  const profile = tabs.profile()?.id ?? null;
  const tab = tabs.activeId();
  const action = extensions
    .activeActions(profile, tab)
    .find((candidate) => candidate.runtime.install_id === id);
  if (profile === null || tab === null || !action || !anchor) return;
  void extensions.invoke(profile, tab, action, anchor);
}
