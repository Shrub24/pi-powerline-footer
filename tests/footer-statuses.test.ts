import test from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { renderFooterRows, renderStatusBlocks, renderStatusPills } from "../footer-statuses.ts";

// accent and success have colours; borderMuted resolves to the terminal default (dim only), like Pi's bundled theme.
const theme = {
  getFgAnsi(token: string): string {
    if (token === "accent") return "\x1b[38;5;6m";
    if (token === "success") return "\x1b[38;2;1;2;3m";
    if (token === "borderMuted") return "\x1b[2m";
    throw new Error(`Unknown theme color: ${token}`);
  },
};
const POWERLINE = "\uE0B0";
const ROUND = { left: "\uE0B6", right: "\uE0B4" };
const ASCII_CAPS = { left: "(", right: ")" };
const ACCENT_BG = "\x1b[48;5;6m";
const SUCCESS_BG = "\x1b[48;2;1;2;3m";
const ACCENT_FG = "\x1b[38;5;6m";
const BLOCK_FG = "\x1b[1m\x1b[30m";
const SUCCESS_FG = "\x1b[38;2;1;2;3m";
const DEFAULT_BG = "\x1b[49m";
const CHROME = { separator: POWERLINE, cap: ROUND };

const plainText = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");

test("plain footer bolds each item and spreads the items across the full width", () => {
  const [blank, line] = renderFooterRows([{ text: "↑1 ↓2" }, { text: "mc" }], 80, theme, "plain", CHROME);
  assert.equal(blank, "");
  assert.equal(plainText(line!), `↑1 ↓2${" ".repeat(80 - 5 - 2)}mc`);
  assert.ok(line!.startsWith("\x1b[0m\x1b[1m↑1 ↓2"), "the first item is bold");
});

test("blocks footer draws each item as a block with one space of padding, filling the width", () => {
  const [, line] = renderFooterRows([{ text: "↑1" }, { text: "mc" }], 40, theme, "blocks", CHROME);
  assert.ok(line!.startsWith(`${ACCENT_BG}${BLOCK_FG} ↑1 `), "the first block is padded by one space");
  assert.equal(visibleWidth(line!), 40);
});

test("blocks take backgrounds in rotation, dark text, and the separator in the previous block's colour", () => {
  // At the minimum gap the row is exactly its natural width: 4 + glyph + 5 + closing glyph.
  assert.equal(
    renderStatusBlocks([{ text: "mc" }, { text: "git" }], 11, theme, POWERLINE),
    `${ACCENT_BG}${BLOCK_FG} mc ${DEFAULT_BG}${ACCENT_FG}${POWERLINE}${SUCCESS_BG}${BLOCK_FG} git ${SUCCESS_FG}${DEFAULT_BG}${POWERLINE}\x1b[0m`,
  );
});

test("blocks spread the spare columns into the gap after the separator glyph", () => {
  // 9 columns of natural width and one closing glyph leave 10 columns for one gap: glyph, then 9 spaces.
  assert.equal(plainText(renderStatusBlocks([{ text: "mc" }, { text: "git" }], 20, theme, ">")), " mc >" + " ".repeat(10) + "git >");
});

test("an unresolved colour token falls back to the rotation, and empty input renders nothing", () => {
  const row = renderStatusBlocks([{ text: "x", color: "borderMuted" }], 80, theme, POWERLINE);
  assert.ok(row.startsWith(ACCENT_BG), "the dim-only token is not a background, so the rotation colour is used");
  assert.equal(renderStatusBlocks([], 80, theme, POWERLINE), "");
  assert.deepEqual(renderFooterRows([], 80, theme, "pills", CHROME), []);
  assert.deepEqual(renderFooterRows([], 80, theme, "plain", CHROME), []);
});

test("pills wrap each item in round caps with one space of padding, drawn in the item's colour", () => {
  assert.equal(
    renderStatusPills([{ text: "mc" }], 80, theme, ROUND),
    `${DEFAULT_BG}${ACCENT_FG}\uE0B6${ACCENT_BG}${BLOCK_FG} mc ${DEFAULT_BG}${ACCENT_FG}\uE0B4\x1b[0m`,
  );
});

test("pills are spread evenly across the width, with the whole row exactly as wide", () => {
  // "( mc )" is 6 columns and "( git )" is 7; the 7 spare columns form the one gap.
  const row = renderStatusPills([{ text: "mc" }, { text: "git" }], 20, theme, ASCII_CAPS);
  assert.equal(plainText(row), `( mc )${" ".repeat(7)}( git )`);
  assert.equal(visibleWidth(row), 20);
});

