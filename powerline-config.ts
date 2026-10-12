import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { normalizeCostCurrency } from "./currency-rates.ts";
import { BUILTIN_STATUS_LINE_SEGMENT_IDS } from "./types.ts";
import type { ColorValue, CustomItemPosition, CustomStatusItem, PowerlinePlacement, StatusFormatRule, PresetDef, StatusLineLayout, StatusLinePreset, StatusLineSegmentId, StatusLineSegmentOptions, StatusLineSeparatorStyle } from "./types.ts";

export type CompactPromptMode = "queue" | "native";
export type SecondaryOverflow = "drop" | "wrap";
export type EditorMode = "default" | "vim";
export type EditorFrame = "default" | "rounded";

export interface EditorVimModeColors {
  insert?: string;
  normal?: string;
  visual?: string;
  ex?: string;
}

/** `powerline.editor.vim`: only the settings of the kept Vim features. */
export interface EditorVimSettings {
  clipboardMirror?: unknown;
  exCommand?: unknown;
  /**
   * The user-global `exCommand` object. `copyInputToClipboard` writes the prompt to the OS
   * clipboard, so a checked-in project setting must not be able to enable it — the same policy the
   * vendored resolver applies to its own `piVim` namespace.
   */
  globalExCommand?: unknown;
  modeColors?: EditorVimModeColors;
}

export interface EditorConfig {
  mode: EditorMode;
  invalidMode: string | null;
  frame: EditorFrame;
  invalidFrame: string | null;
  vim: EditorVimSettings;
}

export interface PowerlineConfig {
  preset: StatusLinePreset;
  customItems: CustomStatusItem[];
  statusFormats: Map<string, StatusFormatRule>;
  invalidStatusFormats: string[];
  statusOrder: string[];
  disabledSegments: StatusLineSegmentId[];
  invalidDisabledSegments: string[];
  layout: StatusLineLayout | null;
  invalidLayoutSegments: string[];
  separator: StatusLineSeparatorStyle | null;
  segmentOptions: StatusLineSegmentOptions;
  placement: PowerlinePlacement;
  invalidPlacement: string | null;
  secondaryOverflow: SecondaryOverflow;
  invalidSecondaryOverflow: string | null;
  welcome: boolean;
  stashSharpSShortcut: boolean;
  editor: EditorConfig;
  queue: { compactPromptMode: CompactPromptMode };
  sendDelayMs: number;
  autoFollowUp: boolean;
  workingVibes: { color?: ColorValue | "rainbow" };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePreset(value: unknown, presets: readonly StatusLinePreset[]): StatusLinePreset | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (presets as readonly string[]).includes(normalized) ? (normalized as StatusLinePreset) : null;
}

function normalizePlacement(value: unknown): { placement: PowerlinePlacement; invalidPlacement: string | null } {
  if (value === undefined) return { placement: "above", invalidPlacement: null };

  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "above" || normalized === "below") {
    return { placement: normalized, invalidPlacement: null };
  }

  return {
    placement: "above",
    invalidPlacement: typeof value === "string" ? value.trim() : String(value),
  };
}

function normalizeSecondaryOverflow(value: unknown): { secondaryOverflow: SecondaryOverflow; invalidSecondaryOverflow: string | null } {
  if (value === undefined) return { secondaryOverflow: "drop", invalidSecondaryOverflow: null };

  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "drop" || normalized === "wrap") {
    return { secondaryOverflow: normalized, invalidSecondaryOverflow: null };
  }

  return {
    secondaryOverflow: "drop",
    invalidSecondaryOverflow: typeof value === "string" ? value.trim() : String(value),
  };
}

const SEPARATOR_STYLES = [
  "powerline",
  "powerline-thin",
  "slash",
  "pipe",
  "block",
  "none",
  "ascii",
  "dot",
  "chevron",
  "star",
] as const satisfies readonly StatusLineSeparatorStyle[];

function normalizeSeparator(value: unknown): StatusLineSeparatorStyle | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLowerCase();
  return (SEPARATOR_STYLES as readonly string[]).includes(normalized)
    ? (normalized as StatusLineSeparatorStyle)
    : null;
}

