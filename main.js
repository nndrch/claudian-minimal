/* Claudian - Minimal — a quieter, minimal look for Claudian (plugin id: realclaudian).
   Source: https://github.com/nndrch/claudian-minimal

   styles.css carries the look, and most of it is always on.
   Settings → Claudian - Minimal has:
   - Toggles: tab names, opening the linked note when you switch tabs,
     opening a Claudian tab when you open a note, hiding the welcome brand and greeting, wrapping long code lines, and
     the chat font. CSS switches are classes on
     <body> (cm-…).
   - Open by default: tool calls, thinking, "Worked for…" groups and
     subagent sections open by themselves in the newest reply of each chat.
   - Values: accent color, text sizes, line height, message spacing,
     background strengths and height limits. They're set as CSS variables
     on <body> (--cm-…), which styles.css reads. Its fallbacks match the
     defaults below.

   Behaviour:
   - Tab names: a tab shows its linked note's name instead of a number.
     A manual rename ("Rename tab…") wins while the tab keeps that
     conversation; a new conversation in the tab resets it.
   - Open the note on tab switch (off by default): when you switch Claudian
     tabs, the tab's linked note is shown in the main area. A leaf that
     already shows the note is brought forward; otherwise the note opens in
     the most recent main-area leaf. Focus stays in the chat.
   - Tab for the opened note (off by default): when you open a note or
     canvas in Obsidian, Claudian switches to the tab linked to it. If no
     tab is, and the note stays active for a moment, the latest
     conversation linked to it is reopened, or a new tab linked to it is
     created. Notes that are already open get their tabs once Claudian's
     tabs have settled. Closing a note in Obsidian closes its tab (a tab
     that is working, or the last one, stays; the conversation stays in the
     history).
   - Task notifications: each one is opened once when it appears, so its
     text renders as Markdown (Claudian 2.3.33 only renders it on the
     first click). styles.css keeps it expanded.
   - Open by default: Claudian builds a block's content on its first
     click, so the plugin clicks each header once, without bubbling. A
     block it opened closes again when a newer reply starts in that chat.
   - Scrollable tables: wraps each chat table in div.claudian-table-scroll,
     the scroll container that styles.css sets up.

   Uses Claudian internals (tab manager, tab bar, CSS classes). Every hook
   is guarded: if an update changes them, the affected part stops and
   Claudian keeps working. */
'use strict';

// eslint-disable-next-line @typescript-eslint/no-require-imports -- Obsidian loads main.js as CommonJS, and this plugin has no build step.
const obsidian = require('obsidian');
const { PluginSettingTab, TFile } = obsidian;

const VIEW_TYPE = 'claudian-view';
const TABLE_WRAP = 'claudian-table-scroll';
const TABLE_SEL = '.claudian-message-content table';
const NOTIF_SEL = '.claudian-task-notification > .claudian-work-header[aria-expanded="false"]';
const NOTIF_CLASS = 'claudian-task-notification';
const WORK_HISTORY_CLASS = 'claudian-work-history';
// Markers that stand in for CSS has() selectors (see markNotification).
const RAW_TEXT = 'cm-raw-text';
const NOTIF_PATH = 'cm-notification-path';
const HOLDS_NOTIF = 'cm-holds-notification';
const ASSISTANT_CLASS = 'claudian-message-assistant';
const POLL_MS = 1500;
const FOLLOW_DELAY_MS = 1500; // how long a note stays active before it gets a new tab
const FOLLOW_EXTENSIONS = new Set(['md', 'canvas']);
const FOLLOW_VIEW_TYPES = new Set(['markdown', 'canvas']);
const STARTUP_GRACE_MS = 4000; // before closing or catching up tabs after the plugin loads
const TABS_SETTLED_MS = 3000; // the tab count must stay unchanged this long before catching up
const PRUNE_GRACE_MS = 60000;
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

const DEFAULTS = {
  tabNames: true,
  openNoteOnTabSwitch: false,
  tabsFollowNotes: false,
  hideWelcome: true,
  openToolCalls: true,
  openThinking: true,
  openWorkGroups: true,
  openSubagents: true,
  accentMode: 'theme', // 'theme' | 'custom'
  accentColor: '#d97757', // used when accentMode is 'custom'; starts at Claudian's orange
  chatFont: 'interface', // a key of FONTS
  chatFontSize: 14, // px
  codeFontSize: 13, // px
  thinkingFontSize: 12, // px
  lineHeight: 1.5,
  messageGap: 12, // px
  wrapCode: false,
  codeBackground: 5, // % of the text color
  bubbleBackground: 5, // % of the text color
  maxToolOutput: 300, // px, 0 = no limit (Claudian's own limits)
  maxEditDiff: 300,
  maxThinking: 400,
  maxSubagentResult: 220,
  maxToolImage: 320,
};

// Blocks that can open by themselves. sel matches a closed header.
const OPEN_TYPES = [
  {
    key: 'openToolCalls',
    name: 'Tool calls',
    desc: 'Commands, file reads and searches, with their output.',
    sel: '.claudian-tool-call > .claudian-tool-header[aria-expanded="false"]',
  },
  {
    key: 'openThinking',
    name: 'Thinking',
    desc: 'The thinking text, while it streams and after.',
    sel: '.claudian-thinking-block > .claudian-thinking-header[aria-expanded="false"]',
  },
  {
    key: 'openWorkGroups',
    name: '"Worked for…" groups',
    desc: 'The steps of a finished reply, which Claudian folds away when the reply ends.',
    sel: '.claudian-work > .claudian-work-header[aria-expanded="false"]',
  },
  {
    key: 'openSubagents',
    name: 'Subagent sections',
    desc: "A subagent's prompt, tool list and result.",
    sel: '.claudian-subagent-list > .claudian-subagent-header[aria-expanded="false"], .claudian-subagent-section > .claudian-subagent-section-header[aria-expanded="false"]',
  },
];