test("the spare columns go to the earlier gaps when they do not divide evenly", () => {
  // Three pills of 5 columns leave 3 spare columns for 2 gaps: the first gets 2, the second 1.
  const row = renderStatusPills([{ text: "a" }, { text: "b" }, { text: "c" }], 18, theme, ASCII_CAPS);
  assert.equal(plainText(row), "( a )  ( b ) ( c )");
});

test("the gap never drops below one column, and a pill is dropped only when the minimum no longer fits", () => {
  const items = [{ text: "mc" }, { text: "git" }];
  assert.equal(plainText(renderStatusPills(items, 14, theme, ASCII_CAPS)), "( mc ) ( git )", "13 natural columns plus one gap");
  assert.equal(plainText(renderStatusPills(items, 13, theme, ASCII_CAPS)), "( mc )", "the trailing pill drops whole and the rest is left-aligned");
});

test("a single pill is left-aligned rather than spread", () => {
  const row = renderStatusPills([{ text: "mc" }], 20, theme, ASCII_CAPS);
  assert.equal(plainText(row), "( mc )");
  assert.equal(visibleWidth(row), 6);
});

test("a single pill too wide for the row is cut to the width", () => {
  const row = renderStatusPills([{ text: "abcdefghijklmnop" }], 10, theme, ASCII_CAPS);
  assert.equal(plainText(row), "( abcde… )");
  assert.equal(visibleWidth(row), 10);
});

test("a single block too wide for the row is cut to the width", () => {
  const row = renderStatusBlocks([{ text: "abcdefghijklmnop" }], 10, theme, POWERLINE);
  assert.ok(visibleWidth(row) <= 10 && plainText(row).includes("…"));
});

test("trailing items drop whole, so statuses go before groups, and the kept ones fill the width", () => {
  // Round caps: alpha and beta are 9 and 8 columns, so they fit at a 3-column gap in 20; gamma does not.
  const row = renderStatusPills([{ text: "alpha" }, { text: "beta" }, { text: "gamma" }], 20, theme, ROUND);
  assert.ok(plainText(row).includes("alpha") && plainText(row).includes("beta"));
  assert.ok(!plainText(row).includes("gamma"));
  assert.equal(visibleWidth(row), 20);
});

test("blocks drop trailing items whole rather than cutting them", () => {
  const row = renderStatusBlocks([{ text: "alpha" }, { text: "beta" }, { text: "gamma" }], 12, theme, POWERLINE);
  assert.equal(plainText(row), ` alpha ${POWERLINE}`);
});

test("a pill footer renders one row below the frame, the pill left-aligned", () => {
  const [blank, line] = renderFooterRows([{ text: "mc" }], 80, theme, "pills", CHROME);
  assert.equal(blank, "");
  assert.equal(plainText(line!), "\uE0B6 mc \uE0B4");
});

test("no footer style is wider than the width it is given, and fills it exactly once two items fit", () => {
  const items = [{ text: "mc" }, { text: "git" }];
  for (const style of ["plain", "blocks", "pills"] as const) {
    for (let width = 1; width <= 60; width++) {
      const [, line] = renderFooterRows(items, width, theme, style, CHROME);
      if (!line) continue;
      assert.ok(visibleWidth(line) <= width, `${style} at ${width}`);
      if (plainText(line).includes("mc") && plainText(line).includes("git")) {
        assert.equal(visibleWidth(line), width, `${style} fills ${width}`);
      }
    }
  }
});

test("the ASCII separator set draws the same colour pairs with a plain glyph", () => {
  const row = renderStatusBlocks([{ text: "mc" }, { text: "git" }], 80, theme, ">");
  assert.ok(row.includes(`${ACCENT_FG}>`));
  assert.ok(!row.includes(POWERLINE));
  assert.ok(row.includes(`${SUCCESS_FG}${DEFAULT_BG}>`));
});

test("a group member with its own colour is drawn in that colour inside the pill, which keeps its background", () => {
  const group = {
    text: "tokens · reqcap",
    color: "accent",
    members: [{ text: "tokens", color: "accent" }, { text: "reqcap", color: "success" }],
  };
  assert.equal(
    renderStatusPills([group], 80, theme, ROUND),
    // The first member matches the background, so it keeps the dark text; reqcap is tinted.
    `${DEFAULT_BG}${ACCENT_FG}\uE0B6${ACCENT_BG}${BLOCK_FG} tokens${BLOCK_FG} · ${SUCCESS_FG}reqcap${BLOCK_FG} ${DEFAULT_BG}${ACCENT_FG}\uE0B4\x1b[0m`,
  );
});