function normalizeCustomItemId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (!normalized) return null;
  return /^[a-zA-Z0-9_-]+$/.test(normalized) ? normalized : null;
}

function normalizeCustomItemPosition(value: unknown): CustomItemPosition {
  if (value === "left" || value === "right" || value === "secondary") return value;
  return "right";
}

function normalizeCustomColor(value: unknown): ColorValue | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? (normalized as ColorValue) : undefined;
}

function normalizeCustomPrefix(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}


function normalizeCustomStatusItem(raw: unknown, idOverride?: string): CustomStatusItem | null {
  if (!isRecord(raw)) return null;
  const id = normalizeCustomItemId(idOverride ?? raw.id);
  if (!id) return null;

  const statusKey = typeof raw.statusKey === "string" && raw.statusKey.trim() ? raw.statusKey.trim() : id;

  return {
    id,
    statusKey,
    position: normalizeCustomItemPosition(raw.position),
    color: normalizeCustomColor(raw.color),
    selfColorize: raw.selfColorize === true,
    prefix: normalizeCustomPrefix(raw.prefix),
    hideWhenMissing: raw.hideWhenMissing !== false,
    excludeFromExtensionStatuses: raw.excludeFromExtensionStatuses !== false,
  };
}

function normalizeCustomItems(raw: unknown): CustomStatusItem[] {
  const normalized: CustomStatusItem[] = [];

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const item = normalizeCustomStatusItem(entry);
      if (item) normalized.push(item);
    }
  } else if (isRecord(raw)) {
    for (const [id, entry] of Object.entries(raw)) {
      const item = normalizeCustomStatusItem(entry, id);
      if (item) normalized.push(item);
    }
  }

  const deduped = new Map<string, CustomStatusItem>();
  for (const item of normalized) {
    deduped.set(item.id, item);
  }

  return [...deduped.values()];
}

const BUILTIN_STATUS_LINE_SEGMENT_ID_SET = new Set<string>(BUILTIN_STATUS_LINE_SEGMENT_IDS);

function normalizeStatusLineSegmentId(value: unknown, customItemIds: ReadonlySet<string>): StatusLineSegmentId | null {
  if (typeof value !== "string") return null;

  const normalized = value.trim();
  if (BUILTIN_STATUS_LINE_SEGMENT_ID_SET.has(normalized)) {
    return normalized as StatusLineSegmentId;
  }

  const customId = normalized.startsWith("custom:")
    ? normalizeCustomItemId(normalized.slice("custom:".length))
    : null;
  return customId && customItemIds.has(customId) ? `custom:${customId}` : null;
}

function normalizeDisabledSegments(
  raw: unknown,
  customItems: readonly CustomStatusItem[],
): { disabledSegments: StatusLineSegmentId[]; invalidDisabledSegments: string[] } {
  if (!Array.isArray(raw)) return { disabledSegments: [], invalidDisabledSegments: [] };

  const disabledSegments: StatusLineSegmentId[] = [];
  const invalidDisabledSegments: string[] = [];
  const customItemIds = new Set(customItems.map((item) => item.id));
  const seen = new Set<StatusLineSegmentId>();

  for (const entry of raw) {
    const segmentId = normalizeStatusLineSegmentId(entry, customItemIds);
    if (!segmentId) {
      invalidDisabledSegments.push(typeof entry === "string" ? entry.trim() : String(entry));
    } else if (!seen.has(segmentId)) {
      seen.add(segmentId);
      disabledSegments.push(segmentId);
    }
  }

  return { disabledSegments, invalidDisabledSegments };
}

