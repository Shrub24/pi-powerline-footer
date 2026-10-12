// ANSI escape codes for colors
// Matching oh-my-pi dark theme colors exactly

export interface AnsiColors {
  getBgAnsi(r: number, g: number, b: number): string;
  getFgAnsi(r: number, g: number, b: number): string;
  getFgAnsi256(code: number): string;
  reset: string;
}

export const ansi: AnsiColors = {
  getBgAnsi: (r, g, b) => `\x1b[48;2;${r};${g};${b}m`,
  getFgAnsi: (r, g, b) => `\x1b[38;2;${r};${g};${b}m`,
  getFgAnsi256: (code) => `\x1b[38;5;${code}m`,
  reset: "\x1b[0m",
};

// Convert hex to RGB tuple
function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// Colors used by welcome/editor chrome rendering
const THEME = {
  sep: 244,               // ANSI 256 gray
  model: "#d787af",       // Pink/mauve
  path: "#00afaf",        // Teal/cyan
  gitClean: "#5faf5f",    // Green
  accent: "#febc38",      // Orange
  queue: "#febc38",       // Orange
};

// Color name to ANSI code mapping
type ColorName = keyof typeof THEME;

function getAnsiCode(color: ColorName): string {
  const value = THEME[color as keyof typeof THEME];
  
  if (value === undefined || value === "") {
    return ""; // No color, use terminal default
  }
  
  if (typeof value === "number") {
    return ansi.getFgAnsi256(value);
  }
  
  if (typeof value === "string" && value.startsWith("#")) {
    const [r, g, b] = hexToRgb(value);
    return ansi.getFgAnsi(r, g, b);
  }
  
  return "";
}

/**
 * A background escape for a theme token: its foreground colour escape with 38 turned into 48, so it
 * follows the Pi theme. A hex colour is used as given. Undefined when the token has no colour: Pi's
 * bundled theme can resolve a token to the terminal default, which is only a dim attribute.
 */
export function themeForegroundEscape(theme: { getFgAnsi(token: string): string }, token: string): string | undefined {
  if (token.startsWith("#")) {
    const [r, g, b] = hexToRgb(token);
    return ansi.getFgAnsi(r, g, b);
  }
  try {
    return theme.getFgAnsi(token).match(/^\x1b\[38;[\d;]*m/)?.[0];
  } catch {
    return undefined;
  }
}

export function themeBackgroundEscape(theme: { getFgAnsi(token: string): string }, token: string): string | undefined {
  return themeForegroundEscape(theme, token)?.replace("\x1b[38;", "\x1b[48;");
}

/** Bold text whose full resets (`ESC[0m`) inside it keep the bold on. */
export function boldText(text: string): string {
  return `\x1b[1m${text.split("\x1b[0m").join("\x1b[0m\x1b[1m")}\x1b[22m`;
}

// Helper to apply foreground color only (no reset - caller manages reset)
export function fgOnly(color: ColorName, text: string): string {
  const code = getAnsiCode(color);
  return code ? `${code}${text}` : text;
}

// Get raw ANSI code for a color
export function getFgAnsiCode(color: ColorName): string {
  return getAnsiCode(color);
}

