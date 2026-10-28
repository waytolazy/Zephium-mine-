<script lang="ts">
  import { onDestroy, tick, untrack } from "svelte";
  import { Folder01Icon, Globe02Icon } from "@hugeicons/core-free-icons";
  import type { BookmarkView } from "$shared/ipc/bindings";
  import { commands } from "$shared/ipc/bindings";
  import { favicons } from "$domain/favicons";
  import { tabs } from "$domain/tabs";
  import { uiCommands } from "$domain/ui-commands";
  import { horizontal } from "$session/chrome-layout.svelte";
  import { raiseFor } from "$session/chrome-raise.svelte";
  import * as notices from "$session/notice.svelte";
  import Disclosure from "$shared/ui/Disclosure";
  import FavIcon from "$shared/ui/FavIcon";
  import Icon from "$shared/ui/Icon";
  import * as m from "$shared/i18n/messages";
  import { BookmarksSession, bookmarksWrites } from "../lib/bookmarks-session.svelte";
  import * as menuTarget from "../lib/menu-target";

  let { profile }: { profile: string } = $props();

  /** A folder's menu is never wider than this, so it can be kept in the window. */
  const MENU_WIDTH = 280;
  const MENU_GAP = 6;
  const MENU_MARGIN = 8;

  const menuOwner = Symbol("bookmarks bar");
  let session = $state.raw(untrack(() => new BookmarksSession(profile)));
  let loaded = $state(false);
  /** The folders read so far, one session each. They are kept after their menu
   *  closes so it fades out holding what it showed. */
  let folders = $state.raw<Record<string, BookmarksSession>>({});
  let openFolder = $state<string | null>(null);
  let renaming = $state<string | null>(null);
  let draft = $state("");
  let row = $state<HTMLElement>();
  let lower: (() => void) | null = null;

  let empty = $derived(loaded && session.error === null && session.items.length === 0);

  // Only the owning profile decides which session this is.
  $effect(() => {
    const owner = profile;
    return untrack(() => {
      const current = new BookmarksSession(owner);
      session = current;
      loaded = false;
      closed(openFolder);
      folders = {};
      void current.open(null).then(() => {
        if (session === current) loaded = true;
      });
      return () => {
        current.stop();
        for (const folder of Object.values(folders)) folder.stop();
      };
    });
  });

  function refresh() {
    void session.open(null);
    if (openFolder !== null) void folders[openFolder]?.open(openFolder);
  }

  // Native announces no change to the bookmarks. This view reads again when
  // the panel writes, when a page is bookmarked, and when the window returns.
  let written = untrack(() => bookmarksWrites());
  $effect(() => {
    const count = bookmarksWrites();
    if (count === written) return;
    written = count;
    untrack(refresh);
  });
  $effect(() => {
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  });

  /** A folder is read as it is reached, so its menu is full when it opens. */
  function warm(id: string) {
    const known = folders[id];
    const folder = known ?? new BookmarksSession(profile);
    if (!known) folders = { ...folders, [id]: folder };
    if (!folder.loading) void folder.open(id);
  }

  const slotOf = (id: string) =>
    row?.querySelector<HTMLElement>(`[data-bookmark-id="${CSS.escape(id)}"]`) ?? null;

  /** The menu hangs from its chip. It is fixed, so the row's clip never cuts
   *  it, and kept inside the window. */
  function place(id: string) {
    const slot = slotOf(id);
    if (!slot) return;
    const rect = slot.getBoundingClientRect();
    const width = document.documentElement.clientWidth;
    const room = Math.max(MENU_MARGIN, width - MENU_WIDTH - MENU_MARGIN);
    const rtl = getComputedStyle(slot).direction === "rtl";
    const start = rtl
      ? Math.min(Math.max(MENU_MARGIN, width - rect.right), room)
      : Math.min(Math.max(MENU_MARGIN, rect.left), room);
    slot.style.setProperty("--menu-top", `${rect.bottom + MENU_GAP}px`);
    slot.style.setProperty("--menu-left", rtl ? "auto" : `${start}px`);
    slot.style.setProperty("--menu-right", rtl ? `${start}px` : "auto");
  }

  function opened(id: string) {
    openFolder = id;
    warm(id);
    place(id);
  }

  function closed(id: string | null) {
    if (id === null || openFolder !== id) return;
    openFolder = null;
    lower?.();
    lower = null;
  }

  // With the chrome across the top, the open menu hangs over the page: native
  // brings the chrome over it, measured once it is in the document, and again
  // as its listing arrives and as its opening settles.
  async function raise() {
    const id = openFolder;
    if (id === null || !horizontal()) return;
    await tick();
    if (openFolder !== id) return;
    const panel = slotOf(id)?.querySelector<HTMLElement>(".ui-disclosure-panel");
    if (panel) lower = raiseFor(panel);
  }
  $effect(() => {
    const id = openFolder;
    if (id === null) return;
    void folders[id]?.items;
    untrack(() => void raise());
  });
  $effect(() => {
    const element = row;
    if (!element) return;
    const settled = (event: TransitionEvent) => {
      if (event.propertyName === "scale") void raise();
    };
    element.addEventListener("transitionend", settled);
    return () => element.removeEventListener("transitionend", settled);
  });
  onDestroy(() => lower?.());

  const hostOf = (url: string) => {
    try {
      return new URL(url).host;
    } catch {
      return url;
    }
  };
  const nameOf = (item: BookmarkView) => item.title || hostOf(item.url ?? "");

  /** In the tab in front, or a tab of its own when none is. */
  function openHere(url: string) {
    const id = tabs.activeId();
    void (id === null ? commands.browserOpenUrl(url, false) : commands.tabsNavigate(id, url)).catch(
      () => {},
    );
  }

  function openMenu(event: MouseEvent, item: BookmarkView) {
    event.preventDefault();
    if (renaming !== null) return;
    menuTarget.arm(menuOwner, item);
    void commands.bookmarkMenuPopup(event.clientX, event.clientY, false).catch(() => {
      menuTarget.disarm(menuOwner);
    });
  }

  function startRename(item: BookmarkView) {
    renaming = item.id;
    draft = item.title;
  }

  async function finishRename(item: BookmarkView, keep: boolean) {
    if (renaming !== item.id) return;
    renaming = null;
    const title = draft.trim();
    if (keep && title && title !== item.title) await session.rename(item.id, title);
  }

  const focusAndSelect = (node: HTMLInputElement) => {
    node.focus();
    node.select();
  };

  function runMenu(action: string) {
    const item = menuTarget.claim(menuOwner);
    if (!item) return;
    switch (action) {
      case "open":
        if (item.url) openHere(item.url);
        break;
      case "openNewTab":
        if (item.url) void commands.browserOpenUrl(item.url, true).catch(() => {});
        break;
      case "copyLink":
        if (item.url)
          void navigator.clipboard.writeText(item.url).then(
            () => notices.show(m.notice_link_copied()),
            () => {},
          );
        break;
      case "rename":
        startRename(item);
        break;
      case "remove":
        void session.remove(item.id);
        break;
    }
  }

  // Only commands that arrive while this bar is mounted are its own.
  let handled = untrack(() => uiCommands.uiCommand().seq);
  $effect(() => {
    const command = uiCommands.uiCommand();
    if (command.seq === handled) return;
    handled = command.seq;
    untrack(() => {
      if (command.id.startsWith("bookmark.added=")) refresh();
      else if (command.id.startsWith("bookmark.menu."))
        runMenu(command.id.slice("bookmark.menu.".length));
    });
  });