function normalizeLayout(
  raw: unknown,
  customItems: readonly CustomStatusItem[],
): { layout: StatusLineLayout | null; invalidLayoutSegments: string[] } {
  if (!isRecord(raw)) return { layout: null, invalidLayoutSegments: [] };

  const layout: StatusLineLayout = {};
  const invalidLayoutSegments: string[] = [];
  const customItemIds = new Set(customItems.map((item) => item.id));
  const globallyPlaced = new Set<StatusLineSegmentId>();

  for (const row of ["left", "right", "secondary"] as const) {
    const entries = raw[row];
    if (!Array.isArray(entries)) continue;

    const segments: StatusLineSegmentId[] = [];
    const seen = new Set<StatusLineSegmentId>();
    for (const entry of entries) {
      const segmentId = normalizeStatusLineSegmentId(entry, customItemIds);
      if (!segmentId) {
        invalidLayoutSegments.push(`${row}:${typeof entry === "string" ? entry.trim() : String(entry)}`);
      } else if (!seen.has(segmentId)) {
        seen.add(segmentId);
        if (globallyPlaced.has(segmentId)) {
          invalidLayoutSegments.push(`${row}:${segmentId}`);
        } else {
          globallyPlaced.add(segmentId);
          segments.push(segmentId);
        }
      }
    }
    layout[row] = segments;
  }

  return Object.keys(layout).length > 0
    ? { layout, invalidLayoutSegments }
    : { layout: null, invalidLayoutSegments };
}

function normalizeEditorMode(value: unknown): { mode: EditorMode; invalidMode: string | null } {
  if (value === undefined) return { mode: "default", invalidMode: null };

  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "default" || normalized === "vim") {
    return { mode: normalized, invalidMode: null };
  }

  return {
    mode: "default",
    invalidMode: typeof value === "string" ? value.trim() : String(value),
  };
}

function normalizeEditorFrame(value: unknown): { frame: EditorFrame; invalidFrame: string | null } {
  if (value === undefined) return { frame: "default", invalidFrame: null };

  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "default" || normalized === "rounded") {
    return { frame: normalized, invalidFrame: null };
  }

  return {
    frame: "default",
    invalidFrame: typeof value === "string" ? value.trim() : String(value),
  };
}

function normalizeVimModeColors(raw: unknown): EditorVimModeColors | undefined {
  if (!isRecord(raw)) return undefined;

  const colors: EditorVimModeColors = {};
  for (const key of ["insert", "normal", "visual", "ex"] as const) {
    const value = raw[key];
    if (typeof value === "string" && value.trim()) colors[key] = value.trim();
  }

  return Object.keys(colors).length > 0 ? colors : undefined;
}

function normalizeEditor(value: unknown, globalValue: unknown): EditorConfig {
  const { mode, invalidMode } = normalizeEditorMode(isRecord(value) ? value.mode : undefined);
  const { frame, invalidFrame } = normalizeEditorFrame(isRecord(value) ? value.frame : undefined);
  const vim = isRecord(value) && isRecord(value.vim) ? value.vim : {};
  const globalVim = isRecord(globalValue) && isRecord(globalValue.vim) ? globalValue.vim : {};

  return {
    mode,
    invalidMode,
    frame,
    invalidFrame,
    vim: {
      clipboardMirror: vim.clipboardMirror,
      exCommand: vim.exCommand,
      globalExCommand: globalVim.exCommand,
      modeColors: normalizeVimModeColors(vim.modeColors),
    },
  };
}

function normalizeQueueOptions(raw: unknown): PowerlineConfig["queue"] {
  if (!isRecord(raw)) return { compactPromptMode: "queue" };
  return {
    compactPromptMode: raw.compactPromptMode === "native" ? "native" : "queue",
  };
}

