# The top bar: a horizontal chrome

Status: implementation contract for the horizontal tab layout
Last reviewed: 2026-10-28

Zephium's chrome is a column beside the page. This document specifies a second
shape the person can choose: a bar across the top of the window, in the manner
of Helium and Chromium, with the tabs in a row, the address field and the
page's controls on the same row, an optional bookmarks row under it, and the
page below. Nothing is removed. Spaces, kept sites, the tools (Notes, Tasks,
Time, History, Downloads, Bookmarks), Ask Zephium, Work, extensions, the
blocker and the profile stack all stay reachable: the column becomes the card a
hidden sidebar already is, waiting beneath the page and sliding in from the
window's left edge, and standing beside the page while a tool or Settings holds
it there.

The chosen preference is `ui.tab-layout`, which Rust already allowlists as
`vertical` | `horizontal` and the frame already defaults to `vertical`.

## 1. Native geometry

`zephium_core::layout` gains a second mode.

```rust
pub enum Mode { Sidebar, TopBar }
pub struct Metrics {
    pub sidebar_width: f64,
    pub padding: f64,
    pub gap: f64,
    pub caption: f64,
    pub sidebar_hidden: bool,
    /// The bar's height from the window's top to its foot, bookmarks row
    /// included; only read in `Mode::TopBar`. The frame measures and reports it.
    pub top_bar_height: f64,
}
```

`compute(window, Mode::TopBar, m, content_present)`:

- The chrome is always the whole window, `Rect::new(0, 0, w, h)`, in every
  shape, so a hidden column's card and a bar panel can come over the page
  without a layout. On macOS the chrome view therefore keeps
  `fill_width` semantics (`ViewWidthSizable | ViewHeightSizable`): the
  `ChromeFrame` sent from `window_layout.rs` has `fill_width: true` in this
  mode whether or not content is present.
- Without content the layout is `{ chrome: window, content: None }` as today.
- With content: the bar starts at the window's very top (the traffic lights
  sit in it), so there is no padding above it. The content rect is
  `x = if sidebar_hidden { p } else { p + sidebar_width + gap }`,
  `y = caption + top_bar_height + gap`, `width = w - x - p`,
  `height = h - y - p`, all clamped to be non-negative.
- The page keeps its side and bottom gutters (`padding`) and its rounded
  corners; only the top meets the bar across its gap. This keeps the window
  reading as Zephium rather than as a flat Chromium clone, while the bar is
  the Helium shape.

`hidden_card(window, mode, m)` takes the mode: in `TopBar` the card's top is
`top_bar_height + HIDDEN_CARD_INSET` (it slides in under the bar, never over
it) and its height is the window's remaining height less the insets. Keep the
existing `Sidebar` answer byte-identical; the existing tests must still pass.

`MIN_TOP_BAR_HEIGHT = 0.0`, `MAX_TOP_BAR_HEIGHT = 160.0`; `clamp_top_bar_height`
is the single authority (non-finite -> 0), as `clamp_sidebar_width` is.

Window state: `win.mode` already exists (`layout::Mode`); it is set per
window from the command below. `Metrics::default()` gets `top_bar_height: 0.0`.

### Commands

`zephium_app::Command` gains:

```rust
/// The chrome's shape: a bar of this height across the window's top with the
/// column beneath the page, or `None` for the column beside the page alone.
SetChromeLayout { top_bar: Option<f64> },
/// Brings the chrome over the page within `rect` while a panel of the bar
/// hangs there, or puts it back beneath. Only meaningful in `Mode::TopBar`;
/// a `Sidebar` chrome tiles with the page and ignores it.
RaiseChrome { raised: bool, rect: Rect },
```

Both coalesce in `actor/mailbox.rs` like `SetSidebarWidth` / `PeekSidebar`
(new `CoalescedKey::ChromeLayout` and `CoalescedKey::ChromeRaise`).

Shell handling (`shell/mod.rs`):

- `SetChromeLayout`: on the focused window set `win.mode` to `TopBar` with
  `win.metrics.top_bar_height = clamp_top_bar_height(h)`, or back to `Sidebar`
  with the height left as it was; a change of mode is a deliberate change of
  shape, so hint `StageMotion::Slide` and `relayout_with(true)`; a height-only
  change relayouts without travel. Leaving `TopBar` while a panel is raised
  lowers the chrome (`engine.raise_chrome(win.id, false, ..)`).
