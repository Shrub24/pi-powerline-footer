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
const ACCENT_BG = "\x1b[48;5;6m";
const SUCCESS_BG = "\x1b[48;2;1;2;3m";
const ACCENT_FG = "\x1b[38;5;6m";
const BLOCK_FG = "\x1b[1m\x1b[30m";
const SUCCESS_FG = "\x1b[38;2;1;2;3m";
const CHROME = { separator: POWERLINE, cap: ROUND };

const plainText = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");

test("plain footer bolds each item and joins them with three spaces, under a blank row", () => {
  const rows = renderFooterRows([{ text: "↑1 ↓2" }, { text: "mc" }], 80, theme, "plain", CHROME);
  assert.equal(rows[0], "");
  assert.equal(plainText(rows[1]!), "↑1 ↓2   mc");
  assert.ok(rows[1]!.startsWith("\x1b[0m\x1b[1m↑1 ↓2"), "the first item is bold");
});

test("blocks footer draws each item as a block with two spaces of padding and a spaced separator", () => {
  const [, line] = renderFooterRows([{ text: "↑1" }, { text: "mc" }], 80, theme, "blocks", CHROME);
  assert.ok(line!.startsWith(`${ACCENT_BG}${BLOCK_FG}  ↑1  `), "the first block is padded by two spaces");
  assert.ok(line!.indexOf("  ↑1  ") < line!.indexOf("  mc  "));
});

test("status blocks take backgrounds in rotation, dark text, and separators in the previous block's colour", () => {
  const row = renderStatusBlocks([{ text: "mc" }, { text: "git" }], 80, theme, POWERLINE);
  assert.equal(
    row,
    `${ACCENT_BG}\x1b[1m\x1b[30m  mc  \x1b[49m ${ACCENT_FG}${POWERLINE} ${SUCCESS_BG}\x1b[1m\x1b[30m  git  ${SUCCESS_FG}\x1b[49m${POWERLINE}\x1b[0m`,
  );
});

test("an unresolved colour token falls back to the rotation, and empty input renders nothing", () => {
  const row = renderStatusBlocks([{ text: "x", color: "borderMuted" }], 80, theme, POWERLINE);
  assert.ok(row.startsWith(ACCENT_BG), "the dim-only token is not a background, so the rotation colour is used");
  assert.equal(renderStatusBlocks([], 80, theme, POWERLINE), "");
  assert.deepEqual(renderFooterRows([], 80, theme, "pills", CHROME), []);
});

test("blocks that do not fit are dropped whole, and one long block is cut to the width", () => {
  const trailing = renderStatusBlocks([{ text: "alpha" }, { text: "beta" }, { text: "gamma" }], 12, theme, POWERLINE);
  assert.ok(visibleWidth(trailing) <= 12);
  assert.ok(trailing.includes("  alpha  ") && !trailing.includes("beta") && !trailing.includes("gamma"));

  const long = renderStatusBlocks([{ text: "abcdefghijklmnop" }], 10, theme, POWERLINE);
  assert.ok(visibleWidth(long) <= 10 && long.includes("…"));
});

test("the ASCII separator set draws the same colour pairs with a plain glyph", () => {
  const row = renderStatusBlocks([{ text: "mc" }, { text: "git" }], 80, theme, ">");
  assert.ok(row.includes(`${ACCENT_FG}> ${SUCCESS_BG}`));
  assert.ok(!row.includes(POWERLINE));
});

test("pills wrap each item in round caps drawn in its colour, with the text on the background", () => {
  assert.equal(
    renderStatusPills([{ text: "mc" }], 80, theme, ROUND),
    `\x1b[49m${ACCENT_FG}\uE0B6${ACCENT_BG}${BLOCK_FG}  mc  \x1b[49m${ACCENT_FG}\uE0B4\x1b[0m`,
  );
});

test("pills in the ASCII set are bracketed by parentheses and separated by one space", () => {
  const row = renderStatusPills([{ text: "mc" }, { text: "git" }], 80, theme, { left: "(", right: ")" });
  assert.equal(plainText(row), "(  mc  ) (  git  )");
});

test("pills drop whole when they do not fit and keep within the width", () => {
  const cut = renderStatusPills([{ text: "abcdefghijklmnop" }], 10, theme, ROUND);
  assert.ok(visibleWidth(cut) <= 10 && cut.includes("…"));

  const trailing = renderStatusPills([{ text: "alpha" }, { text: "beta" }, { text: "gamma" }], 20, theme, ROUND);
  assert.ok(visibleWidth(trailing) <= 20 && plainText(trailing).includes("alpha") && !plainText(trailing).includes("gamma"));
});

test("a pill footer renders one row below the frame", () => {
  const [blank, line] = renderFooterRows([{ text: "mc" }], 80, theme, "pills", CHROME);
  assert.equal(blank, "");
  assert.equal(plainText(line!), "\uE0B6  mc  \uE0B4");
});
