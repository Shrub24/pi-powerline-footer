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

/** The glyphs the footer draws with: `divider` joins pills, `separator` joins blocks, `cap` closes pills. */
export interface FooterChrome {
  separator: string;
  divider: string;
  cap: { left: string; right: string };
}

type Painter = { getFgAnsi(token: string): string };
type Painted = { text: string; background: string; members?: StatusMember[] };

const SGR = /\x1b\[[0-9;]*m/g;
const BLOCK_FOREGROUND = "\x1b[1m\x1b[30m";
const DEFAULT_BACKGROUND = "\x1b[49m";
const RESET = "\x1b[0m";
const PLAIN_GAP = "   ";
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

function paintAll(items: StatusBlock[], theme: Painter, first = 0): Painted[] {
  const painted: Painted[] = [];
  items.forEach((item, index) => {
    const background = backgroundFor(theme, first + index, item.color);
    if (background) {
      const members = item.members?.map((member) => ({ ...member, text: member.text.replace(SGR, "") }));
      painted.push({ text: item.text.replace(SGR, ""), background, members });
    }
  });
  return painted;
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

/** Pills as one statusline: round caps at the ends, a curved divider in the previous section's colour between neighbours. */
function pillLine(sections: Painted[], chrome: FooterChrome, theme: Painter): string {
  if (sections.length === 0) return "";
  const body = sections
    .map((section, index) => {
      const previous = sections[index - 1];
      const lead = previous
        ? `${section.background}${foregroundOf(previous.background)}${chrome.divider}`
        : `${DEFAULT_BACKGROUND}${foregroundOf(section.background)}${chrome.cap.left}`;
      return `${lead}${section.background}${BLOCK_FOREGROUND} ${pillText(section.text, section.members, section.background, theme)} `;
    })
    .join("");
  const last = sections.at(-1)!;
  return `${body}${DEFAULT_BACKGROUND}${foregroundOf(last.background)}${chrome.cap.right}${RESET}`;
}

/** Blocks as an arrow-joined statusline, each section with one space of padding and the arrow closing the row. */
function blockLine(sections: Painted[], chrome: FooterChrome, theme: Painter): string {
  if (sections.length === 0) return "";
  const body = sections
    .map((section, index) => {
      const previous = sections[index - 1];
      const lead = previous ? `${DEFAULT_BACKGROUND}${foregroundOf(previous.background)}${chrome.separator}` : "";
      return `${lead}${section.background}${BLOCK_FOREGROUND} ${pillText(section.text, section.members, section.background, theme)} `;
    })
    .join("");
  const last = sections.at(-1)!;
  return `${body}${DEFAULT_BACKGROUND}${foregroundOf(last.background)}${chrome.separator}${RESET}`;
}

/**
 * Keeps the leading items whose line fits `budget`: trailing items drop whole, so statuses go before groups.
 * A lone item that is still too wide is cut to fit.
 */
function fitItems<T extends { text: string }>(items: T[], budget: number, build: (kept: T[]) => string): T[] {
  let kept = items;
  while (kept.length > 1 && visibleWidth(build(kept)) > budget) kept = kept.slice(0, -1);
  const [only] = kept;
  if (only && visibleWidth(build(kept)) > budget) {
    const room = budget - visibleWidth(build([{ ...only, text: "" }]));
    return room > 0 ? [{ ...only, text: truncateToWidth(only.text, room, "…"), members: undefined }] : [];
  }
  return kept;
}

/** Column of the line's first cell: centred over the width, or over the room left of a reserved right item. */
function centredOffset(width: number, line: number, reserve: number): number {
  const symmetric = Math.floor((width - line) / 2);
  return width - line - symmetric >= reserve ? symmetric : Math.floor((width - reserve - line) / 2);
}

/**
 * The footer line under the rounded frame, one row below it. Items are the footer groups followed by the
 * extension statuses. `right` is one pill flush right on the same row, reserved before the items fit.
 * Pills are centred; blocks and plain are left-aligned. Nothing renders when there is nothing to show.
 */
export function renderFooterRows(
  items: StatusBlock[],
  width: number,
  theme: ThemeLike & Painter,
  style: FooterStyle,
  chrome: FooterChrome,
  right?: StatusBlock,
): string[] {
  const rightPainted = right ? paintAll([right], theme, items.length)[0] : undefined;
  const rightPill = rightPainted ? pillLine([rightPainted], chrome, theme) : "";
  const rightWidth = visibleWidth(rightPill) < width ? visibleWidth(rightPill) : 0;
  const reserve = rightWidth > 0 ? rightWidth + 1 : 0;
  const budget = width - reserve;

  let line: string;
  if (style === "plain") {
    const pieces = items
      .filter(({ text }) => text)
      .map(({ text, color }) => ({ text: color ? applyColor(theme, color, text) : text }));
    const build = (kept: typeof pieces) => kept.map(({ text }) => bold(text)).join(PLAIN_GAP);
    line = build(fitItems(pieces, budget, build));
  } else {
    const build = (kept: Painted[]) => (style === "pills" ? pillLine(kept, chrome, theme) : blockLine(kept, chrome, theme));
    line = build(fitItems(paintAll(items, theme), budget, build));
  }

  if (!line && rightWidth === 0) return [];
  const lineWidth = visibleWidth(line);
  const offset = style === "pills" ? centredOffset(width, lineWidth, reserve) : 0;
  const pad = width - offset - lineWidth - rightWidth;
  return ["", `${" ".repeat(offset)}${line}${" ".repeat(pad)}${rightWidth > 0 ? rightPill : ""}`];
}

const bold = (text: string): string => `\x1b[0m\x1b[1m${text}\x1b[0m`;

/** The compact plain join of extension statuses, each isolated from its neighbours' styling. */
export function joinStatuses(statuses: StatusBlock[], theme: ThemeLike): string {
  return statuses
    .map(({ text, color }) => `\x1b[0m${color ? applyColor(theme, color, text) : text}\x1b[0m`)
    .join(SEP_DOT);
}
