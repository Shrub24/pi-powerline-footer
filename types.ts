import type { SpeedSample, SpeedShow } from "./speed.ts";
import type { ToolActivity } from "./tool-activity.ts";
import type { Theme, ThemeColor } from "@earendil-works/pi-coding-agent";
import type { CostCurrencyCode } from "./currency-rates.ts";

// Theme color - a pi theme color name, a custom hex color, or the rainbow effect
export type ColorValue = ThemeColor | `#${string}` | "rainbow";
export type ThemeLike = Pick<Theme, "fg" | "getThinkingBorderColor">;

// Semantic color names for segments
export type SemanticColor =
  | "model"
  | "shellMode"
  | "path"
  | "gitDirty"
  | "gitClean"
  | "thinking"
  | "thinkingMinimal"
  | "thinkingLow"
  | "thinkingMedium"
  | "thinkingHigh"
  | "thinkingXhigh"
  | "thinkingMax"
  | "context"
  | "contextWarn"
  | "contextError"
  | "cost"
  | "tokens"
  | "queue"
  | "separator"
  | "border";

// Color scheme mapping semantic names to actual colors
export type ColorScheme = Partial<Record<SemanticColor, ColorValue>>;

// Built-in segment identifiers
export const BUILTIN_STATUS_LINE_SEGMENT_IDS = [
  "messages",
  "model",
  "shell_mode",
  "path",
  "git",
  "subagents",
  "queue",
  "token_in",
  "token_out",
  "tokens",
  "speed",
  "nix",
  "tool",
  "token_total",
  "cost",
  "context_pct",
  "context_total",
  "time_spent",
  "time",
  "session",
  "hostname",
  "cache_read",
  "cache_write",
  "thinking",
  "extension_statuses",
  "vim_mode",
] as const;

export type BuiltinStatusLineSegmentId = typeof BUILTIN_STATUS_LINE_SEGMENT_IDS[number];

// Segment identifiers (built-in + dynamically registered custom items)
/** `status:<key>` renders one extension status. Only `layout.footer` entries produce it, so it is valid nowhere else. */
export type StatusLineSegmentId = BuiltinStatusLineSegmentId | `custom:${string}` | `status:${string}`;

// Separator styles
export type StatusLineSeparatorStyle =
  | "powerline"
  | "powerline-thin"
  | "slash"
  | "pipe"
  | "block"
  | "none"
  | "ascii"
  | "dot"
  | "chevron"
  | "star";

// Preset names
export type PowerlinePlacement = "above" | "below";

export type StatusLinePreset =
  | "default"
  | "minimal"
  | "compact"
  | "full"
  | "nerd"
  | "ascii";

// Per-segment options
export interface StatusLineSegmentOptions {
  model?: { showThinkingLevel?: boolean; display?: "name" | "qualified" };
  path?: { 
    mode?: "basename" | "abbreviated" | "full";
    maxLength?: number;
  };
  git?: {
    showBranch?: boolean;
    showStaged?: boolean;
    showUnstaged?: boolean;
    showUntracked?: boolean;
    polling?: "full" | "branch" | "off";
    /** Which VCS the segment reads: jj when a `.jj` directory is found (auto), or forced. */
    vcs?: "auto" | "git" | "jj";
    /** Replace the branch icon with the origin remote's host logo
     * (GitHub/GitLab/Bitbucket, or a generic git logo). Default false. */
    hostIcon?: boolean;
  };
  time?: { format?: "12h" | "24h"; showSeconds?: boolean };
  cost?: { subscriptionDisplay?: "subscription" | "reported-cost" | "both"; currency?: CostCurrencyCode };
  context?: { format?: "full" | "percent" };
  cache_read?: { format?: "tokens" | "percent" | "both" };
  speed?: { show?: SpeedShow };
}

export type CustomItemPosition = "left" | "right" | "secondary";

export interface StatusLineLayout {
  left?: StatusLineSegmentId[];
  right?: StatusLineSegmentId[];
  secondary?: StatusLineSegmentId[];
  /** Rounded frame only: footer pills under the frame, before the extension statuses. A group renders as one pill. */
  footer?: StatusLineSegmentId[][];
  /** Rounded frame only: one pill flush right on the footer row, reserved before the footer items fit. */
  footerRight?: StatusLineSegmentId[];
}