const SWEEP_SEL = [TABLE_SEL, NOTIF_SEL, `.${NOTIF_CLASS}`, ...OPEN_TYPES.map((t) => t.sel)].join(', ');

const FONTS = {
  interface: { label: 'Interface font', value: '' },
  text: { label: 'Note font', value: 'var(--font-text)' },
  monospace: { label: 'Monospace font', value: 'var(--font-monospace)' },
};

// Number boxes. group: where they appear in the settings.
const NUMBERS = [
  {
    key: 'chatFontSize',
    group: 'appearance',
    name: 'Chat text size',
    desc: 'The messages and the rest of the chat panel.',
    min: 8,
    max: 32,
    decimals: 1,
    unit: 'px',
  },
  {
    key: 'codeFontSize',
    group: 'appearance',
    name: 'Code text size',
    desc: 'Inline code and code blocks.',
    min: 8,
    max: 32,
    decimals: 1,
    unit: 'px',
  },
  {
    key: 'thinkingFontSize',
    group: 'appearance',
    name: 'Thinking and timing text size',
    desc: 'The monospace thinking status and response timing.',
    min: 8,
    max: 32,
    decimals: 1,
    unit: 'px',
  },
  {
    key: 'lineHeight',
    group: 'appearance',
    name: 'Line height',
    desc: 'Space between the lines of a message, as a multiple of the text size.',
    min: 1,
    max: 3,
    decimals: 2,
    unit: '',
  },
  {
    key: 'messageGap',
    group: 'appearance',
    name: 'Space between messages',
    desc: 'The gap between one message and the next.',
    min: 0,
    max: 64,
    decimals: 0,
    unit: 'px',
  },
  {
    key: 'maxToolOutput',
    group: 'heights',
    name: 'Tool code and output',
    desc: 'The command or script of an open tool call, and its output.',
    min: 0,
    max: 5000,
    decimals: 0,
    unit: 'px',
  },
  {
    key: 'maxEditDiff',
    group: 'heights',
    name: 'File edit diffs',
    desc: 'The changes shown for a file write or edit.',
    min: 0,
    max: 5000,
    decimals: 0,
    unit: 'px',
  },
  {
    key: 'maxThinking',
    group: 'heights',
    name: 'Thinking',
    desc: 'The thinking text.',
    min: 0,
    max: 5000,
    decimals: 0,
    unit: 'px',
  },
  {
    key: 'maxSubagentResult',
    group: 'heights',
    name: 'Subagent result',
    desc: "A subagent's final answer.",
    min: 0,
    max: 5000,
    decimals: 0,
    unit: 'px',
  },
  {
    key: 'maxToolImage',
    group: 'heights',
    name: 'Images in tool results',
    desc: 'Screenshots and other images a tool returns.',
    min: 0,
    max: 5000,
    decimals: 0,
    unit: 'px',
  },
];

const SLIDERS = [
  {
    key: 'codeBackground',
    name: 'Code background',
    desc: 'Shade behind inline code and code blocks, as a share of the text color.',
    min: 0,
    max: 20,
    unit: '%',
  },
  {
    key: 'bubbleBackground',
    name: 'Message bubble background',
    desc: 'Shade behind your messages, as a share of the text color.',
    min: 0,
    max: 20,
    unit: '%',
  },
];

const hexToRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
};

const cssVars = (s) => {
  const custom = s.accentMode === 'custom' && HEX_COLOR.test(s.accentColor);
  const px = (v) => `${v}px`;
  const limit = (v) => (v > 0 ? `${v}px` : 'none');
  return {
    '--cm-chat-font-size': px(s.chatFontSize),
    '--cm-code-font-size': px(s.codeFontSize),
    '--cm-thinking-font-size': px(s.thinkingFontSize),
    '--cm-line-height': String(s.lineHeight),
    '--cm-message-gap': px(s.messageGap),
    '--cm-chat-font-family': (FONTS[s.chatFont] || FONTS.interface).value,
    '--cm-code-bg': `${s.codeBackground}%`,
    '--cm-bubble-bg': `${s.bubbleBackground}%`,
    '--cm-max-tool-output': limit(s.maxToolOutput),
    '--cm-max-edit-diff': limit(s.maxEditDiff),
    '--cm-max-thinking': limit(s.maxThinking),
    '--cm-max-subagent-result': limit(s.maxSubagentResult),
    '--cm-max-tool-image': limit(s.maxToolImage),
    // Empty removes the variable, so styles.css falls back to the theme accent.
    '--cm-accent': custom ? s.accentColor : '',
    '--cm-accent-rgb': custom ? hexToRgb(s.accentColor) : '',
  };
};

const bodyClasses = (s) => {
  return {
    'cm-hide-welcome': s.hideWelcome,
    'cm-chat-font': s.chatFont !== 'interface',
    'cm-wrap-code': s.wrapCode,
  };
};

const CSS_VARS = Object.keys(cssVars(DEFAULTS));
const BODY_CLASSES = Object.keys(bodyClasses(DEFAULTS));

// A number typed in a box, within the box's range and rounded to its
// decimals. Returns null for anything else, so the box keeps its last
// good value.
const parseNumber = (def, value) => {
  const text = String(value).replace(',', '.').trim();
  if (text === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < def.min || n > def.max) return null;
  const f = 10 ** def.decimals;
  return Math.round(n * f) / f;
};

const formatNumber = (def, v) => {
  return def.unit ? `${v} ${def.unit}` : String(v);
};

