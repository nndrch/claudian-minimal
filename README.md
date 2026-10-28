# Claudian - Minimal

A quieter, minimal look for [Claudian](https://github.com/YishenTu/claudian), the Obsidian plugin that brings Claude Code and other coding agents into your vault.

Claudian - Minimal is an independent companion plugin, not made by or affiliated with the Claudian author or with the Minimal theme. It needs Claudian installed and enabled; without Claudian it loads but changes nothing.

## What it changes

- **Flat, quiet chat:** your messages sit in a soft speech bubble, replies stay full width, and thinking and tool blocks get thin guide lines with muted labels and icons.
- **Tables:** shaded cells separated by thin gaps instead of borders. Wide tables scroll sideways inside the message, and long cells wrap at spaces instead of stretching the chat.
- **Wide content stays inside the chat:** long words, links and code blocks never add a horizontal scrollbar to the panel.
- **Task notifications stay open,** with their text rendered as Markdown, even inside a collapsed "Worked for…" group.
- **Ask-user prompts wrap:** long questions and options are no longer cut off.
- **Clearer tabs:** the current tab is highlighted, and tabs that are running, need you, are done or failed get a colored dot.
- **Accent everywhere:** Claudian's orange follows your theme's accent, or a color you pick, and active toggles like YOLO mode use it too.
- **Tabs named after the linked note,** instead of a number.
- **Blocks open by default** in the newest reply: tool calls, thinking, "Worked for…" groups and subagent sections. They close again when a newer reply starts, so older replies stay compact.

## Settings

| Setting | Default |
|---|---|
| Name tabs after the linked note | On |
| Open the linked note when switching tabs | Off |
| Open a Claudian tab when opening a note | Off |
| Hide the welcome brand and greeting | On |
| **Open by default** | |
| Tool calls | On |
| Thinking | On |
| "Worked for…" groups | On |
| Subagent sections | On |
| **Appearance** | |
| Accent color | Theme accent, or a custom color |
| Chat font | Interface font, note font or monospace |
| Chat text size | 14 px |
| Code text size | 13 px |
| Thinking and timing text size | 12 px |
| Line height | 1.5 |
| Space between messages | 12 px |
| Wrap long code lines | Off |
| Code background | 5% of the text color |
| Message bubble background | 5% of the text color |
| **Height limits** | |
| Tool code and output | 300 px |
| File edit diffs | 300 px |
| Thinking | 400 px |
| Subagent result | 220 px |
| Images in tool results | 320 px |

You type the sizes and limits in a box. Taller content scrolls inside its box, and a height limit of 0 removes it. The two backgrounds are a share of the text color, so they adapt to light and dark themes. Every value has a button that restores the plugin's default. All the settings show up in Obsidian's settings search.

## Compatibility

Needs Obsidian 1.13 or later. Tested with Claudian 2.3.35 on Obsidian 1.14.5. Desktop only, like Claudian.

Claudian - Minimal works with Claudian's internal structure: its CSS classes, its tab manager and its tab bar. A Claudian update can change those. When that happens, the affected part stops working and Claudian keeps working as usual. Please [open an issue](https://github.com/nndrch/claudian-minimal/issues) with your Claudian version. [COMPATIBILITY.md](COMPATIBILITY.md) lists the Claudian versions checked so far.

## Privacy

Claudian - Minimal makes no network requests and collects no telemetry. It doesn't read or change your notes. The only file it writes is its own `data.json`, which holds the settings and a little tab state.

## Installation

Install it from [Claudian - Minimal in Obsidian's plugin directory](https://obsidian.md/plugins?id=claudian-minimal). You can also open **Settings → Community plugins → Browse** in Obsidian, search for "Claudian - Minimal", then install and enable it.

To install it manually, download `main.js`, `manifest.json` and `styles.css` from the [latest release](https://github.com/nndrch/claudian-minimal/releases/latest) into `<your vault>/.obsidian/plugins/claudian-minimal/`, then enable the plugin in **Settings → Community plugins**.

## How it works

- **Styles:** `styles.css` carries the look. The Appearance settings reach it as CSS variables on `<body>` (`--cm-…`), set with Obsidian's `setCssProps`. Every variable has a fallback that matches its default.
- **Scrollable tables:** the plugin wraps each chat table in a `div.claudian-table-scroll`, which becomes the scroll container. The table keeps a real table layout, so prose columns wrap while short columns keep their width.
- **Task notifications:** Claudian renders a notification's text when its header is first clicked. The plugin clicks each new header once, without bubbling.
- **Open by default:** Claudian builds a block's content on its first click too, so the plugin clicks each closed header once, only in the newest reply of each chat. A block you close yourself stays closed, and blocks the plugin opened close again when a newer reply starts.
- **Tab names:** the plugin wraps the method Claudian uses to build the tab bar, and replaces each tab's title with the name of its linked note.
- **Open the note on tab switch:** the plugin wraps the tab manager's `switchToTab`. After you switch tabs in the chat, it shows the tab's linked note: a leaf that already shows it is brought forward, otherwise it opens in the most recent main-area leaf. Focus stays in the chat. It only reacts to switches you make with the Claudian view active.
- **Tabs follow the notes:** when you open a note or canvas, the plugin switches to the Claudian tab linked to it. With no such tab, and once the note has stayed active for 1.5 seconds, it creates a tab: with the latest conversation linked to the note if there is one, otherwise a new empty one. Notes that are already open get their tabs too, once Claudian's tabs have settled after startup. Closing a note closes its tab, except one that is working or the last one left; the conversation stays in the history. While this setting is on, an empty tab keeps the note it was linked to instead of following whichever note is active. Together with the setting above, tabs and notes mirror each other.
- **Settings:** built with Obsidian's declarative settings API, so Obsidian renders them and indexes them for its settings search. The number boxes and sliders render their own rows, to keep their restore-default buttons.

## Development

There is no build step: `main.js` and `styles.css` are the source.

```bash
./install.sh "/path/to/your/vault"
```

Then turn the plugin off and on in Obsidian to load the new files.

To test a change before it's released, work on a branch and install it with `--dev`. Settings → Community plugins then shows the version with `-dev` after it, and the repo's `manifest.json` stays as it is:

```bash
./install.sh --dev "/path/to/your/vault"
```

To test the exact release files, or to test on another machine, push a release candidate tag, for example `git tag 1.1.0-rc.1 && git push origin 1.1.0-rc.1`. The GitHub Action builds the files with that version and publishes a pre-release. A pre-release is never the "latest" release, so Obsidian's directory doesn't offer it to anyone. Install it by hand from the pre-release's assets, as in *Installation* but from that release's page. Don't bump the version on `main` for a candidate: bump it only for the real release.

To release a new version:

1. Update `version` in `manifest.json` and add the same version to `versions.json`.
2. Commit and push.
3. Push a tag with exactly that version, without a `v`. For example, `git tag 1.0.1 && git push origin 1.0.1`.
4. The GitHub Action attests `main.js`, `manifest.json` and `styles.css`, then creates a draft release with them and notes that list the merged pull requests. Edit the notes, then publish the release.

## Credits

Built for [Claudian](https://github.com/YishenTu/claudian) by Yishen Tu.

## License

[MIT](LICENSE)