- `RaiseChrome`: in `TopBar` only, `engine.raise_chrome(win.id, raised, rect, false)`
  with the rect clamped into the window. The Windows stage treats the rect it
  is given as the exact rectangle to cut the chrome to (today
  `card_geometry::card_pixels` derives the card's height from the window; a
  panel's rect must keep its own height, so give that function a faithful
  path or a sibling that does). The chrome round the pages is never cut away:
  `sidebar_card::clip_chrome` already keeps every bare client pixel, so the bar
  itself stays in view while raised. macOS reorders the views as it does for
  the card.
- `PeekSidebar` passes `win.mode` to `hidden_card`.
- `window_layout.rs`: `fill_width: chrome_layout.content.is_none() || win.mode == layout::Mode::TopBar`.

Desktop (`desktop/src/lib.rs`), registered in `collect_commands!` directly
after `sidebar_resize_guide`, in this order, so the generated bindings match
the two entries already hand-mirrored in `frame/src/shared/ipc/bindings.ts`:

```rust
/// The chrome's shape: a top bar of this height over the page, with the
/// sidebar beneath it, or `null` for the sidebar beside the page alone.
#[tauri::command]
#[specta::specta]
fn chrome_set_layout(caller: WebviewWindow, shell: State<'_, Handle>, top_bar: Option<f64>)

/// Brings the chrome over the page within a rect while a panel of the top
/// bar hangs there, or puts it back beneath the page.
#[tauri::command]
#[specta::specta]
fn chrome_raise(caller: WebviewWindow, shell: State<'_, Handle>, raised: bool, x: f64, y: f64, width: f64, height: f64)
```

Both authorize with `CallerPolicy::Main`; `chrome_set_layout` rejects a
non-finite or out-of-range height; `chrome_raise` rejects non-finite or
negative values. After adding them run
`cargo test -p zephium-desktop export_typescript_bindings` and confirm the
regenerated `bindings.ts` differs from the hand-mirrored copy by nothing but,
at most, the doc comments' exact wording (then keep the generated text).

### Platform behaviour

A per-window "top bar" flag lives beside `HIDDEN_SIDEBARS` on each platform
(`platform::imp::chrome_top_bar(window, on)`), set from `chrome_set_layout`.

- macOS: with the top bar, the window's traffic lights stay where they are,
  in the bar's leading end; `sidebar_hidden` still starts and stops the
  left-edge watch (the card slides in from there) but never tucks the controls
  (`window_controls::set_tucked`) and `sidebar_card_lights` / `set_in_card`
  are no-ops. `window_controls_lift` is unchanged.
- Windows: `ChromeAdapter::position` already sends `page_left: None` when
  `fill_width`, which is the top-bar case; verify the caption (the window's
  own buttons, drawn by `windows_caption.rs`) stays reachable at the top-right
  with `page_left: None` as it is over a new tab today, and that the frame's
  bar leaves room for it (the shell carries `data-caption` on Windows; the bar
  reserves `--caption-reserve`, three buttons of 46px plus padding, at its
  trailing end). The edge watch (`windows_sidebar_edge.rs`) runs as for a
  hidden sidebar.
- The swipe region (`swipe_region`) is whatever the frame reports; nothing
  changes natively.

## 2. The frame

### Session state

Two session modules already exist and are the contract for every feature:

- `session/chrome-layout.svelte.ts`: `chromeLayout()`, `horizontal()`,
  `topBarHeight()`, `adoptLayout(next)`, `reportBarHeight(px)`. `BrowserApp`
  adopts `preferences.value("ui.tab-layout")` into it exactly as it adopts
  `sidebar.mode`. The bar reports its own `offsetHeight` (bookmarks row
  included) through a `ResizeObserver`; the module publishes
  `commands.chromeSetLayout(height | null)` only when something changed.
- `session/chrome-raise.svelte.ts`: `raiseFor(panelElement)` raises the chrome
  for one open panel and returns the function that lowers it; `lowerAll()`;
  `raisedPanel()`. Every panel that hangs below the bar (the address field's
  `UtilityTray`, the bar's profile/tool stack, a bookmark folder, the space
  switcher when hosted in the bar) calls `raiseFor` on open, after the panel is
  in the DOM and measured (`tick()`), and the returned function on close. In
  the vertical layout it is never called: `raiseFor` callers check
  `horizontal()` first.

`session/sidebar-mode.svelte.ts`:

- `isHidden()` becomes `(mode === "hidden" || horizontal()) && !held && !pinned`.
- A new `pinned` flag with `pinSidebar(bool)` / `sidebarPinned()`: in the
  horizontal layout the sidebar toggle (the bar's leading button and the
  `sidebar.toggleCompact` command) pins the column beside the page instead of
  changing the stored mode; it is session state, not a preference. In the
  vertical layout `toggleMode` behaves as today.