export interface CustomStatusItem {
  id: string;
  statusKey: string;
  position: CustomItemPosition;
  color?: ColorValue;
  selfColorize: boolean;
  prefix?: string;
  /** Glyph placed before the text, with one space. Unlike `prefix`, it joins the tint when `thinkingTint` is set. */
  icon?: string;
  /** Colours the text by the thinking level it names, with Pi's border tint for that level, in bold. */
  thinkingTint?: boolean;
  hideWhenMissing: boolean;
  excludeFromExtensionStatuses: boolean;
}

/** How one extension status is restyled in the footer. Patterns are case-insensitive and global. */
export interface StatusFormatRule {
  icon?: string;
  hide?: boolean;
  replace?: Array<[RegExp, string]>;
  color?: ColorValue;
  maxWidth?: number;
}

// Preset definition
export interface PresetDef {
  leftSegments: BuiltinStatusLineSegmentId[];
  rightSegments: BuiltinStatusLineSegmentId[];
  /** Secondary row segments (shown in footer, above sub bar) */
  secondarySegments?: BuiltinStatusLineSegmentId[];
  separator: StatusLineSeparatorStyle;
  segmentOptions?: StatusLineSegmentOptions;
  /** Color scheme for this preset */
  colors?: ColorScheme;
}

// Separator definition
export interface SeparatorDef {
  left: string;
  right: string;
  endCaps?: {
    left: string;
    right: string;
    useBgAsFg: boolean;
  };
}

// Git status data
export interface GitStatus {
  branch: string | null;
  staged: number;
  unstaged: number;
  untracked: number;
  /** Set when the segment reads a jj repo: the label replaces the branch and the git counts stay zero. */
  jj?: { dirty: boolean; conflict: boolean; added: number; removed: number };
}

// Usage statistics
export interface QueueSummary {
  queueCount: number;
  blockedCount: number;
  compacting: boolean;
  leadingText: string | null;
  leadingIntent: "steer" | "follow-up" | "post-compact" | null;
  leadingStatus: "queued" | "blocked" | "delivering" | "sent" | "failed" | null;
}

export interface UsageStats {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
  cost: number;
  // Cumulative cost of subagent child runs (e.g. /parallel, /worker) launched from this session.
  subagentCost: number;
}

// Context passed to segment render functions
export interface SegmentContext {
  // From pi-mono
  model: {
    id: string;
    name?: string;
    provider?: string;
    providerId?: string;
    providerName?: string;
    reasoning?: boolean;
    contextWindow?: number;
  } | undefined;
  thinkingLevel: string;
  sessionId: string | undefined;
  sessionName?: string;
  cwd?: string;
  
  // Computed
  usageStats: UsageStats;
  contextTokens: number | null;
  contextPercent: number | null;
  contextWindow: number;
  contextApproximate: boolean;
  /** The Vim backend's mode label, fitted to the width handed in; absent when no backend supplies one. */
  frameLabel?: (width: number) => string | undefined;
  autoCompactEnabled: boolean;
  customCompactionEnabled: boolean;
  usingSubscription: boolean;
  queueSummary: QueueSummary;
  sessionStartTime: number;
  shellModeActive: boolean;
  shellRunning: boolean;
  shellName: string | null;
  shellCwd: string | null;
  
  // Git
  git: GitStatus;
  
  /** The latest completed request's generation speed; absent until one completes. */
  speed?: SpeedSample;
  /** The running or last finished tool, or idle before any has run. */
  tool: ToolActivity;
  /** User-role messages on the session branch: pi-starship's turn count. */
  userTurnCount: number;

  // Extension statuses
  extensionStatuses: ReadonlyMap<string, string>;
  hiddenExtensionStatusKeys: ReadonlySet<string>;
  statusFormats: ReadonlyMap<string, StatusFormatRule>;
  statusOrder: readonly string[];
  customItemsById: ReadonlyMap<string, CustomStatusItem>;
  
  // Options
  options: StatusLineSegmentOptions;
  
  // Theming
  theme: ThemeLike;
  colors: ColorScheme;
}

// Rendered segment output
export interface RenderedSegment {
  content: string;
  visible: boolean;
  /** The pill colour when the segment has a state colour, such as the tool segment's. */
  color?: ColorValue;
}

// Segment definition
export interface StatusLineSegment {
  id: BuiltinStatusLineSegmentId;
  render(ctx: SegmentContext): RenderedSegment;
}