// Keeps only known settings with the right type, and clamps numbers.
const sanitize = (raw) => {
  const out = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const key of Object.keys(DEFAULTS)) {
    const v = raw[key];
    const def = DEFAULTS[key];
    if (typeof def === 'boolean') {
      if (typeof v === 'boolean') out[key] = v;
    } else if (typeof def === 'number') {
      if (typeof v !== 'number' || !Number.isFinite(v)) continue;
      const box = NUMBERS.find((x) => x.key === key);
      const slider = SLIDERS.find((x) => x.key === key);
      if (box) out[key] = parseNumber(box, Math.min(box.max, Math.max(box.min, v)));
      else if (slider) out[key] = Math.min(slider.max, Math.max(slider.min, Math.round(v)));
    } else if (key === 'accentMode') {
      if (v === 'theme' || v === 'custom') out[key] = v;
    } else if (key === 'accentColor') {
      if (typeof v === 'string' && HEX_COLOR.test(v)) out[key] = v.toLowerCase();
    } else if (key === 'chatFont') {
      if (typeof v === 'string' && FONTS[v]) out[key] = v;
    }
  }
  return out;
};

class ClaudianMinimalSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  // Declarative settings (Obsidian 1.13+): Obsidian renders them and indexes
  // them for its settings search. Values go through getControlValue and
  // setControlValue, which use the plugin's own storage. Number boxes and
  // sliders render their own row, to keep their restore-default buttons.
  getSettingDefinitions() {
    const p = this.plugin;
    const toggle = (key, name, desc) => ({ name, desc, control: { type: 'toggle', key } });
    const fontOptions = {};
    for (const [key, font] of Object.entries(FONTS)) fontOptions[key] = font.label;
    return [
      toggle(
        'tabNames',
        'Name tabs after the linked note',
        "Show the linked note's name on each chat tab instead of a number. A manual rename wins until the tab starts a new conversation."
      ),
      toggle(
        'openNoteOnTabSwitch',
        'Open the linked note when switching tabs',
        "When you switch to another chat tab, show that tab's linked note in the main area. A tab that already shows the note is brought forward instead of opening it twice. Tabs without a linked note change nothing."
      ),
      toggle(
        'tabsFollowNotes',
        'Open a Claudian tab when opening a note',
        "Keeps Claudian's tabs and your open notes in step. Opening a note or canvas switches to its tab; with none, and once the note stays open for a moment, its latest conversation reopens or a new tab starts. Notes already open get tabs too. Closing a note closes its tab (never one that is working, or the last one). Conversations stay in the history."
      ),
      toggle('hideWelcome', 'Hide the welcome brand and greeting', 'Hide the Claudian name and the greeting on the empty chat screen.'),
      {
        type: 'group',
        heading: 'Open by default',
        items: [
          {
            name: 'Only in the newest reply',
            desc: 'These blocks open by themselves in the newest reply of each chat and close again when a newer reply starts. A block you close yourself stays closed.',
          },
          ...OPEN_TYPES.map((t) => toggle(t.key, t.name, t.desc)),
        ],
      },
      {
        type: 'group',
        heading: 'Appearance',
        items: [
          {
            name: 'Accent color',
            desc: 'Used for buttons, highlights, active toggles and the current tab.',
            control: { type: 'dropdown', key: 'accentMode', options: { theme: 'Theme accent', custom: 'Custom color' } },
          },
          {
            name: 'Custom accent color',
            desc: 'The color to use instead of the theme accent.',
            visible: () => p.settings.accentMode === 'custom',
            control: { type: 'color', key: 'accentColor' },
          },
          {
            name: 'Chat font',
            desc: 'Font for the messages. Code stays monospace.',
            control: { type: 'dropdown', key: 'chatFont', options: fontOptions },
          },
          ...NUMBERS.filter((x) => x.group === 'appearance').map((def) => this.numberRow(def)),
          toggle('wrapCode', 'Wrap long code lines', 'Long lines in code blocks wrap instead of scrolling sideways.'),
          ...SLIDERS.map((def) => this.sliderRow(def)),
        ],
      },
      {
        type: 'group',
        heading: 'Height limits',
        items: [
          { name: 'How the limits work', desc: 'Taller content scrolls inside its box. A limit of 0 removes it.' },
          ...NUMBERS.filter((x) => x.group === 'heights').map((def) => this.numberRow(def)),
        ],
      },
    ];
  }

  getControlValue(key) {
    return this.plugin.settings[key];
  }

  async setControlValue(key, value) {
    if (key === 'accentColor') {
      if (!HEX_COLOR.test(String(value))) return;
      value = String(value).toLowerCase();
    }
    await this.plugin.update({ [key]: value });
    // The custom color row only shows for a custom accent.
    if (key === 'accentMode') this.refreshDomState();
  }

  // A number box with its unit, and a button that restores the plugin default.
  numberRow(def) {
    const p = this.plugin;
    return {
      name: def.name,
      desc: `${def.desc} Default ${formatNumber(def, DEFAULTS[def.key])}.`,
      render: (setting) => {
        let box = null;
        setting.addText((t) => {
          box = t;
          t.inputEl.type = 'number';
          t.inputEl.min = String(def.min);
          t.inputEl.max = String(def.max);
          t.inputEl.step = 'any';
          t.inputEl.addClass('cm-number-input');
          t.setValue(String(p.settings[def.key]));
          t.onChange((value) => {
            const n = parseNumber(def, value);
            if (n !== null) p.update({ [def.key]: n });
          });
          // Leaving the box with an empty or out-of-range value shows the value in use again.
          t.inputEl.addEventListener('blur', () => t.setValue(String(p.settings[def.key])));
        });
        if (def.unit) setting.controlEl.createSpan({ text: def.unit, cls: 'cm-number-unit' });
        setting.addExtraButton((b) =>
          b
            .setIcon('rotate-ccw')
            .setTooltip('Restore default')
            .onClick(async () => {
              await p.update({ [def.key]: DEFAULTS[def.key] });
              if (box) box.setValue(String(DEFAULTS[def.key]));
            })
        );
      },
    };
  }

  // A slider, with a button that restores the plugin default.
  sliderRow(def) {
    const p = this.plugin;
    return {
      name: def.name,
      desc: `${def.desc} Default ${DEFAULTS[def.key]}${def.unit}.`,
      render: (setting) => {
        let slider = null;
        setting.addSlider((s) => {
          slider = s;
          s.setLimits(def.min, def.max, 1)
            .setValue(p.settings[def.key])
            .setDynamicTooltip()
            .onChange((v) => p.update({ [def.key]: v }));
        });
        setting.addExtraButton((b) =>
          b
            .setIcon('rotate-ccw')
            .setTooltip('Restore default')
            .onClick(async () => {
              await p.update({ [def.key]: DEFAULTS[def.key] });
              if (slider) slider.setValue(DEFAULTS[def.key]);
            })
        );
      },
    };
  }
}