function normalizeSegmentOptions(raw: Record<string, unknown>): StatusLineSegmentOptions {
  const options: StatusLineSegmentOptions = {};

  if (isRecord(raw.model)) {
    options.model = {
      ...(typeof raw.model.showThinkingLevel === "boolean" ? { showThinkingLevel: raw.model.showThinkingLevel } : {}),
      ...(raw.model.display === "name" || raw.model.display === "qualified" ? { display: raw.model.display } : {}),
    };
  }

  if (isRecord(raw.path)) {
    options.path = {
      ...(raw.path.mode === "basename" || raw.path.mode === "abbreviated" || raw.path.mode === "full" ? { mode: raw.path.mode } : {}),
      ...(typeof raw.path.maxLength === "number" && Number.isFinite(raw.path.maxLength) && raw.path.maxLength > 0
        ? { maxLength: Math.floor(raw.path.maxLength) }
        : {}),
    };
  }

  if (isRecord(raw.git)) {
    options.git = {
      ...(typeof raw.git.showBranch === "boolean" ? { showBranch: raw.git.showBranch } : {}),
      ...(typeof raw.git.showStaged === "boolean" ? { showStaged: raw.git.showStaged } : {}),
      ...(typeof raw.git.showUnstaged === "boolean" ? { showUnstaged: raw.git.showUnstaged } : {}),
      ...(typeof raw.git.showUntracked === "boolean" ? { showUntracked: raw.git.showUntracked } : {}),
      ...(raw.git.polling === "full" || raw.git.polling === "branch" || raw.git.polling === "off" ? { polling: raw.git.polling } : {}),
      ...(raw.git.vcs === "auto" || raw.git.vcs === "git" || raw.git.vcs === "jj" ? { vcs: raw.git.vcs } : {}),
      ...(typeof raw.git.hostIcon === "boolean" ? { hostIcon: raw.git.hostIcon } : {}),
    };
  }

  if (isRecord(raw.time)) {
    options.time = {
      ...(raw.time.format === "12h" || raw.time.format === "24h" ? { format: raw.time.format } : {}),
      ...(typeof raw.time.showSeconds === "boolean" ? { showSeconds: raw.time.showSeconds } : {}),
    };
  }

  if (isRecord(raw.cost)) {
    const currency = normalizeCostCurrency(raw.cost.currency);
    options.cost = {
      ...(raw.cost.subscriptionDisplay === "subscription"
        || raw.cost.subscriptionDisplay === "reported-cost"
        || raw.cost.subscriptionDisplay === "both"
        ? { subscriptionDisplay: raw.cost.subscriptionDisplay }
        : {}),
      ...(currency ? { currency } : {}),
    };
  }

  if (isRecord(raw.context)) {
    options.context = {
      ...(raw.context.format === "full" || raw.context.format === "percent" ? { format: raw.context.format } : {}),
    };
  }

  if (isRecord(raw.cache_read)) {
    options.cache_read = {
      ...(raw.cache_read.format === "tokens" || raw.cache_read.format === "percent" || raw.cache_read.format === "both"
        ? { format: raw.cache_read.format }
        : {}),
    };
  }

  return options;
}

export function mergeSegmentOptions(
  defaults: StatusLineSegmentOptions = {},
  overrides: StatusLineSegmentOptions = {},
): StatusLineSegmentOptions {
  return {
    ...defaults,
    ...overrides,
    model: { ...defaults.model, ...overrides.model },
    path: { ...defaults.path, ...overrides.path },
    git: { ...defaults.git, ...overrides.git },
    time: { ...defaults.time, ...overrides.time },
    cost: { ...defaults.cost, ...overrides.cost },
    context: { ...defaults.context, ...overrides.context },
    cache_read: { ...defaults.cache_read, ...overrides.cache_read },
  };
}

/**
 * `globalValue` is the user-global `powerline` object. It is only consulted for the one Vim setting
 * that must not be settable from a checked-in project file (`editor.vim.exCommand`); every other
 * setting is taken from the merged value. Omitting it keeps that setting at its default.
 */
