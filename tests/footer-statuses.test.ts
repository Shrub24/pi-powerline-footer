import test from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { footerRows, renderStatusBlocks } from "../footer-statuses.ts";

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
const ACCENT_BG = "\x1b[48;5;6m";
const SUCCESS_BG = "\x1b[48;2;1;2;3m";
const ACCENT_FG = "\x1b[38;5;6m";
const SUCCESS_FG = "\x1b[38;2;1;2;3m";

test("the footer statuses line sits one row below the frame, and only when there are statuses", () => {
  assert.deepEqual(footerRows(null), []);
  assert.deepEqual(footerRows("statuses"), ["", "statuses"]);
});

test("status blocks take backgrounds in rotation, dark text, and separators in the previous block's colour", () => {
  const row = renderStatusBlocks([{ text: "mc" }, { text: "git" }], 80, theme, POWERLINE);
  assert.equal(
    row,
    `${ACCENT_BG}\x1b[30m mc ${ACCENT_FG}${SUCCESS_BG}${POWERLINE}\x1b[30m git ${SUCCESS_FG}\x1b[49m${POWERLINE}\x1b[0m`,
  );
});

test("an unresolved colour token falls back to the rotation, and empty input renders nothing", () => {
  const row = renderStatusBlocks([{ text: "x", color: "borderMuted" }], 80, theme, POWERLINE);
  assert.ok(row.startsWith(ACCENT_BG), "the dim-only token is not a background, so the rotation colour is used");
  assert.equal(renderStatusBlocks([], 80, theme, POWERLINE), "");
});

test("blocks that do not fit are dropped whole, and one long block is cut to the width", () => {
  const trailing = renderStatusBlocks([{ text: "alpha" }, { text: "beta" }, { text: "gamma" }], 12, theme, POWERLINE);
  assert.ok(visibleWidth(trailing) <= 12);
  assert.ok(trailing.includes("alpha") && !trailing.includes("beta") && !trailing.includes("gamma"));

  const long = renderStatusBlocks([{ text: "abcdefghijklmnop" }], 10, theme, POWERLINE);
  assert.ok(visibleWidth(long) <= 10 && long.includes("…"));
});

test("the ASCII separator set draws the same colour pairs with a plain glyph", () => {
  const row = renderStatusBlocks([{ text: "mc" }, { text: "git" }], 80, theme, ">");
  assert.ok(row.includes(`${ACCENT_FG}${SUCCESS_BG}>`));
  assert.ok(!row.includes(POWERLINE));
});
