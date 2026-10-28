# Compatibility with Claudian

Claudian - Minimal works with Claudian's internal structure, which can change in any Claudian release. This log records each Claudian version checked against the plugin, newest first.

- **Reviewed:** Claudian's source was compared with the previous reviewed version, looking for every class and internal this plugin uses.
- **Tested:** the plugin was also checked by hand in Obsidian.

If something broke and isn't listed here, please [open an issue](https://github.com/nndrch/claudian-minimal/issues) with your Claudian version.

## Obsidian scorecard

From the [plugin page](https://community.obsidian.md/plugins/claudian-minimal), checked 2026-10-28, release 1.0.0.

- **Health: Excellent.** Missing a contributing guide.
- **Review: Satisfactory,** 7 issues:
  - `:has` selectors at styles.css lines 356, 365 and 371.
  - No GitHub artifact attestations for `main.js` and `styles.css`.
  - The release has no description.
- Build verified against source. No suspicious network patterns, vulnerable dependencies or obfuscation. Malware scan not available.

## Claudian 2.3.35 · tested 2026-10-28 · ✅ Fine

Starting point for this log. Every class and internal the plugin uses exists in Claudian 2.3.35, except these legacy selectors, kept on purpose for older Claudian versions: `claudian-baked-duration`, `claudian-logo` and `claudian-thinking-label-text`.
