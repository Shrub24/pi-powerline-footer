import { loadThemeConfig } from "./theme.ts";

export interface IconSet {
  pi: string;
  model: string;
  folder: string;
  branch: string;
  git: string;
  github: string;
  gitlab: string;
  bitbucket: string;
  tokens: string;
  context: string;
  cost: string;
  messages: string;
  time: string;
  agents: string;
  cache: string;
  speed: string;
  nix: string;
  toolRunning: string;
  toolDone: string;
  toolFailed: string;
  toolIdle: string;
  capLeft: string;
  capRight: string;
  pillDivider: string;
  input: string;
  output: string;
  host: string;
  session: string;
  auto: string;
  warning: string;
}

// Separator characters
export const SEP_DOT = " · ";

// Thinking level display text (Unicode/ASCII)
export const THINKING_TEXT_UNICODE: Record<string, string> = {
  minimal: "[min]",
  low: "[low]",
  medium: "[med]",
  high: "[high]",
  xhigh: "[xhi]",
};

// Thinking level display text (Nerd Fonts - with icons)
export const THINKING_TEXT_NERD: Record<string, string> = {
  minimal: "\u{F0E7} min",   // lightning bolt
  low: "\u{F10C} low",       // circle outline
  medium: "\u{F192} med",    // dot circle
  high: "\u{F111} high",     // circle
  xhigh: "\u{F06D} xhi",     // fire
};

// Get thinking text based on font support
export function getThinkingText(level: string): string | undefined {
  if (hasNerdFonts()) {
    return THINKING_TEXT_NERD[level];
  }
  return THINKING_TEXT_UNICODE[level];
}

// Nerd Font icons (matching oh-my-pi exactly)
export const NERD_ICONS: IconSet = {
  pi: "\uE22C",         // nf-oct-pi (stylized pi icon)
  model: "\uEC19",      // nf-md-chip (model/AI chip)
  folder: "\uF115",     // nf-fa-folder_open
  branch: "\uF126",     // nf-fa-code_fork (git branch)
  git: "\uF1D3",        // nf-fa-git (git logo)
  github: "\uF09B",     // nf-fa-github (octocat)
  gitlab: "\uF296",     // nf-fa-gitlab (tanuki)
  bitbucket: "\uF171",  // nf-fa-bitbucket
  tokens: "\uE26B",     // nf-seti-html (tokens symbol)
  context: "\uF1C0",    // nf-fa-database (stable Nerd Fonts v3 database)
  cost: "\uF155",       // nf-fa-dollar
  messages: "\u{F0361}", // md-message
  time: "\uF017",       // nf-fa-clock_o
  agents: "\uF0C0",     // nf-fa-users
  cache: "\uF1C0",      // nf-fa-database (cache)
  speed: "\u{F04C5}",    // nf-md-speedometer
  nix: "\uF313",         // nf-linux-nixos
  toolRunning: "\u{F042E}",
  toolDone: "\uF00C",     // nf-fa-check
  toolFailed: "\uF00D",   // nf-fa-times
  toolIdle: "\u{F04B2}",  // nf-md-sleep
  capLeft: "\uE0B6",      // round cap, left edge of a footer pill
  capRight: "\uE0B4",     // round cap, right edge of a footer pill
  pillDivider: "\uE0B4",  // round cap, joins neighbouring footer sections
  input: "\uF090",      // nf-fa-sign_in (input arrow)
  output: "\uF08B",     // nf-fa-sign_out (output arrow)
  host: "\uF109",       // nf-fa-laptop (host)
  session: "\uF550",    // nf-md-identifier (session id)
  auto: "\u{F0068}",    // nf-md-lightning_bolt (auto-compact)
  warning: "\uF071",    // nf-fa-warning
};

// ASCII/Unicode fallback icons (matching oh-my-pi)
export const ASCII_ICONS: IconSet = {
  pi: "π",
  model: "",
  folder: "dir",
  branch: "⎇",
  git: "⎇",
  github: "⎇",
  gitlab: "⎇",
  bitbucket: "⎇",
  tokens: "⊛",
  context: "◫",
  cost: "",
  messages: "msg",
  time: "◷",
  agents: "AG",
  cache: "cache",
  speed: "~",
  nix: "nix",
  toolRunning: "*",
  toolDone: "ok",
  toolFailed: "x",
  toolIdle: "",
  capLeft: "(",
  capRight: ")",
  pillDivider: "|",
  input: "in:",
  output: "out:",
  host: "host",
  session: "id",
  auto: "AC",
  warning: "!",
};

type PartialIconSet = Partial<IconSet>;

function sanitizeUserIconOverrides(value: unknown): PartialIconSet {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  const sanitized: PartialIconSet = {};
  const validKeys = Object.keys(NERD_ICONS) as Array<keyof IconSet>;
  for (const key of validKeys) {
    const icon = Reflect.get(value, key);
    if (typeof icon === "string") {
      sanitized[key] = icon;
    }
  }

  return sanitized;
}

// Separator characters
export interface SeparatorChars {
  powerlineLeft: string;
  powerlineRight: string;
  powerlineThinLeft: string;
  powerlineThinRight: string;
  slash: string;
  pipe: string;
  block: string;
  space: string;
  asciiLeft: string;
  asciiRight: string;
  dot: string;
}

export const NERD_SEPARATORS: SeparatorChars = {
  powerlineLeft: "\uE0B0",    // 
  powerlineRight: "\uE0B2",   // 
  powerlineThinLeft: "\uE0B1", // 
  powerlineThinRight: "\uE0B3", // 
  slash: "/",
  pipe: "|",
  block: "█",
  space: " ",
  asciiLeft: ">",
  asciiRight: "<",
  dot: "·",
};

export const ASCII_SEPARATORS: SeparatorChars = {
  powerlineLeft: ">",
  powerlineRight: "<",
  powerlineThinLeft: "|",
  powerlineThinRight: "|",
  slash: "/",
  pipe: "|",
  block: "#",
  space: " ",
  asciiLeft: ">",
  asciiRight: "<",
  dot: ".",
};

// Infer Nerd Font support from environment overrides and terminal-name heuristics.
export function hasNerdFonts(): boolean {
  // User can set this env var to force Nerd Fonts
  if (process.env.POWERLINE_NERD_FONTS === "1") return true;
  if (process.env.POWERLINE_NERD_FONTS === "0") return false;
  
  // Check for Ghostty (survives into tmux via GHOSTTY_RESOURCES_DIR)
  if (process.env.GHOSTTY_RESOURCES_DIR) return true;
  
  // Use TERM only when TERM_PROGRAM is unset (e.g. kitty uses TERM=xterm-kitty).
  // Terminal names are a heuristic, not detection of the configured font.
  const term = (process.env.TERM_PROGRAM ?? process.env.TERM ?? "").toLowerCase();
  const nerdTerms = ["iterm", "wezterm", "kitty", "ghostty", "alacritty", "kaku"];
  return nerdTerms.some(t => term.includes(t));
}

export function getIcons(): IconSet {
  const baseIcons = hasNerdFonts() ? NERD_ICONS : ASCII_ICONS;
  return {
    ...baseIcons,
    ...sanitizeUserIconOverrides(loadThemeConfig().icons),
  };
}

export function getSeparatorChars(): SeparatorChars {
  return hasNerdFonts() ? NERD_SEPARATORS : ASCII_SEPARATORS;
}