</script>

<nav class="bookmarks-bar" aria-label={m.bookmarks_bar_label()} data-open={openFolder !== null}>
  {#if session.error === "unavailable" || session.error === "capacity"}
    <p class="hint">{m.bookmarks_unavailable()}</p>
  {:else if empty}
    <p class="hint">{m.bookmarks_bar_empty()}</p>
  {:else}
    <ul class="chips" bind:this={row}>
      {#each session.items as item (item.id)}
        {@const url = item.url}
        <li
          class="slot"
          data-bookmark-id={item.id}
          onpointerenter={url === null ? () => warm(item.id) : undefined}
          onfocusin={url === null ? () => warm(item.id) : undefined}
        >
          {#if url === null}
            <Disclosure
              menu
              label={nameOf(item)}
              triggerClass="chip"
              panelClass="bar-menu"
              onopen={() => opened(item.id)}
              onclose={() => closed(item.id)}
            >
              {#snippet trigger()}<Icon icon={Folder01Icon} size={16} /><span class="label"
                  >{nameOf(item)}</span
                >{/snippet}
              {@const listing = folders[item.id]}
              {#if listing}
                {#each listing.items as child (child.id)}
                  {@const target = child.url}
                  {#if target === null}
                    <button
                      type="button"
                      role="menuitem"
                      class="ui-menu-item"
                      disabled
                      aria-disabled="true"
                      data-disabled
                    >
                      <span class="ui-menu-icon"><Icon icon={Folder01Icon} size={16} /></span>
                      <span class="menu-label">{nameOf(child)}</span>
                    </button>
                  {:else}
                    <button
                      type="button"
                      role="menuitem"
                      class="ui-menu-item"
                      title={target}
                      onclick={() => openHere(target)}
                    >
                      <span class="ui-menu-icon"
                        ><FavIcon
                          image={favicons.mark(child.icon, target)?.image ?? null}
                          tone={favicons.mark(child.icon, target)?.tone}
                          size={16}
                          lit
                          fallback={Globe02Icon}
                        /></span
                      >
                      <span class="menu-label">{nameOf(child)}</span>
                    </button>
                  {/if}
                {/each}
                {#if listing.error !== null}
                  <button type="button" role="menuitem" class="ui-menu-item" disabled data-disabled>
                    <span class="menu-label">{m.bookmarks_unavailable()}</span>
                  </button>
                {:else if listing.empty}
                  <button type="button" role="menuitem" class="ui-menu-item" disabled data-disabled>
                    <span class="menu-label">{m.bookmarks_folder_empty()}</span>
                  </button>
                {/if}
              {/if}
            </Disclosure>
          {:else if renaming === item.id}
            <span class="chip editing">
              <FavIcon
                image={favicons.mark(item.icon, url)?.image ?? null}
                tone={favicons.mark(item.icon, url)?.tone}
                size={16}
                lit
                fallback={Globe02Icon}
              />
              <input
                class="rename"
                aria-label={m.bookmarks_rename()}
                maxlength={512}
                bind:value={draft}
                use:focusAndSelect
                onkeydown={(event) => {
                  if (event.key === "Enter") void finishRename(item, true);
                  if (event.key === "Escape") {
                    event.stopPropagation();
                    void finishRename(item, false);
                  }
                }}
                onblur={() => void finishRename(item, true)}
              />
            </span>
          {:else}
            <button
              type="button"
              class="chip"
              title={url}
              onclick={() => openHere(url)}
              oncontextmenu={(event) => openMenu(event, item)}
            >
              <FavIcon
                image={favicons.mark(item.icon, url)?.image ?? null}
                tone={favicons.mark(item.icon, url)?.tone}
                size={16}
                lit
                fallback={Globe02Icon}
              />
              <span class="label">{nameOf(item)}</span>
            </button>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</nav>

<style>
  .bookmarks-bar {
    display: flex;
    align-items: center;
    box-sizing: border-box;
    block-size: 28px;
    min-inline-size: 0;
    color: var(--color-text);
  }

  /* The row clips at its end and fades there, with no scrollbar. The fade is
     always on: when everything fits, it falls on empty room. */
  .chips {
    display: flex;
    align-items: center;
    gap: 4px;
    box-sizing: border-box;
    inline-size: 100%;
    block-size: 100%;
    min-inline-size: 0;
    margin: 0;
    padding-block: 0;
    padding-inline: 8px 24px;
    overflow: auto hidden;
    list-style: none;
    mask-image: var(--mask-fade-end);
  }

  .chips:dir(rtl) {
    mask-image: var(--mask-fade-end-rtl);
  }

  /* A mask would clip the open menu with the row. */
  .bookmarks-bar[data-open="true"] .chips {
    mask-image: none;
  }

  .slot {
    display: flex;
    flex: none;
  }

  .bookmarks-bar :global(.chip) {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    box-sizing: border-box;
    block-size: 24px;
    max-inline-size: 180px;
    padding-inline: 8px;
    border: 0;
    border-radius: var(--radius-control-compact);
    background: transparent;
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-label);
    white-space: nowrap;
    cursor: default;
    transition: background-color var(--motion-instant) var(--ease-smooth);
  }

  .bookmarks-bar :global(.chip:is(:hover, [data-state="open"])) {
    background: var(--row-hover);
  }

  .bookmarks-bar :global(.chip:active) {
    background: var(--row-pressed);
  }

  /* The row clips whatever stands outside it, ring included. */
  .bookmarks-bar :global(.chip:focus-visible) {
    outline-offset: -2px;
  }

  .bookmarks-bar :global(.chip > svg),
  .bookmarks-bar :global(.chip > [data-favicon]) {
    flex: none;
  }

  .bookmarks-bar :global(.chip > svg) {
    color: var(--color-muted);
  }

  .label,
  .menu-label {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .editing {
    padding-inline-end: 4px;
  }

  .rename {
    inline-size: 144px;
    block-size: 20px;
    padding-inline: 6px;
    border: 0;
    border-radius: var(--radius-inset);
    background: var(--color-field);
    color: var(--color-text);
    font: inherit;
    font-size: var(--text-label);
    outline: none;
    box-shadow: var(--shadow-field-focus);
  }

  .hint {
    margin: 0;
    padding-inline: 8px;
    overflow: hidden;
    color: var(--color-faint);
    font-size: var(--text-label);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  /* The menu is fixed under its chip, solid because it opens over the page. */
  .bookmarks-bar :global(.ui-disclosure-panel.bar-menu) {
    position: fixed;
    inset-block-start: var(--menu-top, auto);
    inset-inline: auto;
    left: var(--menu-left, auto);
    right: var(--menu-right, auto);
    min-inline-size: 180px;
    max-inline-size: 280px;
    max-block-size: min(60vh, 360px);
    overflow-y: auto;
    background: var(--color-float);
    backdrop-filter: none;
  }

  .bookmarks-bar :global(.bar-menu .ui-menu-item) {
    inline-size: 100%;
    border: 0;
    background: transparent;
    font: inherit;
    font-size: var(--text-body);
    text-align: start;
  }

  .bookmarks-bar :global(.bar-menu .ui-menu-item:not(:disabled):is(:hover, :focus-visible)) {
    background: var(--row-active);
  }

  .bookmarks-bar :global(.bar-menu .ui-menu-item:not(:disabled):active) {
    background: var(--row-pressed);
  }

  @media (forced-colors: active) {
    .bookmarks-bar :global(.chip:is(:hover, [data-state="open"])) {
      outline: 1px solid Highlight;
    }

    .bookmarks-bar :global(.bar-menu .ui-menu-item:not(:disabled):is(:hover, :focus-visible)) {
      background: Highlight;
      color: HighlightText;
    }

    .hint {
      color: GrayText;
    }
  }
</style>