- `effectiveWidth()` is unchanged; `publish()` sends `sidebarSetHidden(isHidden())`
  as today, which is what parks the column beneath the page.

### Shell composition

`app/browser/Shell.svelte` keeps exactly one `data-zephium-active-tab`, one
`data-zephium-new-tab`, the `{:else if newTabShown}` chain, no transitions.
It gains `data-layout={horizontal ? "horizontal" : "vertical"}` on `.shell`.

Horizontal: `.shell` is a grid of two rows; the first row is
`app/browser/TopBar.svelte` spanning both columns; the second row holds the
same `<Sidebar>` and `.stage-column` that exist today, as direct children of
`.shell` so the existing `.shell:has(> .browser-sidebar[data-hidden])` rules
keep working. `.shell` loses its top padding in this layout (the bar starts at
the window's top); `.stage-column` gains `padding-block-start: 8px`, matching
native `gap`. The hidden card's `inset-block-start` is the bar's height plus
8px (`--topbar-height` set on `.shell` from `topBarHeight()`).

`TopBar.svelte` lives in `app/browser/` (the app layer composes features; it
is not itself a feature, so it may import every feature's public API). Its row,
start to end:

1. On macOS, `var(--traffic-light-inset)` of room for the lights (none in
   fullscreen, as `SidebarHeader` already does).
2. The sidebar toggle (`SidebarLeftIcon`, label `m.ui_compact_mode()`), which
   pins or unpins the column.
3. Back, forward, reload (`IconButton`, the same handlers and history menus as
   `SidebarHeader`; extract them into
   `features/sidebar/components/NavigationButtons.svelte`, export it, and use
   it from both places).
4. The address field: the one `AddressField` with a new `variant="bar"` prop
   (the component keeps its single `<input data-zephium-address>` and its
   `class:sr-only={compact}`; the bar variant is a pill of
   `clamp(200px, 26vw, 360px)` width, text aligned start, height 30px). Its
   `trailing` snippet is the same `UtilityTray` composition Shell builds for
   the column (blocker shield, extensions, site details); the tray's panel
   calls `raiseFor` while open.
5. The tab strip (`features/tabs/components/TabStrip.svelte`, see below),
   `flex: 1; min-width: 0`.
6. New tab (`Add01Icon`, `tabs.open`).
7. Extension action icons (`features/extensions` exports `ExtensionActions`;
   popups are native and anchored to the button, nothing to raise).
8. Downloads pulse (`DownloadPulse`) when the profile has one.
9. The profile / tools stack: `ToolShelf compact` from `features/dock` (the
   avatar opening the stack of tools, profiles and Settings); its panel calls
   `raiseFor`.
10. The bar's menu (`EllipsisIcon`): `commands.sidebarMenuPopup(...)` exactly
    as `SidebarHeader.openSidebarMenu` builds it (native menu, nothing to raise).
11. On Windows, `--caption-reserve` of empty room for the window's buttons.

The whole bar is `data-tauri-drag-region`; its buttons and the strip are not.
Under the row, when `preferences.value("ui.bookmarks-bar") === "true"`, the
bookmarks row (`features/bookmarks` `BookmarksBar`, lazy). The bar measures
itself (`bind:offsetHeight` or a `ResizeObserver`) and calls `reportBarHeight`.

In Work (`browserPage.currentPage() === "work"`) the bar stays; the strip
still lists the tabs and choosing one opens it over the canvas through
`requestTab`, as the rail does; the address field shows nothing and the page
controls are disabled, as `SidebarHeader` passes `pageControls={!inWork}`.

### The strip

`features/tabs/components/TabStrip.svelte` renders, in one `<ul>`:

- Kept sites (`favorites`) first, icon-only, 32px wide, never closable
  (`EssentialTile` semantics: a sleeping kept site opens its page);
- pinned tabs, icon-only, not closable;
- today's tabs in sidebar order (folders flattened, split groups as their
  members one after the other with a shared enclosure as `SplitGroupRow`
  draws), with title, favicon, loading mark, audio and capture controls, and a
  close button on hover and on the current tab.

Each row is `features/tabs/components/StripTab.svelte`, which owns exactly one
`data-zephium-tab-id={tab.id}`, one `data-zephium-tab-url={tab.url ?? ""}`,
one `data-zephium-projection-revision={tab.projection_revision}` and one
`<span data-zephium-tab-label ...>{tab.title}</span>` whose sole child is
`{tab.title}` (icon-only rows keep the label span, visually hidden with
`sr-only`, never unmounted). Rows render in an id-keyed `{#each}`. The context
menu is native: `event.preventDefault(); tabs.openTabMenu(tab.id, event.clientX, event.clientY)`.
Middle click closes (`closeOnMiddleClick`). Drag to reorder uses `RowDrag`
from `$session/row-drag.svelte` with a horizontal placement: `placeBefore` in
that module decides "after the middle" by `y` except over `[data-essentials-drop]`;
give the strip's list `data-strip-drop` and extend `placeBefore` to read `x`
there too (one small, tested change). Dropping on a kept-sites region keeps the
tab, as the column's lists do; dropping outside the strip calls `tabs.dropTab`.
Tabs are `min-width: 56px; max-width: 220px; flex: 1 1 160px`, 30px tall, the
pill shape (`--radius-row` capped at 8px), `--row-hover` / `--row-active`
fills, the current tab with `--row-rim`. Overflow scrolls sideways on the
wheel with no visible scrollbar; the current tab is scrolled into view when it
changes. The strip reuses `tab-icon`, `middle-click`, `ListMotion` and the
motion keys the column uses.

**Sentinel uniqueness.** Native verifies the current tab through
`[data-zephium-tab-id]` rows and must never meet two rows for one tab. In the
horizontal layout the strip is the only tab list: the column's
`browserBody` renders no `SidebarBody`, no `TabRail`, no `EssentialsRail` and
no kept-sites `TabList`; the column keeps `ModeTabs`, the `SpaceBar` (or
`RailSpaces` at rail width), `SidebarPagePermission`, `HidingBar`, the notices,
the download status, the update notice, the private return, the player and
the `Dock` without its `sites` snippet. Shell switches on `horizontal` inside
its existing `browserBody` and `dock` snippets. The one `AddressField` is the
bar's; the column mounts none. Keep Rust's source-contract tests true:
`TabRow`, `TabRail`, `EssentialsRail`, `AddressField` keep their exact sentinel
bindings, and `StripTab` gets the same test in `desktop/src/lib.rs` with a new
`frame_sources.rs` anchor (`SRC_FEATURES_TABS_STRIPTAB_SVELTE`).

### The column as a card

`features/sidebar/components/Sidebar.svelte` already implements the hidden
card: `away`, `peek`, the edge event, the frost, the Windows cut. In the
horizontal layout:

- the card's `inset-block-start` is `calc(var(--topbar-height) + 8px)`;
- the header shows no page controls and no sidebar toggle in the horizontal
  layout (`SidebarHeader` gets `bar={true}`: the lights' room goes, the mode
  tabs stay);
- the resize handle still works while the column is pinned or held;
- `holdShown` from a tool, Settings, Tasks/Notes and Work keeps working: the
  column stands beside the page, native tiles the content to the right of it
  and below the bar.

### Settings and the new tab

- Appearance gets a "Layout" group before "Window": a `Select` for
  `ui.tab-layout` (`vertical`: "Tabs in a sidebar", `horizontal`: "Tabs across
  the top") and a `Switch` for `ui.bookmarks-bar` ("Bookmarks bar", "A row of
  your bookmarks under the tabs."), the latter offered only when the layout is
  horizontal. Catalog entries `appearance.layout` and `appearance.bookmarks-bar`
  so Settings search finds them.
- `ui.bookmarks-bar` is a new preference: Rust `KEYS` + `value_allowed`
  (`true` | `false`), frame default `"false"`, included in the diagnostic
  report's appearance keys if that list enumerates `ui.*` keys.
- `ui.newtab-background` admits a third value, `plain`: a flat page in
  `--color-page` with the search field centred on it and nothing else: no sky,
  no sky light (`skyShown` is false for `plain`), no wordmark, greeting,
  clock, figures or notch; the content toggles are disabled in the New Tab
  settings while `plain` is chosen. `NewTab.svelte` branches on it early, with
  the field in a 560px-wide centred box at 38% height. The New Tab settings
  `Select` gains the option ("Plain").
- The horizontal layout does not change the default new tab; a person who
  wants the Helium page chooses `plain`.

### Bookmarks bar

`features/bookmarks/components/BookmarksBar.svelte` (exported as
`loadBookmarksBar` from the feature's index): the root folder of the profile's
bookmarks as a 28px row of chips (favicon from `favicons`, title), folders as
`Disclosure` menus listing their children one level deep, each panel raised
through `raiseFor` while open; a chip opens its link in the current tab
(`tabs.navigateActive(url)` if it exists, else `commands.tabsNavigate(tabs.activeId(), url)`),
with modifier semantics left to the native context menu
(`commands.bookmarkMenuPopup`). It reads through `BookmarksSession` and
refreshes on `events.resourceChanged` for `kind === "bookmark"` (check the
kind's name in bindings). Empty: a single faint hint.

## 3. Verification

- `pnpm -C frame check`, `pnpm -C frame build`, `cargo xtask check-frame-styles`.
- Component tests: a `TopBarLook.component.test.ts` rendering `Shell` with
  `ui.tab-layout = horizontal` and a dozen tabs (kept, pinned, open), checking
  one sentinel row per tab across the whole document, one address input, the
  bar's height reported, and the column hidden; a `TabStrip` interaction test
  for select, close, middle click, overflow scroll and reorder; a plain new
  tab look test.
- Rust: `cargo test -p zephium-core` (layout), `cargo test -p zephium-app`
  (shell commands), `cargo test -p zephium-desktop` (contracts, bindings),
  `cargo fmt --all --check`, `cargo clippy --workspace --all-targets --locked -- -D warnings`;
  and `cargo check --target aarch64-apple-darwin` /
  `--target x86_64-pc-windows-msvc` for `zephium-desktop` so both platform
  adapters type-check from Linux.
- Native visual, pointer and resource qualification on macOS and Windows is
  not possible from this environment and is listed as remaining work.

## 4. The flat look

A second axis, independent of the layout: `ui.look` is `soft` (the default,
everything above) or `flat`. Flat is the Helium shape: no glass, no gutters,
no rims or drops, small radii, one dark or light ground. It is a token axis
(`frame/src/styles/axes/look.css`, keyed by `data-look="flat"` on the root,
applied by `theme.applyLayout` beside density and contrast) plus one native
fact, so no component carries a preference conditional.

- **Native (`chrome_set_flush(flush: bool)` → `Command::SetChromeFlush`)**: with
  `flush` the window's metrics have `padding = 0` and `gap = 0`, so the page
  meets the column, the bar and the window's edges, and the page view's corner
  radius is 0 on both platforms (macOS layer radius, Windows region radius);
  without it the metrics and radius are what they were. A change relayouts as a
  journey (`relayout_with(true)`). `hidden_card` keeps `HIDDEN_CARD_INSET`: the
  card still floats. The frame publishes it from `session/chrome-layout.svelte.ts`
  whenever `ui.look` is adopted.
- **Tokens under `data-look="flat"`**: radii collapse to a boxy scale
  (`--radius-inset` 4, `--radius-row` 6, `--radius-tab` 5,
  `--radius-control-compact` 5, `--radius-control` 6, `--radius-control-large`
  8, `--radius-card` 8, `--radius-panel` 8, `--radius-field` 5,
  `--content-radius` 0, `--content-radius-windows` 0; `--radius-capsule` stays
  for a genuine disc such as an avatar or a switch thumb); every `--shadow-*`
  that lifts or floats becomes a hairline (`0 0 0 1px var(--color-border)` for
  raised, `0 0 0 1px var(--color-border-strong)` for float, popover, menu and
  overlay) or `none` (control, control-strong, raise, tile, card, field);
  `--row-rim`, `--lift-rim` and the segment thumbs are hairlines or nothing;
  the window is opaque in the chrome colour whatever native material is
  installed (`body { background: var(--color-chrome) }`); the sky light and the
  card's frost are off, the card is a bordered panel; the gutter paddings in
  Shell, the stage, the internal stage and the new-tab main are 0; the top bar
  sits on a hairline rule; tabs, the address pill and the bookmark chips are
  boxes with 5px corners and flat fills.
- **Settings**: a "Look" row at the top of the Layout group, a
  `SegmentedControl` with "Soft" and "Flat" and the description "Flat has no
  glass, gutters or shadows, and square corners." Choosing Flat also writes
  `ui.material = none`, since the glass would only be covered; choosing Soft
  leaves the material as it is.
- **Theme**: a `mono` preset, "Mono", joins the presets: dark
  `seeds(0x121214, 0xe9e9ec, 0xbfbfc4)`, light `seeds(0xf4f4f5, 0x1c1c1e, 0x3a3a3f)`,
  so the flat look can be plain black-grey without the custom editor. Nothing
  selects it automatically.
- **Plain new tab under flat**: the search field is a box with a hairline
  border on the page colour, nothing else on the page.
