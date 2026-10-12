import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { themeBackgroundEscape } from "./colors.ts";
import { SEP_DOT } from "./icons.ts";
import { applyColor } from "./theme.ts";
import type { ColorValue, ThemeLike } from "./types.ts";

export interface StatusBlock {
  text: string;
  /** Theme token or hex colour for the background. Unset or unresolved items take the rotation. */
  color?: ColorValue;
}

export type FooterStyle = "plain" | "blocks" | "pills";

/** The glyphs the footer draws with: powerline arrows for `blocks`, round caps for `pills`. */
export interface FooterChrome {
  separator: string;
  cap: { left: string; right: string };
}

type Painter = { getFgAnsi(token: string): string };
type Painted = { text: string; background: string };

const SGR = /\x1b\[[0-9;]*m/g;
const BLOCK_FOREGROUND = "\x1b[1m\x1b[30m";
const DEFAULT_BACKGROUND = "\x1b[49m";
const RESET = "\x1b[0m";
// Backgrounds for items without a usable colour, in order.
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

// An item's edge glyphs are drawn in its own colour, so they read as the item's outline.
const foregroundOf = (background: string): string => background.replace("\x1b[48;", "\x1b[38;");

/**
 * Paints the items that fit `width`, in order. Each keeps `overhead` columns for its padding and edges,
 * and `gap` before every item after the first. `reserved` columns stay free for the row's closing edge.
 * An item is cut to the room it has; one that cannot fit whole, and everything after it, is dropped.
 */
function paintFitting(items: StatusBlock[], width: number, theme: Painter, fit: { reserved: number; overhead: number; gap: number }): Painted[] {
  const painted: Painted[] = [];
  let used = fit.reserved;
  for (const [index, item] of items.entries()) {
    const background = backgroundFor(theme, index, item.color);
    if (!background) continue;
    const gap = painted.length > 0 ? fit.gap : 0;
    const room = width - fit.reserved - fit.overhead - gap;
    const text = truncateToWidth(item.text.replace(SGR, ""), Math.max(1, room), "…");
    const itemWidth = visibleWidth(text) + fit.overhead + gap;
    if (used + itemWidth > width) break;
    used += itemWidth;
    painted.push({ text, background });
  }
  return painted;
}

/**
 * Powerline sections: each `  text  ` on its own background with dark text, joined by the separator glyph
 * with a space either side, and closed by a cap. Returns "" when nothing fits.
 */
export function renderStatusBlocks(items: StatusBlock[], width: number, theme: Painter, glyph: string): string {
  const painted = paintFitting(items, width, theme, { reserved: 1, overhead: 4, gap: 3 });
  if (painted.length === 0) return "";

  let row = "";
  painted.forEach(({ text, background }, index) => {
    if (index > 0) row += `${DEFAULT_BACKGROUND} ${foregroundOf(painted[index - 1]!.background)}${glyph} ${background}`;
    else row += background;
    row += `${BLOCK_FOREGROUND}  ${text}  `;
  });
  const last = painted[painted.length - 1]!.background;
  return `${row}${foregroundOf(last)}${DEFAULT_BACKGROUND}${glyph}${RESET}`;
}

/** Each item as a pill: its text on a background between round caps, one space between pills. Returns "" when nothing fits. */
export function renderStatusPills(items: StatusBlock[], width: number, theme: Painter, cap: FooterChrome["cap"]): string {
  const capWidth = visibleWidth(cap.left) + visibleWidth(cap.right);
  const painted = paintFitting(items, width, theme, { reserved: 0, overhead: 4 + capWidth, gap: 1 });
  return painted
    .map(({ text, background }, index) => {
      const edge = foregroundOf(background);
      const joint = index > 0 ? " " : "";
      return `${joint}${DEFAULT_BACKGROUND}${edge}${cap.left}${background}${BLOCK_FOREGROUND}  ${text}  ${DEFAULT_BACKGROUND}${edge}${cap.right}${RESET}`;
    })
    .join("");
}

/** The compact plain join of extension statuses, each isolated from its neighbours' styling. */
export function joinStatuses(statuses: StatusBlock[], theme: ThemeLike): string {
  return statuses
    .map(({ text, color }) => `\x1b[0m${color ? applyColor(theme, color, text) : text}\x1b[0m`)
    .join(SEP_DOT);
}

/**
 * The footer line under the rounded frame, one row below it. Items are the footer groups followed by the
 * extension statuses. `plain` joins them as bold text; `blocks` and `pills` draw each as a shape. Nothing
 * renders when there are no items.
 */
export function renderFooterRows(
  items: StatusBlock[],
  width: number,
  theme: ThemeLike & Painter,
  style: FooterStyle,
  chrome: FooterChrome,
): string[] {
  if (style === "pills") return footerRows(renderStatusPills(items, width, theme, chrome.cap));
  if (style === "blocks") return footerRows(renderStatusBlocks(items, width, theme, chrome.separator));
  const line = items.map(({ text, color }) => bold(color ? applyColor(theme, color, text) : text)).join("   ");
  return footerRows(line ? truncateToWidth(line, width, "…") : null);
}

const bold = (text: string): string => `\x1b[0m\x1b[1m${text}\x1b[0m`;

function footerRows(line: string | null): string[] {
  return line ? ["", line] : [];
}
