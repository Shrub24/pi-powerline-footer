import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { themeBackgroundEscape } from "./colors.ts";
import { SEP_DOT } from "./icons.ts";
import { applyColor } from "./theme.ts";
import type { ColorValue, ThemeLike } from "./types.ts";

export interface StatusBlock {
  text: string;
  /** Theme token or hex colour for the block background. Unset or unresolved blocks take the rotation. */
  color?: ColorValue;
}

type Painter = { getFgAnsi(token: string): string };

const SGR = /\x1b\[[0-9;]*m/g;
const BLOCK_FOREGROUND = "\x1b[1m\x1b[30m";
const RESET = "\x1b[0m";
// Backgrounds for blocks without a usable colour, in order.
const ROTATION = ["accent", "success", "warning", "borderAccent", "customMessageLabel"];

function backgroundFor(theme: Painter, index: number, color: string | undefined): string | undefined {
  const start = index % ROTATION.length;
  const candidates = [color, ...ROTATION.slice(start), ...ROTATION.slice(0, start)];
  for (const token of candidates) {
    const background = token ? themeBackgroundEscape(theme, token) : undefined;
    if (background) return background;
  }
  return undefined;
}

// The separator is drawn in the previous block's colour on the next block's background.
const foregroundOf = (background: string): string => background.replace("\x1b[48;", "\x1b[38;");

/**
 * Renders status blocks as powerline sections: each ` text ` on its own background with dark text,
 * joined by the separator glyph and closed by a cap. Trailing blocks are dropped whole to fit `width`.
 * Returns "" when nothing fits.
 */
export function renderStatusBlocks(blocks: StatusBlock[], width: number, theme: Painter, glyph: string): string {
  const painted: Array<{ text: string; background: string }> = [];
  let used = 1; // the closing cap
  for (const [index, block] of blocks.entries()) {
    const background = backgroundFor(theme, index, block.color);
    if (!background) continue;
    const text = truncateToWidth(block.text.replace(SGR, ""), Math.max(1, width - 4), "…");
    const separator = painted.length > 0 ? 1 : 0;
    const blockWidth = visibleWidth(text) + 2 + separator;
    if (used + blockWidth > width) break;
    used += blockWidth;
    painted.push({ text, background });
  }
  if (painted.length === 0) return "";

  let row = "";
  painted.forEach(({ text, background }, index) => {
    row += index === 0 ? background : `${foregroundOf(painted[index - 1]!.background)}${background}${glyph}`;
    row += `${BLOCK_FOREGROUND} ${text} `;
  });
  const last = painted[painted.length - 1]!.background;
  return `${row}${foregroundOf(last)}\x1b[49m${glyph}${RESET}`;
}

/** The compact plain join of extension statuses, each isolated from its neighbours' styling. */
export function joinStatuses(statuses: StatusBlock[], theme: ThemeLike): string {
  return statuses
    .map(({ text, color }) => `\x1b[0m${color ? applyColor(theme, color, text) : text}\x1b[0m`)
    .join(SEP_DOT);
}

/**
 * The footer line under the rounded frame: the footer segments, then the extension statuses. Blocks
 * style makes each one a block; plain joins them as text. Nothing renders when both are empty, and a
 * non-empty line sits one blank row below the frame.
 */
export function renderFooterRows(
  content: { segments: string[]; statuses: StatusBlock[] },
  width: number,
  theme: ThemeLike & Painter,
  style: "plain" | "blocks",
  glyph: string,
): string[] {
  if (style === "blocks") {
    const blocks = [...content.segments.map((text) => ({ text })), ...content.statuses];
    return footerRows(renderStatusBlocks(blocks, width, theme, glyph));
  }
  const line = [...content.segments, joinStatuses(content.statuses, theme)].filter(Boolean).join(" ");
  return footerRows(line ? truncateToWidth(line, width, "…") : null);
}

function footerRows(line: string | null): string[] {
  return line ? ["", line] : [];
}
