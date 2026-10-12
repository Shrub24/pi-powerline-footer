import { truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";
import { themeBackgroundEscape, themeForegroundEscape } from "./colors.ts";
import { SEP_DOT } from "./icons.ts";
import { applyColor } from "./theme.ts";
import type { ColorValue, ThemeLike } from "./types.ts";

export interface StatusBlock {
  text: string;
  /** Theme token or hex colour for the background. Unset or unresolved items take the rotation. */
  color?: ColorValue;
  /** A group's members, each with its own colour: drawn inside the same pill, `text` being their join. */
  members?: StatusMember[];
}

export interface StatusMember {
  text: string;
  color?: ColorValue;
}

export type FooterStyle = "plain" | "blocks" | "pills";

/** The glyphs the footer draws with: powerline arrows for `blocks`, round caps for `pills`. */
export interface FooterChrome {
  separator: string;
  cap: { left: string; right: string };
}

type Painter = { getFgAnsi(token: string): string };
/** An item at its natural width: `overhead` columns of padding and edges around its text. */
interface Piece {
  text: string;
  overhead: number;
  /** Kept only while the item is whole: a cut text no longer lines up with its members. */
  members?: StatusMember[];
}
type Painted = Piece & { background: string };

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

const naturalWidth = (piece: Piece): number => piece.overhead + visibleWidth(piece.text);

/**
 * Keeps the leading pieces that fit `available` at a one-column minimum gap, dropping trailing ones whole,
 * so statuses go before groups. A lone piece that is still too wide is cut to fit. The spare columns are
 * spread evenly over the gaps between the kept pieces; the remainder goes to the earlier gaps.
 */
function spread<T extends Piece>(pieces: T[], available: number): { kept: T[]; gaps: number[] } {
  const span = (list: Piece[]) => list.reduce((sum, piece) => sum + naturalWidth(piece), 0) + list.length - 1;
  let kept = pieces;
  while (kept.length > 1 && span(kept) > available) kept = kept.slice(0, -1);
  if (kept.length === 1 && naturalWidth(kept[0]!) > available) {
    const room = available - kept[0]!.overhead;
    kept = room > 0 ? [{ ...kept[0]!, text: truncateToWidth(kept[0]!.text, room, "…"), members: undefined }] : [];
  }

  const count = kept.length - 1;
  if (count <= 0) return { kept, gaps: [] };
  const slack = available - kept.reduce((sum, piece) => sum + naturalWidth(piece), 0);
  const base = Math.floor(slack / count);
  const extra = slack % count;
  return { kept, gaps: Array.from({ length: count }, (_, index) => base + (index < extra ? 1 : 0)) };
}

function paintAll(items: StatusBlock[], theme: Painter, overhead: number): Painted[] {
  const painted: Painted[] = [];
  items.forEach((item, index) => {
    const background = backgroundFor(theme, index, item.color);
    if (background) {
      const members = item.members?.map((member) => ({ ...member, text: member.text.replace(SGR, "") }));
      painted.push({ text: item.text.replace(SGR, ""), overhead, background, members });
    }
  });
  return painted;
}

/**
 * Powerline sections: each ` text ` on its own background with dark text. The separator glyph opens each
 * gap, and a closing glyph ends the row, so the row fills `width` exactly once two blocks fit.
 */
export function renderStatusBlocks(items: StatusBlock[], width: number, theme: Painter, glyph: string): string {
  const { kept, gaps } = spread(paintAll(items, theme, 2), width - visibleWidth(glyph));
  if (kept.length === 0) return "";

  let row = "";
  kept.forEach(({ text, background }, index) => {
    if (index > 0) {
      row += `${DEFAULT_BACKGROUND}${foregroundOf(kept[index - 1]!.background)}${glyph}${" ".repeat(gaps[index - 1]! - 1)}`;
    }
    row += `${background}${BLOCK_FOREGROUND} ${text} `;
  });
  return `${row}${foregroundOf(kept.at(-1)!.background)}${DEFAULT_BACKGROUND}${glyph}${RESET}`;
}

/**
 * A pill's text. A member with its own colour is drawn in that colour, unless it is the pill's background
 * colour, when it would vanish: such a member keeps the dark text.
 */
function pillText(text: string, members: StatusMember[] | undefined, background: string, theme: Painter): string {
  if (!members) return text;
  const backgroundForeground = foregroundOf(background);
  return members
    .map((member) => {
      const foreground = member.color ? themeForegroundEscape(theme, member.color) : undefined;
      return foreground && foreground !== backgroundForeground ? `${foreground}${member.text}${BLOCK_FOREGROUND}` : member.text;
    })
    .join(`${BLOCK_FOREGROUND}${SEP_DOT}`);
}

/** Each item as a pill: its text between round caps on a background. Fills `width` once two pills fit. */
export function renderStatusPills(items: StatusBlock[], width: number, theme: Painter, cap: FooterChrome["cap"]): string {
  const overhead = visibleWidth(cap.left) + visibleWidth(cap.right) + 2;
  const { kept, gaps } = spread(paintAll(items, theme, overhead), width);
  return kept
    .map(({ text, background, members }, index) => {
      const edge = foregroundOf(background);
      const joint = index > 0 ? " ".repeat(gaps[index - 1]!) : "";
      const inner = pillText(text, members, background, theme);
      return `${joint}${DEFAULT_BACKGROUND}${edge}${cap.left}${background}${BLOCK_FOREGROUND} ${inner} ${DEFAULT_BACKGROUND}${edge}${cap.right}${RESET}`;
    })
    .join("");
}

/** The compact plain join of extension statuses, each isolated from its neighbours' styling. */
export function joinStatuses(statuses: StatusBlock[], theme: ThemeLike): string {
  return statuses
    .map(({ text, color }) => `\x1b[0m${color ? applyColor(theme, color, text) : text}\x1b[0m`)
    .join(SEP_DOT);
}

function renderPlainLine(items: StatusBlock[], width: number, theme: ThemeLike): string {
  const pieces = items
    .filter(({ text }) => text)
    .map(({ text, color }): Piece => ({ text: color ? applyColor(theme, color, text) : text, overhead: 0 }));
  const { kept, gaps } = spread(pieces, width);
  return kept
    .map(({ text }, index) => (index > 0 ? " ".repeat(gaps[index - 1]!) : "") + bold(text))
    .join("");
}

/**
 * The footer line under the rounded frame, one row below it. Items are the footer groups followed by the
 * extension statuses; when they do not all fit at minimum gaps, trailing ones drop whole. `plain` joins
 * bold text, `blocks` and `pills` draw each item as a shape. Nothing renders when there are no items.
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
  return footerRows(renderPlainLine(items, width, theme));
}

const bold = (text: string): string => `\x1b[0m\x1b[1m${text}\x1b[0m`;

function footerRows(line: string): string[] {
  return line ? ["", line] : [];
}
