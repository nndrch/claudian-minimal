# Compatibility with Claudian

Claudian - Minimal works with Claudian's internal structure, which can change in any Claudian release. This log records each Claudian version checked against the plugin, newest first.

- **Reviewed:** Claudian's source was compared with the previous reviewed version, looking for every class and internal this plugin uses.
- **Tested:** the plugin was also checked by hand in Obsidian.

If something broke and isn't listed here, please [open an issue](https://github.com/nndrch/claudian-minimal/issues) with your Claudian version.

## Obsidian scorecard

From the [plugin page](https://community.obsidian.md/plugins/claudian-minimal), checked 2026-11-02, release 1.0.1.

- **Health: Excellent.** Missing a contributing guide.
- **Review: Passed,** no issues. Resolved since 2026-10-28: the `:has` selectors, the missing attestations and the missing release description.
- Build verified against source. The release assets have verified GitHub artifact attestations. No suspicious network patterns, vulnerable dependencies or obfuscation. Malware scan not available.

## Claudian 2.3.39–2.3.42 · tested 2026-11-11 · ⚠️ Fixed

Reviewed against 1.2.0 ([PR #11](https://github.com/nndrch/claudian-minimal/pull/11)). Every class and internal still exists with the same shape, and *Open in Claudian*, the tab order and the turned-off tab moves were checked in a running Claudian 2.3.42.

- **Fine:** the tab manager, tab bar and `linkedContent` internals are unchanged; 2.3.42 moved `linkedContent`'s mode into a state object, but `getSnapshot().mode`, `selectExplicit` and the two active-file handlers keep their behavior. `plugin.activateView(leaf)` gained an optional second argument.
- **Fine:** Claudian's own *Add to Claudian* still covers files only, so folders get one item.
- **Fixed:** 2.3.42 lets you reorder tabs by dragging them or from the tab menu ([#2205](https://github.com/YishenTu/claudian/pull/2205)). The plugin orders the tab bar itself (notes in Obsidian's order, folders first), which would undo a move on the next redraw. While it orders the tabs, dragging and *Move left* / *Move right* are turned off (a capture `pointerdown` listener, a wrapped `tabBar.callbacks.onTabMove`, and the menu items removed by their icons).
- **New internals for Open in Claudian:** `tabManager.createTab`, `tabManager.switchToTab`, `linkedContent.selectExplicit`, `plugin.activateView(leaf)`, and Obsidian's internal `revealInFolder` and `fileItems` on the file explorer view and `viewRegistry.isExtensionRegistered`. Checked in running Claudian 2.3.38 and 2.3.42.

## Claudian 2.3.36–2.3.38 · reviewed 2026-11-02 · 🆕 New UI

Reviewed against `main` after [PR #8](https://github.com/nndrch/claudian-minimal/pull/8), which added the tab sync, *Close other tabs* and compact-from-the-gauge features and the Claudian internals they use. Every class and internal still exists with the same shape; the internals were also checked in a running Claudian 2.3.38.

- **Fine:** `tab.state.isStreaming`, `inputController.sendMessage` and `/compact` parsing ([compactCommand.ts](https://github.com/YishenTu/claudian/blob/2.3.38/src/core/commands/compactCommand.ts)) are unchanged. 2.3.38 hides Claude's built-in commands in the slash menu, but the plugin sends `/compact` without the menu.
- **Fine:** 2.3.38 rebuilds the composer when a chat moves to a pop-out window; the plugin reads `tab.dom.inputEl` fresh on each use.
- **New UI:** slash-command match highlight (`.claudian-composer-dropdown-match`, [composer-dropdown.css](https://github.com/YishenTu/claudian/blob/2.3.38/src/style/components/composer-dropdown.css)) uses `--text-accent`, so it ignores a custom accent color. Now styled in [styles.css](styles.css) to follow the accent setting.
- **New UI:** active item in the wide-layout session sidebar (`.claudian-session-sidebar .claudian-history-item.active`) now follows the theme's navigation background. Matches Obsidian; nothing to change.

## Claudian 2.3.35 · tested 2026-10-28 · ✅ Fine

Starting point for this log. Every class and internal the plugin uses exists in Claudian 2.3.35, except these legacy selectors, kept on purpose for older Claudian versions: `claudian-baked-duration`, `claudian-logo` and `claudian-thinking-label-text`.