module.exports = class ClaudianMinimalPlugin extends obsidian.Plugin {
  async onload() {
    const saved = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULTS, sanitize(saved.settings));
    this.autoExpanded = new Set(Array.isArray(saved.autoExpandedTabs) ? saved.autoExpandedTabs : []);
    this.labelOwners = saved.labelOwners && typeof saved.labelOwners === 'object' ? saved.labelOwners : {};
    this.hookedManagers = new Set();
    this.switchManagers = new Set(); // tab managers whose switchToTab is wrapped
    this.revealSeq = 0;
    this.syncing = 0; // > 0 while the plugin itself switches or creates a tab
    this.prevOpen = null; // note paths open in Obsidian at the last check
    this.caughtUp = false; // notes already open have been given tabs
    this.lastTabCount = 0;
    this.tabCountSince = Date.now();
    this.syncBusy = false;
    this.creating = new Set(); // note paths that are getting a tab right now
    this.lcPatch = null; // the linked-content prototype while it no longer follows the active note
    this.signatures = new WeakMap();
    this.openedButtons = new WeakSet(); // task notification headers already clicked
    this.openedBlocks = new WeakSet(); // block headers already opened once
    this.autoOpened = new Map(); // header → OPEN_TYPES key, for blocks the plugin opened
    this.warned = new Set();
    this.loadedAt = Date.now();

    this.addSettingTab(new ClaudianMinimalSettingTab(this.app, this));
    this.applyStyles();
    this.registerEvent(this.app.workspace.on('window-open', (win) => this.applyStyles(win.doc)));

    this.observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        // A notification body stops being raw text once its Markdown renders.
        const t = m.target;
        if (t.classList && t.classList.contains(RAW_TEXT) && t.firstElementChild) t.classList.remove(RAW_TEXT);
        for (const node of m.addedNodes) this.sweep(node);
      }
    });
    this.observer.observe(document.body, { childList: true, subtree: true });
    this.sweep(document.body);

    this.app.workspace.onLayoutReady(() => this.tick());
    this.registerEvent(this.app.workspace.on('layout-change', () => this.tick()));
    this.registerEvent(
      this.app.workspace.on('file-open', (file) => {
        this.tickSoon(250);
        this.noteOpened(file);
      })
    );
    this.registerEvent(this.app.vault.on('rename', () => this.tickSoon(800)));
    this.registerInterval(window.setInterval(() => this.tick(), POLL_MS));
  }

  onunload() {
    if (this.observer) this.observer.disconnect();
    window.clearTimeout(this.tickTimer);
    window.clearTimeout(this.followTimer);
    if (this.saveTimer) {
      window.clearTimeout(this.saveTimer);
      this.flush();
    }
    this.unhookAll();
    this.unhookSwitch();
    this.unfreezeAll();
    const clear = {};
    for (const name of CSS_VARS) clear[name] = '';
    for (const doc of this.documents()) {
      for (const el of doc.querySelectorAll(`.${RAW_TEXT}, .${NOTIF_PATH}`)) {
        el.classList.remove(RAW_TEXT, NOTIF_PATH, HOLDS_NOTIF);
      }
      for (const cls of BODY_CLASSES) doc.body.classList.remove(cls);
      this.setVars(doc.body, clear);
    }
    this.autoOpened.clear();
  }

  // ── Settings and styles ───────────────────────────────────────

  async update(patch) {
    const before = Object.assign({}, this.settings);
    Object.assign(this.settings, patch);
    this.applyStyles();
    if ('tabNames' in patch && before.tabNames !== this.settings.tabNames) {
      if (this.settings.tabNames) this.tick();
      else this.unhookAll();
    }
    if ('openNoteOnTabSwitch' in patch && before.openNoteOnTabSwitch !== this.settings.openNoteOnTabSwitch) {
      if (this.settings.openNoteOnTabSwitch) this.tick();
      else this.unhookSwitch();
    }
    if ('tabsFollowNotes' in patch && before.tabsFollowNotes !== this.settings.tabsFollowNotes) {
      if (this.settings.tabsFollowNotes) {
        this.prevOpen = null;
        this.caughtUp = false;
        this.tick();
      } else {
        window.clearTimeout(this.followTimer);
        this.unfreezeAll();
      }
    }
    for (const t of OPEN_TYPES) {
      if (!(t.key in patch) || before[t.key] === this.settings[t.key]) continue;
      if (this.settings[t.key]) {
        for (const doc of this.documents()) this.sweep(doc.body);
      } else {
        this.closeAutoOpened((key) => key === t.key);
      }
    }
    window.clearTimeout(this.saveTimer);
    this.saveTimer = null;
    try {
      await this.persist();
    } catch (e) {
      this.warn('save', e);
    }
  }

  // The main window plus every popout window that holds a leaf.
  documents() {
    const docs = new Set([document]);
    try {
      this.app.workspace.iterateAllLeaves((leaf) => {
        const doc = leaf.view && leaf.view.containerEl && leaf.view.containerEl.ownerDocument;
        if (doc) docs.add(doc);
      });
    } catch (e) {
      this.warn('documents', e);
    }
    return docs;
  }

  applyStyles(doc) {
    const vars = cssVars(this.settings);
    const classes = bodyClasses(this.settings);
    for (const d of doc ? [doc] : this.documents()) {
      if (!d || !d.body) continue;
      for (const [cls, on] of Object.entries(classes)) d.body.classList.toggle(cls, on);
      this.setVars(d.body, vars);
    }
  }

  setVars(el, vars) {
    if (typeof el.setCssProps === 'function') {
      el.setCssProps(vars);
      return;
    }
    for (const [name, value] of Object.entries(vars)) el.style.setProperty(name, value);
  }

  // ── Claudian views ─────────────────────────────────────────────

  views() {
    const out = [];
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (view && view.tabManager && view.tabBar && typeof view.updateTabBar === 'function') out.push(view);
    }
    return out;
  }

  identities(view) {
    const tm = view.tabManager;
    const list = typeof tm.getTabIdentities === 'function' ? tm.getTabIdentities() : null;
    return Array.isArray(list) ? list : [];
  }

  tickSoon(ms) {
    window.clearTimeout(this.tickTimer);
    this.tickTimer = window.setTimeout(() => this.tick(), ms);
  }

  tick() {
    this.closeAutoOpened((key, header) => !this.isLatestReply(header));
    let views;
    try {
      views = this.views();
    } catch (e) {
      this.warn('views', e);
      return;
    }
    for (const tm of this.hookedManagers) {
      if (!views.some((v) => v.tabManager === tm)) this.hookedManagers.delete(tm);
    }
    for (const tm of this.switchManagers) {
      if (!views.some((v) => v.tabManager === tm)) this.switchManagers.delete(tm);
    }
    const tabNames = this.settings.tabNames;
    const tabIds = new Set();
    for (const view of views) {
      try {
        if (this.settings.openNoteOnTabSwitch) this.hookSwitch(view);
        if (this.settings.tabsFollowNotes) this.freezeDrafts(view);
        if (tabNames) {
          this.hook(view);
          this.syncLabels(view);
          const idents = this.identities(view);
          for (const i of idents) tabIds.add(i.id);
          const sig = JSON.stringify(
            idents.map((i) => [i.id, i.label || '', i.conversationId || '', this.linkedPath(view, i) || ''])
          );
          if (this.signatures.get(view) !== sig) {
            this.signatures.set(view, sig);
            view.updateTabBar();
          }
        }
        // Popout windows aren't covered by the observer on the main window.
        if (view.containerEl && view.containerEl.ownerDocument !== document) this.sweep(view.containerEl);
      } catch (e) {
        this.warn('tick', e);
      }
    }
    if (tabIds.size > 0 && Date.now() - this.loadedAt > PRUNE_GRACE_MS) this.prune(tabIds);
    if (this.settings.tabsFollowNotes && views[0]) this.syncTabsWithNotes(views[0]);
  }

  // ── Tab names ──────────────────────────────────────────────────

  hook(view) {
    const tm = view.tabManager;
    if (this.hookedManagers.has(tm) || typeof tm.getTabBarItems !== 'function') return;
    const original = tm.getTabBarItems;
    tm.getTabBarItems = (...args) => {
      const items = original.apply(tm, args);
      try {
        return this.decorate(view, items);
      } catch (e) {
        this.warn('decorate', e);
        return items;
      }
    };
    this.hookedManagers.add(tm);
    view.updateTabBar();
  }

  // Puts Claudian's own getTabBarItems back and redraws the tab bars.
  unhookAll() {
    for (const tm of this.hookedManagers) {
      try {
        delete tm.getTabBarItems;
      } catch {
        /* ignore */
      }
    }
    this.hookedManagers.clear();
    this.signatures = new WeakMap();
    let views = [];
    try {
      views = this.views();
    } catch {
      /* ignore */
    }
    for (const view of views) {
      try {
        view.updateTabBar();
      } catch {
        /* ignore */
      }
    }
  }

  // ── Open the note on tab switch ────────────────────────────────

  // Wraps the tab manager's switchToTab: after Claudian has switched, the new
  // tab's linked note is shown. Claudian's own method comes back when the
  // setting is turned off or the plugin unloads.
  hookSwitch(view) {
    const tm = view.tabManager;
    if (this.switchManagers.has(tm) || typeof tm.switchToTab !== 'function') return;
    const original = tm.switchToTab;
    tm.switchToTab = async (...args) => {
      const before = typeof tm.getActiveTabId === 'function' ? tm.getActiveTabId() : null;
      const result = await original.apply(tm, args);
      try {
        this.showLinkedNote(view, before);
      } catch (e) {
        this.warn('switch', e);
      }
      return result;
    };
    this.switchManagers.add(tm);
  }

  unhookSwitch() {
    for (const tm of this.switchManagers) {
      try {
        delete tm.switchToTab;
      } catch {
        /* ignore */
      }
    }
    this.switchManagers.clear();
  }

  // Only reacts to a switch you make in the chat: the tab must really change
  // and the Claudian view must be the active one, so Claudian restoring its
  // tabs on startup or switching one in the background doesn't move your notes.
  showLinkedNote(view, before) {
    if (!this.settings.openNoteOnTabSwitch || this.syncing > 0) return;
    const tm = view.tabManager;
    const after = typeof tm.getActiveTabId === 'function' ? tm.getActiveTabId() : null;
    if (!after || after === before) return;
    if (this.app.workspace.getActiveViewOfType(obsidian.ItemView) !== view) return;
    const ident = this.identities(view).find((i) => i.id === after);
    const path = this.linkedPath(view, ident);
    const file = path ? this.app.vault.getAbstractFileByPath(path) : null;
    if (!(file instanceof TFile)) return;
    const seq = ++this.revealSeq;
    this.revealFile(view, file, seq).catch((e) => this.warn('reveal', e));
  }

  async revealFile(view, file, seq) {
    const ws = this.app.workspace;
    let existing = null;
    ws.iterateAllLeaves((leaf) => {
      if (!existing && leaf !== view.leaf && this.leafPath(leaf) === file.path) existing = leaf;
    });
    if (existing) {
      ws.setActiveLeaf(existing, { focus: false });
      return;
    }
    // Rapid switching: only the last tab's note opens.
    if (seq !== this.revealSeq) return;
    let leaf = ws.getLeaf(false);
    if (!leaf || leaf === view.leaf || (leaf.view && leaf.view.getViewType() === VIEW_TYPE)) leaf = ws.getLeaf('tab');
    await leaf.openFile(file, { active: false });
  }

  // ── Tab for the opened note ────────────────────────────────────

  // Switching to a tab already linked to the note is instant. Otherwise the
  // note has to stay active for FOLLOW_DELAY_MS, so skimming through notes
  // doesn't create a tab for each one.
  noteOpened(file) {
    window.clearTimeout(this.followTimer);
    if (!this.settings.tabsFollowNotes || this.syncing > 0) return;
    if (!(file instanceof TFile) || !FOLLOW_EXTENSIONS.has(file.extension)) return;
    const view = this.views()[0];
    if (!view) return;
    const tm = view.tabManager;
    const tabId = this.tabFor(view, file.path);
    if (tabId) {
      if (tabId !== tm.getActiveTabId()) this.guarded(() => tm.switchToTab(tabId));
      return;
    }
    this.followTimer = window.setTimeout(() => this.guarded(() => this.openTabFor(file.path)), FOLLOW_DELAY_MS);
  }

  // The id of the tab linked to a path (the active one first), or null.
  tabFor(view, path) {
    const tm = view.tabManager;
    const activeId = typeof tm.getActiveTabId === 'function' ? tm.getActiveTabId() : null;
    const matches = this.identities(view).filter((i) => this.linkedPath(view, i) === path);
    const best = matches.find((i) => i.id === activeId) || matches[0];
    return best ? best.id : null;
  }

  // Runs the action with the other direction muted, and reports any error.
  guarded(action) {
    this.syncing++;
    return Promise.resolve()
      .then(action)
      .catch((e) => this.warn('follow', e))
      .finally(() => {
        this.syncing--;
      });
  }

  // An empty chat tab links itself to whichever note is active, until its
  // first message. That would make a tab "move" to each note you open, so
  // while this setting is on, a tab keeps the note it was linked to. The two
  // methods that do the following are replaced on the linked-content class
  // itself, so it holds for every tab, including ones Claudian loads or
  // creates later. A new tab still starts linked to the active note.
  freezeDrafts(view) {
    if (this.lcPatch) return;
    const tm = view.tabManager;
    if (typeof tm.getTab !== 'function') return;
    for (const ident of this.identities(view)) {
      const tab = tm.getTab(ident.id);
      const lc = tab && tab.linkedContent;
      const proto = lc ? Object.getPrototypeOf(lc) : null;
      if (!proto || !Object.prototype.hasOwnProperty.call(proto, 'handleActiveFileChanged')) continue;
      this.lcPatch = {
        proto,
        changed: proto.handleActiveFileChanged,
        metadata: proto.handleActiveFileMetadataChanged,
      };
      const noop = () => {};
      proto.handleActiveFileChanged = noop;
      proto.handleActiveFileMetadataChanged = noop;
      return;
    }
  }

  unfreezeAll() {
    const patch = this.lcPatch;
    if (!patch) return;
    this.lcPatch = null;
    patch.proto.handleActiveFileChanged = patch.changed;
    patch.proto.handleActiveFileMetadataChanged = patch.metadata;
  }

  // quiet: for a note that is already open. The new tab doesn't take over
  // as the active one, and the note doesn't have to be the active file.
  async openTabFor(path, quiet = false) {
    const active = this.app.workspace.getActiveFile();
    if (!this.settings.tabsFollowNotes) return;
    if (!quiet && (!active || active.path !== path)) return; // you moved on
    const view = this.views()[0];
    if (!view || this.creating.has(path)) return;
    const tm = view.tabManager;
    if (this.tabFor(view, path)) return;
    if (typeof tm.canCreateTab === 'function' && !tm.canCreateTab()) return;
    if (typeof tm.createTab !== 'function') return;
    this.creating.add(path);
    try {
      // A new tab: with the latest conversation linked to the note if there
      // is one (openConversation would replace the active tab instead).
      const conv = this.latestConversation(view, path);
      const made = await tm.createTab(conv ? conv.id : null, null, { activate: !quiet });
      const tab = made && made.linkedContent ? made : typeof tm.getActiveTab === 'function' ? tm.getActiveTab() : null;
      const lc = tab && tab.linkedContent;
      if (!lc) return;
      this.freezeDrafts(view);
      const snap = typeof lc.getSnapshot === 'function' ? lc.getSnapshot() : null;
      // A new empty tab links itself to the active note; make sure it did.
      if (snap && snap.path !== path && (snap.mode === 'auto-draft' || snap.mode === 'explicit-draft') && typeof lc.selectExplicit === 'function') {
        lc.selectExplicit(path);
      }
    } finally {
      // Hold the lock a moment, until the new tab shows up in the tab list.
      window.setTimeout(() => this.creating.delete(path), 1000);
    }
  }

  // The note or canvas a leaf shows. A leaf Obsidian hasn't loaded yet has no
  // view.file, so its saved state is read instead.
  leafPath(leaf) {
    try {
      const st = leaf.getViewState();
      if (!st || !FOLLOW_VIEW_TYPES.has(st.type)) return null;
      const v = leaf.view;
      if (v && v.file && v.file.path) return v.file.path;
      return st.state && typeof st.state.file === 'string' ? st.state.file : null;
    } catch {
      return null;
    }
  }

  openNotePaths() {
    const out = new Set();
    this.app.workspace.iterateAllLeaves((leaf) => {
      const path = this.leafPath(leaf);
      if (path) out.add(path);
    });
    return out;
  }

  // Runs on every check while the setting is on: closes the tabs of notes
  // that were open and no longer are, and (once Claudian's tabs have settled)
  // gives every note that is already open a tab. The first check only
  // records which notes are open, so turning the setting on never closes tabs.
  syncTabsWithNotes(view) {
    if (this.syncBusy) return;
    const open = this.openNotePaths();
    const prev = this.prevOpen;
    this.prevOpen = open;
    const now = Date.now();
    const count = this.identities(view).length;
    if (count !== this.lastTabCount) {
      this.lastTabCount = count;
      this.tabCountSince = now;
    }
    if (now - this.loadedAt < STARTUP_GRACE_MS) return;
    const settled = count > 0 && now - this.tabCountSince >= TABS_SETTLED_MS;
    const closed = prev ? [...prev].filter((p) => !open.has(p)) : [];
    const catchUp = settled && !this.caughtUp;
    if (closed.length === 0 && !catchUp) return;
    this.syncBusy = true;
    this.guarded(async () => {
      for (const path of closed) await this.closeTabsFor(view, path);
      if (catchUp) {
        this.caughtUp = true;
        for (const path of open) await this.openTabFor(path, true);
      }
    }).finally(() => {
      this.syncBusy = false;
    });
  }

  // Closes the tabs linked to a note that is no longer open. A tab that is
  // working stays, and so does the last tab. The conversation stays in the
  // history.
  async closeTabsFor(view, path) {
    const tm = view.tabManager;
    if (typeof tm.closeTab !== 'function') return;
    for (const ident of [...this.identities(view)]) {
      if (this.linkedPath(view, ident) !== path) continue;
      if (this.identities(view).length <= 1) return;
      if (typeof tm.isTabWorking === 'function' && tm.isTabWorking(ident.id)) continue;
      await tm.closeTab(ident.id);
    }
  }

  // The most recent conversation linked to the path that isn't archived.
  latestConversation(view, path) {
    const plugin = view.plugin;
    const list = plugin && typeof plugin.getConversationList === 'function' ? plugin.getConversationList() : null;
    if (!Array.isArray(list)) return null;
    let best = null;
    for (const c of list) {
      if (!c || c.linkedContentPath !== path || c.archived || c.isArchived) continue;
      if (!best || (c.lastActivityAt || c.createdAt || 0) > (best.lastActivityAt || best.createdAt || 0)) best = c;
    }
    return best;
  }

  // Runs inside Claudian's updateTabBar(), right before the tab bar renders.
  decorate(view, items) {
    if (!Array.isArray(items)) return items;
    const tabBar = view.tabBar;
    const expanded = tabBar && tabBar.expandedTitleTabIds instanceof Set ? tabBar.expandedTitleTabIds : null;
    const idents = new Map(this.identities(view).map((i) => [i.id, i]));
    let expandedNew = false;
    const out = items.map((item) => {
      const name = this.noteName(this.linkedPath(view, idents.get(item.id) || { id: item.id }));
      if (!name) return item;
      // Show the name instead of the number, once per tab. If you switch
      // a tab back to "Show number", that sticks.
      if (expanded && !this.autoExpanded.has(item.id)) {
        this.autoExpanded.add(item.id);
        expanded.add(item.id);
        expandedNew = true;
      }
      return { ...item, title: name };
    });
    if (expandedNew) {
      this.saveSoon();
      window.setTimeout(() => {
        try {
          if (tabBar.callbacks && typeof tabBar.callbacks.onDisplayStateChanged === 'function') {
            tabBar.callbacks.onDisplayStateChanged();
          }
        } catch (e) {
          this.warn('persist', e);
        }
      }, 0);
    }
    return out;
  }

  linkedPath(view, ident) {
    if (!ident) return null;
    const tm = view.tabManager;
    const tab = typeof tm.getTab === 'function' ? tm.getTab(ident.id) : null;
    const lc = tab && tab.linkedContent;
    if (lc) {
      const snap = typeof lc.getSnapshot === 'function' ? lc.getSnapshot() : null;
      const path = snap ? snap.path : lc.path;
      if (path !== undefined) return path || null;
    }
    // Tab not loaded yet: read the conversation's saved metadata.
    const convId = ident.conversationId;
    const plugin = view.plugin;
    if (!convId || !plugin || typeof plugin.getConversationSync !== 'function') return null;
    const conv = plugin.getConversationSync(convId);
    return (conv && conv.linkedContentPath) || null;
  }

  noteName(path) {
    if (!path || typeof path !== 'string') return null;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (file instanceof TFile) return file.basename;
    if (file && file.name) return file.name;
    const last = path.split('/').pop() || '';
    return last.replace(/\.md$/i, '') || null;
  }

  // A manual rename belongs to the conversation that was open when you
  // made it. When the tab moves to another conversation, it's cleared.
  syncLabels(view) {
    const tm = view.tabManager;
    if (typeof tm.setTabLabel !== 'function') return;
    const now = Date.now();
    let dirty = false;
    for (const ident of this.identities(view)) {
      const label = ident.label || null;
      const conv = ident.conversationId || null;
      const rec = this.labelOwners[ident.id];
      if (!label) {
        if (rec) {
          delete this.labelOwners[ident.id];
          dirty = true;
        }
        continue;
      }
      if (!rec || rec.label !== label) {
        this.labelOwners[ident.id] = { label, conv, at: now };
        dirty = true;
        continue;
      }
      if (rec.conv === conv) {
        if (rec.nullSince) {
          delete rec.nullSince;
          dirty = true;
        }
        continue;
      }
      if (rec.conv === null && conv !== null && convCreatedAt(conv) >= rec.at - 60000) {
        // The draft you renamed was just saved as a conversation: same chat.
        rec.conv = conv;
        dirty = true;
        continue;
      }
      if (conv === null) {
        // New draft in the tab. Wait one poll in case it's a transient state.
        if (!rec.nullSince) {
          rec.nullSince = now;
          dirty = true;
          continue;
        }
        if (now - rec.nullSince < POLL_MS) continue;
      }
      if (typeof tm.isTabLive === 'function' && !tm.isTabLive(ident.id)) continue;
      delete this.labelOwners[ident.id];
      dirty = true;
      tm.setTabLabel(ident.id, null);
    }
    if (dirty) this.saveSoon();
  }

  prune(tabIds) {
    let dirty = false;
    for (const id of [...this.autoExpanded]) {
      if (!tabIds.has(id)) {
        this.autoExpanded.delete(id);
        dirty = true;
      }
    }
    for (const id of Object.keys(this.labelOwners)) {
      if (!tabIds.has(id)) {
        delete this.labelOwners[id];
        dirty = true;
      }
    }
    if (dirty) this.saveSoon();
  }

  // ── Tables, task notifications and blocks that open by default ─

  sweep(node) {
    if (!node || node.nodeType !== 1) return;
    try {
      if (node.matches(SWEEP_SEL)) this.handle(node);
      for (const el of node.querySelectorAll(SWEEP_SEL)) this.handle(el);
    } catch (e) {
      this.warn('sweep', e);
    }
  }

  handle(el) {
    if (el.tagName === 'TABLE') this.wrapTable(el);
    else if (el.matches(NOTIF_SEL)) this.openNotification(el);
    else if (el.classList.contains(NOTIF_CLASS)) this.markNotification(el);
    else this.autoOpen(el);
  }

  wrapTable(table) {
    const parent = table.parentElement;
    if (!parent || parent.classList.contains(TABLE_WRAP)) return;
    const wrap = table.ownerDocument.createElement('div');
    wrap.className = TABLE_WRAP;
    parent.insertBefore(wrap, table);
    wrap.appendChild(table);
  }

  // Marks what styles.css would otherwise find with the CSS has() selector,
  // which Obsidian's review flags as slow: the notification's text while
  // it's still raw, and every element between the notification and its
  // reply, with the "Worked for…" groups among them. Runs again when
  // Claudian moves the notification into a group.
  markNotification(wrapper) {
    for (const body of wrapper.querySelectorAll(`:scope > .${WORK_HISTORY_CLASS} > div`)) {
      if (!body.firstElementChild) body.classList.add(RAW_TEXT);
    }
    const stop = wrapper.ownerDocument.body;
    for (let el = wrapper.parentElement; el && el !== stop; el = el.parentElement) {
      if (el.classList.contains(ASSISTANT_CLASS)) break;
      el.classList.add(NOTIF_PATH);
      if (el.classList.contains(WORK_HISTORY_CLASS)) el.classList.add(HOLDS_NOTIF);
    }
  }

  // Claudian renders the notification text on the header's first click.
  openNotification(button) {
    if (this.openedButtons.has(button)) return;
    this.openedButtons.add(button);
    this.click(button);
  }

  // Opens a closed block once, if its type is on and it's in the newest reply.
  // A block you close yourself stays closed.
  autoOpen(header) {
    if (this.openedBlocks.has(header)) return;
    const type = OPEN_TYPES.find((t) => header.matches(t.sel));
    if (!type || !this.settings[type.key] || !this.isLatestReply(header)) return;
    this.openedBlocks.add(header);
    this.autoOpened.set(header, type.key);
    this.click(header);
  }

  // Closes blocks the plugin opened, when shouldClose(typeKey, header) says so.
  closeAutoOpened(shouldClose) {
    for (const [header, key] of this.autoOpened) {
      if (!header.isConnected) {
        this.autoOpened.delete(header);
        continue;
      }
      if (!shouldClose(key, header)) continue;
      this.autoOpened.delete(header);
      // Turning a type off forgets the block, so turning it on can open it again.
      if (!this.settings[key]) this.openedBlocks.delete(header);
      if (header.getAttribute('aria-expanded') === 'true') this.click(header);
    }
  }

  // True when el sits in the last assistant reply of its chat.
  isLatestReply(el) {
    const reply = el.closest(`.${ASSISTANT_CLASS}`);
    const list = reply && reply.parentElement;
    if (!list) return false;
    let last = list.lastElementChild;
    while (last && !last.classList.contains(ASSISTANT_CLASS)) last = last.previousElementSibling;
    return last === reply;
  }

  // A click on the element itself, without bubbling, so nothing else reacts.
  click(el) {
    const win = el.ownerDocument.defaultView || window;
    el.dispatchEvent(new win.MouseEvent('click', { bubbles: false, cancelable: true }));
  }

  // ── Storage and logging ───────────────────────────────────────

  saveSoon() {
    window.clearTimeout(this.saveTimer);
    this.saveTimer = window.setTimeout(() => this.flush(), 1000);
  }

  flush() {
    this.saveTimer = null;
    this.persist().catch((e) => this.warn('save', e));
  }

  persist() {
    return this.saveData({
      settings: this.settings,
      autoExpandedTabs: [...this.autoExpanded],
      labelOwners: this.labelOwners,
    });
  }

  warn(where, error) {
    if (this.warned.has(where)) return;
    this.warned.add(where);
    console.warn(`[claudian-minimal] ${where}:`, error);
  }
};

const convCreatedAt = (id) => {
  const m = /^conv-(\d+)-/.exec(id || '');
  return m ? Number(m[1]) : 0;
};