export function parsePowerlineConfig(value: unknown, presets: readonly StatusLinePreset[], globalValue?: unknown): PowerlineConfig {
  const defaultConfig: PowerlineConfig = {
    preset: "default",
    customItems: [],
    statusFormats: new Map(),
    invalidStatusFormats: [],
    statusOrder: [],
    disabledSegments: [],
    invalidDisabledSegments: [],
    layout: null,
    invalidLayoutSegments: [],
    separator: null,
    segmentOptions: {},
    placement: "above",
    invalidPlacement: null,
    secondaryOverflow: "drop",
    invalidSecondaryOverflow: null,
    welcome: true,
    stashSharpSShortcut: false,
    editor: { mode: "default", invalidMode: null, frame: "default", invalidFrame: null, vim: {} },
    queue: { compactPromptMode: "queue" },
    sendDelayMs: 0,
    autoFollowUp: false,
    workingVibes: {},
  };

  const directPreset = normalizePreset(value, presets);
  if (directPreset) return { ...defaultConfig, preset: directPreset };

  if (!isRecord(value)) return defaultConfig;

  const customItems = normalizeCustomItems(value.customItems);
  const { disabledSegments, invalidDisabledSegments } = normalizeDisabledSegments(value.disabledSegments, customItems);
  const { layout, invalidLayoutSegments } = normalizeLayout(value.layout, customItems);
  const { statusFormats, invalidStatusFormats } = normalizeStatusFormats(value.statusFormats);
  const { placement, invalidPlacement } = normalizePlacement(value.placement);
  const { secondaryOverflow, invalidSecondaryOverflow } = normalizeSecondaryOverflow(value.secondaryOverflow);

  return {
    preset: normalizePreset(value.preset, presets) ?? defaultConfig.preset,
    customItems,
    statusFormats,
    invalidStatusFormats,
    statusOrder: Array.isArray(value.statusOrder)
      ? value.statusOrder.filter((key): key is string => typeof key === "string" && key.trim() !== "").map((key) => key.trim())
      : [],
    disabledSegments,
    invalidDisabledSegments,
    layout,
    invalidLayoutSegments,
    separator: normalizeSeparator(value.separator),
    segmentOptions: normalizeSegmentOptions(value),
    placement,
    invalidPlacement,
    secondaryOverflow,
    invalidSecondaryOverflow,
    welcome: value.welcome !== false,
    stashSharpSShortcut: value.stashSharpSShortcut === true,
    editor: normalizeEditor(value.editor, isRecord(globalValue) ? globalValue.editor : undefined),
    queue: normalizeQueueOptions(value.queue),
    sendDelayMs: typeof value.sendDelayMs === "number" && Number.isFinite(value.sendDelayMs) && value.sendDelayMs > 0
      ? value.sendDelayMs
      : 0,
    autoFollowUp: value.autoFollowUp === true,
    workingVibes: isRecord(value.workingVibes) && typeof value.workingVibes.color === "string" && value.workingVibes.color.trim()
      ? { color: value.workingVibes.color.trim() as ColorValue | "rainbow" }
      : {},
  };
}

export function mergeSegmentsWithCustomItems(
  presetDef: PresetDef,
  customItems: readonly CustomStatusItem[],
  options: {
    layout?: StatusLineLayout | null;
    disabledSegments?: readonly StatusLineSegmentId[];
  } = {},
): {
  leftSegments: StatusLineSegmentId[];
  rightSegments: StatusLineSegmentId[];
  secondarySegments: StatusLineSegmentId[];
} {
  const layout = options.layout ?? null;
  const explicitlyPlaced = new Set([
    ...(layout?.left ?? []),
    ...(layout?.right ?? []),
    ...(layout?.secondary ?? []),
  ]);
  const disabled = new Set(options.disabledSegments ?? []);

  const buildRow = (
    position: CustomItemPosition,
    configured: StatusLineSegmentId[] | undefined,
    presetSegments: readonly StatusLineSegmentId[],
  ): StatusLineSegmentId[] => {
    const segments = configured !== undefined
      ? [...configured]
      : presetSegments.filter((id) => !explicitlyPlaced.has(id));

    if (configured === undefined) {
      for (const item of customItems) {
        const segmentId: StatusLineSegmentId = `custom:${item.id}`;
        if (item.position === position && !explicitlyPlaced.has(segmentId)) {
          segments.push(segmentId);
        }
      }
    }

    return segments.filter((id) => !disabled.has(id));
  };

  return {
    leftSegments: buildRow("left", layout?.left, presetDef.leftSegments),
    rightSegments: buildRow("right", layout?.right, presetDef.rightSegments),
    secondarySegments: buildRow("secondary", layout?.secondary, presetDef.secondarySegments ?? []),
  };
}

export function nextPowerlineSettingWithPreset(existingPowerlineSetting: unknown, preset: StatusLinePreset): unknown {
  if (!isRecord(existingPowerlineSetting)) {
    return preset;
  }
  return { ...existingPowerlineSetting, preset };
}

export function nextPowerlineSettingWithOptions(
  existingPowerlineSetting: unknown,
  updates: Partial<Pick<PowerlineConfig, "welcome" | "stashSharpSShortcut" | "placement">>,
  currentPreset: StatusLinePreset,
): unknown {
  if (!isRecord(existingPowerlineSetting)) {
    return { preset: currentPreset, ...updates };
  }
  return { ...existingPowerlineSetting, ...updates };
}

