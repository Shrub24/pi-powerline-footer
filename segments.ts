import { hostname as osHostname } from "node:os";
import { basename } from "node:path";
import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import type { BuiltinStatusLineSegmentId, ColorValue, RenderedSegment, SegmentContext, SemanticColor, StatusLineSegment, StatusLineSegmentId, ThemeLike } from "./types.ts";
import { boldText } from "./colors.ts";
import { joinStatuses, type StatusBlock } from "./footer-statuses.ts";
import { speedText } from "./speed.ts";
import { formatExtensionStatus, normalizeExtensionStatusValue } from "./powerline-config.ts";
import { fg, applyColor } from "./theme.ts";
import { getIcons, SEP_DOT, getThinkingText } from "./icons.ts";
import { formatUsdCost } from "./currency-rates.ts";
import { getGitRemoteHost } from "./git-status.ts";
import type { IconSet } from "./icons.ts";
import type { GitHost } from "./git-status.ts";

function color(ctx: SegmentContext, semantic: SemanticColor, text: string): string {
  return fg(ctx.theme, semantic, text, ctx.colors);
}

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

function withIcon(icon: string, text: string): string {
  return icon ? `${icon} ${text}` : text;
}

function formatTokens(n: number): string {
  if (n < 1000) return n.toString();
  if (n < 10000) return `${(n / 1000).toFixed(1)}k`;
  if (n < 1000000) return `${Math.round(n / 1000)}k`;
  if (n < 10000000) return `${(n / 1000000).toFixed(1)}M`;
  return `${Math.round(n / 1000000)}M`;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m${seconds % 60}s`;
  return `${seconds}s`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Segment Implementations
// ═══════════════════════════════════════════════════════════════════════════

const modelSegment: StatusLineSegment = {
  id: "model",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.model ?? {};

    let modelName = ctx.model?.name || ctx.model?.id || "no-model";
    if (opts.display === "qualified" && ctx.model?.id) {
      const provider = ctx.model.provider || ctx.model.providerId || ctx.model.providerName;
      modelName = provider && !ctx.model.id.startsWith(`${provider}/`) ? `${provider}/${ctx.model.id}` : ctx.model.id;
    } else if (modelName.startsWith("Claude ")) {
      modelName = modelName.slice(7);
    }

    let content = withIcon(icons.model, modelName);

    if (opts.showThinkingLevel !== false && ctx.model?.reasoning) {
      const level = ctx.thinkingLevel || "off";
      if (level !== "off") {
        const thinkingText = getThinkingText(level);
        if (thinkingText) {
          content += `${SEP_DOT}${thinkingText}`;
        }
      }
    }

    return { content: color(ctx, "model", content), visible: true };
  },
};

const shellModeSegment: StatusLineSegment = {
  id: "shell_mode",
  render(ctx) {
    if (!ctx.shellModeActive) {
      return { content: "", visible: false };
    }

    const shellName = ctx.shellName ?? "shell";
    const state = ctx.shellRunning ? "run" : "idle";
    const cwd = ctx.shellCwd ? basename(ctx.shellCwd) : null;
    const parts = [shellName, state];
    if (cwd) {
      parts.push(cwd);
    }

    return { content: color(ctx, "shellMode", parts.join(SEP_DOT)), visible: true };
  },
};

const pathSegment: StatusLineSegment = {
  id: "path",
  render(ctx) {
    const opts = ctx.options.path ?? {};
    const mode = opts.mode ?? "basename";

    let pwd = ctx.shellModeActive && ctx.shellCwd ? ctx.shellCwd : (ctx.cwd ?? process.cwd());
    const home = process.env.HOME || process.env.USERPROFILE;

    if (mode === "basename") {
      // Just the last directory component (cross-platform)
      pwd = basename(pwd) || pwd;
    } else {
      // Abbreviate home directory for abbreviated/full modes
      if (home && pwd.startsWith(home)) {
        pwd = `~${pwd.slice(home.length)}`;
      }

      // Strip /work/ prefix (common in containers)
      if (pwd.startsWith("/work/")) {
        pwd = pwd.slice(6);
      }

      // Truncate if too long (only for abbreviated mode)
      if (mode === "abbreviated") {
        const maxLen = opts.maxLength ?? 40;
        if (pwd.length > maxLen) {
          pwd = `…${pwd.slice(-(maxLen - 1))}`;
        }
      }
    }

    return { content: color(ctx, "path", pwd), visible: true };
  },
};

/**
 * Icon for the branch label: the origin remote's host logo when hostIcon is
 * enabled and a remote is known, otherwise the plain branch icon. An
 * unrecognized remote falls back to the generic git logo.
 */
function resolveBranchIcon(icons: IconSet, hostIcon: boolean, cwd: string | undefined): string {
  if (!hostIcon) return icons.branch;
  const host = getGitRemoteHost(cwd);
  const byHost: Record<GitHost, string> = {
    github: icons.github,
    gitlab: icons.gitlab,
    bitbucket: icons.bitbucket,
    other: icons.git,
  };
  return host ? byHost[host] : icons.branch;
}

const gitSegment: StatusLineSegment = {
  id: "git",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.git ?? {};
    const { branch, staged, unstaged, untracked, jj } = ctx.git;
    const gitStatus = (staged > 0 || unstaged > 0 || untracked > 0) 
      ? { staged, unstaged, untracked } 
      : null;

    if (!branch && !gitStatus) return { content: "", visible: false };

    const isDirty = jj ? jj.dirty : gitStatus && (gitStatus.staged > 0 || gitStatus.unstaged > 0 || gitStatus.untracked > 0);
    const showBranch = opts.showBranch !== false;
    const branchColor: SemanticColor = isDirty ? "gitDirty" : "gitClean";

    // Build content - color branch separately from indicators
    let content = "";
    if (showBranch && branch) {
      // Color just the branch name (icon + branch text)
      const branchIcon = resolveBranchIcon(icons, opts.hostIcon === true, ctx.cwd);
      content = color(ctx, branchColor, withIcon(branchIcon, branch));
    }

    // Add status indicators (each with their own color, not wrapped)
    const indicators: string[] = [];
    if (gitStatus) {
      if (opts.showUnstaged !== false && gitStatus.unstaged > 0) {
        indicators.push(applyColor(ctx.theme, "warning", `*${gitStatus.unstaged}`));
      }
      if (opts.showStaged !== false && gitStatus.staged > 0) {
        indicators.push(applyColor(ctx.theme, "success", `+${gitStatus.staged}`));
      }
      if (opts.showUntracked !== false && gitStatus.untracked > 0) {
        indicators.push(applyColor(ctx.theme, "muted", `?${gitStatus.untracked}`));
      }
    }
    // jj has no index: the working copy's line counts stand in for staged and unstaged. A dirty
    // working copy with no line counts (e.g. a rename only) keeps the bare marker.
    if (jj && opts.showUnstaged !== false && (jj.added > 0 || jj.removed > 0)) {
      indicators.push(applyColor(ctx.theme, "success", `+${jj.added}`), applyColor(ctx.theme, "error", `-${jj.removed}`));
    } else if (jj?.dirty) {
      indicators.push(applyColor(ctx.theme, "warning", "*"));
    }
    if (jj?.conflict) indicators.push(applyColor(ctx.theme, "error", "✖"));
    if (indicators.length > 0) {
      const indicatorText = indicators.join(" ");
      if (!content && showBranch === false) {
        // No branch shown, color the git icon with branch color
        content = color(ctx, branchColor, icons.git ? `${icons.git} ` : "") + indicatorText;
      } else {
        content += content ? ` ${indicatorText}` : indicatorText;
      }
    }

    if (!content) return { content: "", visible: false };

    return { content, visible: true };
  },
};

const thinkingSegment: StatusLineSegment = {
  id: "thinking",
  render(ctx) {
    const level = ctx.thinkingLevel || "off";
    const levelText: Record<string, string> = {
      off: "off",
      minimal: "min",
      low: "low",
      medium: "med",
      high: "high",
      xhigh: "xhigh",
    };
    // The same tint the editor border takes for this level, so the segment and the border agree.
    const tint = ctx.theme.getThinkingBorderColor(level as Parameters<ThemeLike["getThinkingBorderColor"]>[0]);
    return { content: boldText(tint(`think:${levelText[level] || level}`)), visible: true };
  },
};

const subagentsSegment: StatusLineSegment = {
  id: "subagents",
  render() {
    // Note: pi-mono doesn't have subagent tracking built-in
    // This would require extension state management
    // For now, return not visible
    return { content: "", visible: false };
  },
};

const queueSegment: StatusLineSegment = {
  id: "queue",
  render(ctx) {
    const summary = ctx.queueSummary;
    const parts: string[] = [];

    if (summary.compacting && summary.queueCount > 0) {
      parts.push(`compact q ${summary.queueCount}`);
    } else if (summary.queueCount > 0) {
      parts.push(`q ${summary.queueCount}`);
    }


    if (summary.blockedCount > 0) {
      parts.push(`blocked ${summary.blockedCount}`);
    }

    if (parts.length === 0) return { content: "", visible: false };
    return { content: color(ctx, "queue", parts.join(SEP_DOT)), visible: true };
  },
};

const tokenInSegment: StatusLineSegment = {
  id: "token_in",
  render(ctx) {
    const icons = getIcons();
    const { input } = ctx.usageStats;
    if (!input) return { content: "", visible: false };

    const content = withIcon(icons.input, formatTokens(input));
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

const tokenOutSegment: StatusLineSegment = {
  id: "token_out",
  render(ctx) {
    const icons = getIcons();
    const { output } = ctx.usageStats;
    if (!output) return { content: "", visible: false };

    const content = withIcon(icons.output, formatTokens(output));
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

// Shell names nix-shell and nix develop set for their own generic shells; they say nothing about the project.
const GENERIC_NIX_SHELL_NAMES = new Set(["nix-shell", "nix-shell-env", "shell"]);

/** `impure` or `pure` from IN_NIX_SHELL, then the shell's name when it is specific. Undefined outside a nix shell. */
export function nixShellText(env: NodeJS.ProcessEnv): string | undefined {
  const state = env.IN_NIX_SHELL;
  if (state !== "pure" && state !== "impure") return undefined;
  const name = env.name?.trim();
  return name && !GENERIC_NIX_SHELL_NAMES.has(name) ? `${state}${SEP_DOT}${name}` : state;
}

// The nix shell Pi was launched in, read from the environment on each render: no process is spawned.
const nixSegment: StatusLineSegment = {
  id: "nix",
  render(ctx) {
    const text = nixShellText(process.env);
    if (!text) return { content: "", visible: false };
    return { content: color(ctx, "path", `${getIcons().nix} ${text}`), visible: true };
  },
};

// The tool state, always shown: the running tool, else the last one that finished, else idle. Its colour
// is the pill colour in the footer; the text carries the same colour elsewhere.
const TOOL_STATE_TOKEN = { idle: "muted", running: "warning", done: "success", failed: "error" } as const;

const toolSegment: StatusLineSegment = {
  id: "tool",
  render(ctx) {
    const icons = getIcons();
    const activity = ctx.tool;
    const token = TOOL_STATE_TOKEN[activity.state];
    const icon = { idle: icons.toolIdle, running: icons.toolRunning, done: icons.toolDone, failed: icons.toolFailed }[activity.state];
    const label = activity.state === "idle" ? "idle" : `${activity.name}${activity.others > 0 ? ` +${activity.others}` : ""}`;
    return { content: applyColor(ctx.theme, token, [icon, label].filter(Boolean).join(" ")), visible: true, color: token };
  },
};

// Generation speed of the latest completed request: tokens per second, then time to first token.
const speedSegment: StatusLineSegment = {
  id: "speed",
  render(ctx) {
    const text = speedText(ctx.speed, ctx.options.speed?.show ?? "both");
    if (!text) return { content: "", visible: false };
    return { content: color(ctx, "tokens", `${getIcons().speed} ${text}`), visible: true };
  },
};

// Input and output together, unlabelled: ↑ is what was sent, ↓ what came back.
const tokensSegment: StatusLineSegment = {
  id: "tokens",
  render(ctx) {
    const { input, output } = ctx.usageStats;
    if (!input && !output) return { content: "", visible: false };

    const content = `↑${formatTokens(input)} ↓${formatTokens(output)}`;
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

const tokenTotalSegment: StatusLineSegment = {
  id: "token_total",
  render(ctx) {
    const icons = getIcons();
    const { input, output, cacheRead, cacheWrite } = ctx.usageStats;
    const total = input + output + cacheRead + cacheWrite;
    if (!total) return { content: "", visible: false };

    const content = withIcon(icons.tokens, formatTokens(total));
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

/** Marks cost that comes from a subscription login rather than per-request billing. */
const SUBSCRIPTION_MARKER = "↻";

const costSegment: StatusLineSegment = {
  id: "cost",
  render(ctx) {
    const cost = ctx.usageStats.cost + (ctx.usageStats.subagentCost ?? 0);
    const usingSubscription = ctx.usingSubscription;

    if (!cost && !usingSubscription) {
      return { content: "", visible: false };
    }

    // Where the icon set has a cost icon it takes the place of a leading dollar sign; other symbols stay.
    const icon = getIcons().cost;
    const shown = (text: string) => ({
      content: color(ctx, "cost", withIcon(icon, icon ? text.replace(/^\$/, "") : text)),
      visible: true,
    });
    const reportedCost = cost > 0 ? formatUsdCost(cost, ctx.options.cost?.currency) : null;
    if (!usingSubscription) {
      return reportedCost ? shown(reportedCost) : { content: "", visible: false };
    }

    // Subscription usage is priced from the model catalogue like any other, so the figure is shown with a marker.
    const subscriptionDisplay = ctx.options.cost?.subscriptionDisplay ?? "both";
    const subscriptionCost = formatUsdCost(cost, ctx.options.cost?.currency);
    if (subscriptionDisplay === "subscription") return shown(SUBSCRIPTION_MARKER);
    if (subscriptionDisplay === "reported-cost") return shown(subscriptionCost ?? SUBSCRIPTION_MARKER);
    return shown(`${subscriptionCost ?? "--"} ${SUBSCRIPTION_MARKER}`);
  },
};

const contextPctSegment: StatusLineSegment = {
  id: "context_pct",
  render(ctx) {
    if (ctx.customCompactionEnabled) return { content: "", visible: false };

    const icons = getIcons();
    const { contextTokens, contextPercent, contextWindow } = ctx;

    const autoIcon = ctx.autoCompactEnabled && icons.auto ? ` ${icons.auto}` : "";
    const percentOnly = ctx.options.context?.format === "percent";
    const hasKnownUsage = contextTokens !== null && contextPercent !== null;
    const approximate = ctx.contextApproximate ? "~" : "";
    // "full" (default): tokens/window + one-decimal percentage + auto-compact icon.
    // "percent": bare rounded percentage, threshold-colored, no icons.
    const text = percentOnly
      ? (hasKnownUsage ? `${approximate}${Math.round(contextPercent)}%` : "?")
      : hasKnownUsage
        ? `${approximate}${formatTokens(contextTokens)}/${formatTokens(contextWindow)} (${contextPercent.toFixed(1)}%)${autoIcon}`
        : `?/${formatTokens(contextWindow)}${autoIcon}`;

    // Icon outside color, text inside - use semantic colors for thresholds
    let content: string;
    const colored = (semantic: "context" | "contextWarn" | "contextError") =>
      percentOnly ? color(ctx, semantic, text) : withIcon(icons.context, color(ctx, semantic, text));
    if (hasKnownUsage && contextPercent > 90) {
      content = colored("contextError");
    } else if (hasKnownUsage && contextPercent > 70) {
      content = colored("contextWarn");
    } else {
      content = colored("context");
    }

    return { content, visible: true };
  },
};

const contextTotalSegment: StatusLineSegment = {
  id: "context_total",
  render(ctx) {
    if (ctx.customCompactionEnabled) return { content: "", visible: false };

    const icons = getIcons();
    const window = ctx.contextWindow;
    if (!window) return { content: "", visible: false };

    return {
      content: color(ctx, "context", withIcon(icons.context, formatTokens(window))),
      visible: true,
    };
  },
};

const timeSpentSegment: StatusLineSegment = {
  id: "time_spent",
  render(ctx) {
    const icons = getIcons();
    const elapsed = Date.now() - ctx.sessionStartTime;
    if (elapsed < 1000) return { content: "", visible: false };

    return { content: withIcon(icons.time, formatDuration(elapsed)), visible: true };
  },
};

/** The session's user-turn count, read from the branch on session start and tree changes, then counted per prompt. */
const messagesSegment: StatusLineSegment = {
  id: "messages",
  render(ctx) {
    return { content: color(ctx, "tokens", withIcon(getIcons().messages, `${ctx.userTurnCount}`)), visible: true };
  },
};

const timeSegment: StatusLineSegment = {
  id: "time",
  render(ctx) {
    const icons = getIcons();
    const opts = ctx.options.time ?? {};
    const now = new Date();

    let hours = now.getHours();
    let suffix = "";
    if (opts.format === "12h") {
      suffix = hours >= 12 ? "pm" : "am";
      hours = hours % 12 || 12;
    }

    const mins = now.getMinutes().toString().padStart(2, "0");
    let timeStr = `${hours}:${mins}`;
    if (opts.showSeconds) {
      timeStr += `:${now.getSeconds().toString().padStart(2, "0")}`;
    }
    timeStr += suffix;

    return { content: withIcon(icons.time, timeStr), visible: true };
  },
};

const SESSION_NAME_MAX_WIDTH = 48;

const sessionSegment: StatusLineSegment = {
  id: "session",
  render(ctx) {
    const sessionId = ctx.sessionId;
    const name = ctx.sessionName?.trim() ? ctx.sessionName : sessionId?.slice(0, 8) || "new";
    const display = truncateToWidth(name, SESSION_NAME_MAX_WIDTH, "…");

    return { content: display, visible: true };
  },
};

const hostnameSegment: StatusLineSegment = {
  id: "hostname",
  render() {
    const icons = getIcons();
    const name = osHostname().split(".")[0];
    return { content: withIcon(icons.host, name), visible: true };
  },
};

const cacheReadSegment: StatusLineSegment = {
  id: "cache_read",
  render(ctx) {
    const icons = getIcons();
    const { cacheRead, input } = ctx.usageStats;
    if (!cacheRead) return { content: "", visible: false };

    const format = ctx.options.cache_read?.format ?? "tokens";
    const hitRate = input + cacheRead > 0
      ? ((cacheRead / (input + cacheRead)) * 100).toFixed(0)
      : "0";

    let content: string;
    if (format === "percent") {
      content = [icons.cache, `${hitRate}%`].filter(Boolean).join(" ");
    } else {
      const tokens = [icons.cache, icons.input, formatTokens(cacheRead)].filter(Boolean).join(" ");
      content = format === "both" ? `${tokens} (${hitRate}%)` : tokens;
    }
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

const cacheWriteSegment: StatusLineSegment = {
  id: "cache_write",
  render(ctx) {
    const icons = getIcons();
    const { cacheWrite } = ctx.usageStats;
    if (!cacheWrite) return { content: "", visible: false };

    const parts = [icons.cache, icons.output, formatTokens(cacheWrite)].filter(Boolean);
    const content = parts.join(" ");
    return { content: color(ctx, "tokens", content), visible: true };
  },
};

// Listed keys come first in the configured order; unlisted keys keep their publication order after them.
function orderStatusKeys(keys: Iterable<string>, order: readonly string[]): string[] {
  const rank = new Map(order.map((key, index) => [key, index]));
  const unlisted = order.length;
  return [...keys].sort((a, b) => (rank.get(a) ?? unlisted) - (rank.get(b) ?? unlisted));
}

/**
 * The extension statuses that show in the footer, formatted and ordered. Skips statuses elevated into
 * dedicated custom segments, and empty ones after formatting, so an empty value never leaves a separator.
 */
export function extensionStatusParts(ctx: Pick<SegmentContext, "extensionStatuses" | "hiddenExtensionStatusKeys" | "statusFormats" | "statusOrder">): Array<{ text: string; color?: ColorValue }> {
  const parts: Array<{ text: string; color?: ColorValue }> = [];
  for (const statusKey of orderStatusKeys(ctx.extensionStatuses.keys(), ctx.statusOrder)) {
    if (ctx.hiddenExtensionStatusKeys.has(statusKey)) continue;
    const rule = ctx.statusFormats.get(statusKey);
    const text = formatExtensionStatus(ctx.extensionStatuses.get(statusKey) ?? "", rule);
    if (text) parts.push({ text, color: rule?.color });
  }
  return parts;
}

const extensionStatusesSegment: StatusLineSegment = {
  id: "extension_statuses",
  render(ctx) {
    const statuses = ctx.extensionStatuses;
    if (!statuses || statuses.size === 0) return { content: "", visible: false };

    // Compact statuses are joined with a separator; notification-style ("[...") statuses show above the editor.
    const parts = extensionStatusParts(ctx);
    if (parts.length === 0) return { content: "", visible: false };

    return { content: joinStatuses(parts, ctx.theme), visible: true };
  },
};

/** The Vim mode label. Read live through the backend, so it is never a stale snapshot. */
const vimModeSegment: StatusLineSegment = {
  id: "vim_mode",
  render(ctx) {
    const label = ctx.frameLabel?.(Number.POSITIVE_INFINITY);
    return label ? { content: label, visible: true } : { content: "", visible: false };
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Segment Registry
// ═══════════════════════════════════════════════════════════════════════════

export const SEGMENTS: Record<BuiltinStatusLineSegmentId, StatusLineSegment> = {
  model: modelSegment,
  shell_mode: shellModeSegment,
  path: pathSegment,
  git: gitSegment,
  thinking: thinkingSegment,
  subagents: subagentsSegment,
  queue: queueSegment,
  token_in: tokenInSegment,
  token_out: tokenOutSegment,
  tokens: tokensSegment,
  speed: speedSegment,
  nix: nixSegment,
  tool: toolSegment,
  token_total: tokenTotalSegment,
  cost: costSegment,
  context_pct: contextPctSegment,
  context_total: contextTotalSegment,
  time_spent: timeSpentSegment,
  time: timeSegment,
  messages: messagesSegment,
  session: sessionSegment,
  hostname: hostnameSegment,
  cache_read: cacheReadSegment,
  cache_write: cacheWriteSegment,
  extension_statuses: extensionStatusesSegment,
  vim_mode: vimModeSegment,
};

// The level words the router and Pi use for a thinking level; `min` and `med` are short forms.
const THINKING_LEVEL_BY_WORD: Record<string, Parameters<ThemeLike["getThinkingBorderColor"]>[0]> = {
  off: "off",
  minimal: "minimal",
  min: "minimal",
  low: "low",
  medium: "medium",
  med: "medium",
  high: "high",
  xhigh: "xhigh",
  max: "max",
};

/** The thinking level a status names by its leading word, e.g. `high✎`; undefined when it names none. */
function thinkingLevelOf(status: string): Parameters<ThemeLike["getThinkingBorderColor"]>[0] | undefined {
  const word = status.replace(/\x1b\[[0-9;]*m/g, "").match(/[a-z]+/i)?.[0].toLowerCase();
  return word === undefined ? undefined : THINKING_LEVEL_BY_WORD[word];
}

function renderCustomSegment(id: `custom:${string}`, ctx: SegmentContext): RenderedSegment {
  const customItemId = id.slice("custom:".length);
  const custom = ctx.customItemsById.get(customItemId);
  if (!custom) return { content: "", visible: false };

  const rawStatus = ctx.extensionStatuses.get(custom.statusKey);
  const normalizedStatus = rawStatus ? normalizeExtensionStatusValue(rawStatus, custom.selfColorize) : null;
  if (!normalizedStatus) {
    return custom.hideWhenMissing ? { content: "", visible: false } : { content: custom.prefix ?? custom.id, visible: true };
  }

  let content = normalizedStatus;
  if (custom.prefix) {
    content = `${custom.prefix}${SEP_DOT}${content}`;
  }
  const level = custom.thinkingTint ? thinkingLevelOf(normalizedStatus) : undefined;
  if (level) {
    // The icon sits inside the tint, like the text it labels.
    const labelled = custom.icon ? `${custom.icon} ${content}` : content;
    return { content: boldText(ctx.theme.getThinkingBorderColor(level)(labelled)), visible: true };
  }
  if (custom.icon) {
    content = `${custom.icon} ${content}`;
  }
  if (custom.color && !custom.selfColorize) {
    content = applyColor(ctx.theme, custom.color, content);
  }

  return { content, visible: true };
}

function isCustomSegmentId(id: StatusLineSegmentId): id is `custom:${string}` {
  return id.startsWith("custom:");
}

/** One extension status placed in the footer, formatted by its statusFormats rule, coloured as a pill. */
function renderExtensionStatus(statusKey: string, ctx: SegmentContext): RenderedSegment {
  const rule = ctx.statusFormats.get(statusKey);
  const text = formatExtensionStatus(ctx.extensionStatuses.get(statusKey) ?? "", rule);
  return text ? { content: text, visible: true, color: rule?.color } : { content: "", visible: false };
}

export function renderSegment(id: StatusLineSegmentId, ctx: SegmentContext): RenderedSegment {
  if (isCustomSegmentId(id)) {
    return renderCustomSegment(id, ctx);
  }
  if (id.startsWith("status:")) {
    return renderExtensionStatus(id.slice("status:".length), ctx);
  }

  const segment = SEGMENTS[id as BuiltinStatusLineSegmentId];
  if (!segment) {
    return { content: "", visible: false };
  }
  return segment.render(ctx);
}

/**
 * One footer pill for a layout group: its visible segments joined by a thin separator, coloured by the
 * first segment that sets a colour. Undefined when nothing in the group shows.
 */
export function footerGroupItem(group: readonly StatusLineSegmentId[], ctx: SegmentContext): StatusBlock | undefined {
  const shown = group.map((id) => renderSegment(id, ctx)).filter((rendered) => rendered.visible && rendered.content);
  if (shown.length === 0) return undefined;
  return {
    text: shown.map((rendered) => rendered.content).join(SEP_DOT),
    color: shown.find((rendered) => rendered.color)?.color,
    members: shown.map((rendered) => ({ text: rendered.content, color: rendered.color })),
  };
}