export function collectHiddenExtensionStatusKeys(customItems: readonly CustomStatusItem[]): Set<string> {
  const hidden = new Set<string>();
  for (const item of customItems) {
    if (item.excludeFromExtensionStatuses) hidden.add(item.statusKey);
  }
  return hidden;
}

export function isNotificationExtensionStatus(value: string): boolean {
  return value.trimStart().startsWith("[");
}

export function getNotificationExtensionStatuses(
  statuses: ReadonlyMap<string, string>,
  hiddenKeys: ReadonlySet<string>,
): string[] {
  const notifications: string[] = [];
  for (const [statusKey, value] of statuses.entries()) {
    if (hiddenKeys.has(statusKey) || !value || !isNotificationExtensionStatus(value)) {
      continue;
    }
    notifications.push(value);
  }
  return notifications;
}

export function normalizeExtensionStatusValue(value: string, preserveAnsi = false): string | null {
  if (!value || visibleWidth(value) <= 0) {
    return null;
  }

  const stripped = preserveAnsi
    ? value.replace(/(\s|·|[|])+$/, "")
    : value.replace(/(\x1b\[[0-9;]*m|\s|·|[|])+$/, "");
  return visibleWidth(stripped) > 0 ? stripped : null;
}

const STATUS_FORMAT_FIELDS = new Set(["icon", "hide", "replace", "color", "maxWidth"]);

/** Keys with an invalid or unknown field are listed as `key.field`; the rest of the rule still applies. */
function normalizeStatusFormats(raw: unknown): { statusFormats: Map<string, StatusFormatRule>; invalidStatusFormats: string[] } {
  const statusFormats = new Map<string, StatusFormatRule>();
  const invalidStatusFormats: string[] = [];
  if (!isRecord(raw)) return { statusFormats, invalidStatusFormats };

  for (const [key, entry] of Object.entries(raw)) {
    if (!isRecord(entry)) {
      invalidStatusFormats.push(key);
      continue;
    }
    const rule: StatusFormatRule = {};
    for (const field of Object.keys(entry)) {
      if (!STATUS_FORMAT_FIELDS.has(field)) invalidStatusFormats.push(`${key}.${field}`);
    }
    if (typeof entry.icon === "string" && entry.icon.trim()) rule.icon = entry.icon.trim();
    if (entry.hide === true) rule.hide = true;
    const color = normalizeCustomColor(entry.color);
    if (color) rule.color = color;
    if (Number.isInteger(entry.maxWidth) && (entry.maxWidth as number) > 0) rule.maxWidth = entry.maxWidth as number;
    if (Array.isArray(entry.replace)) {
      rule.replace = [];
      for (const pair of entry.replace) {
        const [pattern, replacement] = Array.isArray(pair) ? pair : [];
        try {
          if (typeof pattern !== "string" || typeof replacement !== "string") throw new Error("pair");
          rule.replace.push([new RegExp(pattern, "gi"), replacement]);
        } catch {
          invalidStatusFormats.push(`${key}.replace`);
        }
      }
    }
    statusFormats.set(key, rule);
  }
  return { statusFormats, invalidStatusFormats };
}

const ANSI_SGR = /\x1b\[[0-9;]*m/g;
// Leading and trailing separators go, so a `· ` prefix from an extension never survives.
const EDGE_SEPARATORS = /^[\s·|]+|[\s·|]+$/g;

/**
 * Applies a status's format rule in order. A status that is empty after its rules is dropped, so an
 * empty value never leaves a stray separator. Without a rule the status is normalized as before.
 */
export function formatExtensionStatus(value: string, rule: StatusFormatRule | undefined): string | null {
  if (!rule) return normalizeCompactExtensionStatus(value);
  if (rule.hide) return null;

  let text = value.replace(ANSI_SGR, "");
  for (const [pattern, replacement] of rule.replace ?? []) text = text.replace(pattern, replacement);
  text = text.replace(EDGE_SEPARATORS, "");
  if (!text) return null;

  if (rule.icon) text = `${rule.icon} ${text}`;
  return rule.maxWidth ? truncateToWidth(text, rule.maxWidth, "…") : text;
}

export function normalizeCompactExtensionStatus(value: string): string | null {
  if (isNotificationExtensionStatus(value)) {
    return null;
  }

  return normalizeExtensionStatusValue(value);
}
