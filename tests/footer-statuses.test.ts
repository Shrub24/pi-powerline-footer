import test from "node:test";
import assert from "node:assert/strict";
import { visibleWidth } from "@earendil-works/pi-tui";
import { renderFooterRows, type FooterChrome } from "../footer-statuses.ts";

// accent and success have colours; borderMuted resolves to the terminal default (dim only), like Pi's bundled theme.
const theme = {
  getFgAnsi(token: string): string {
    if (token === "accent") return "\x1b[38;5;6m";
    if (token === "success") return "\x1b[38;2;1;2;3m";
    if (token === "borderMuted") return "\x1b[2m";
    throw new Error(`Unknown theme color: ${token}`);
  },
};
const ROUND = { left: "\uE0B6", right: "\uE0B4" };
const NERD: FooterChrome = { separator: "\uE0B0", divider: ROUND.right, cap: ROUND };
const ASCII: FooterChrome = { separator: ">", divider: "|", cap: { left: "(", right: ")" } };
const ACCENT_BG = "\x1b[48;5;6m";
const SUCCESS_BG = "\x1b[48;2;1;2;3m";
const ACCENT_FG = "\x1b[38;5;6m";
const BLOCK_FG = "\x1b[1m\x1b[30m";
const SUCCESS_FG = "\x1b[38;2;1;2;3m";
const DEFAULT_BG = "\x1b[49m";
const RESET = "\x1b[0m";

const plainText = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");
const row = (items: { text: string; color?: string }[], width: number, style: "pills" | "blocks" | "plain", chrome: FooterChrome, right?: { text: string }) =>
  renderFooterRows(items, width, theme, style, chrome, right)[1] ?? "";

test("pills join into one statusline: round caps at the ends, a curved divider in the previous section's colour", () => {
  const items = [{ text: "mc" }, { text: "git" }];
  // Natural width: cap, " mc ", divider, " git ", cap = 12 columns, so nothing is spread.
  assert.equal(
    row(items, 12, "pills", NERD),
    `${DEFAULT_BG}${ACCENT_FG}\uE0B6${ACCENT_BG}${BLOCK_FG} mc ${SUCCESS_BG}${ACCENT_FG}\uE0B4${SUCCESS_BG}${BLOCK_FG} git ${DEFAULT_BG}${SUCCESS_FG}\uE0B4${RESET}`,
  );
  assert.equal(plainText(row(items, 12, "pills", ASCII)), "( mc | git )", "the ASCII set draws parentheses and a bar");
});

test("the joined pills are centred, the extra column going to the right", () => {
  const items = [{ text: "mc" }, { text: "git" }];
  assert.equal(plainText(row(items, 19, "pills", ASCII)), "   ( mc | git )    ", "odd slack: 3 left, 4 right");
  assert.equal(plainText(row(items, 20, "pills", ASCII)), "    ( mc | git )    ", "even slack splits evenly");
});

test("the right item is flush right and reserved first, and the line is centred over the room left of it", () => {
  const items = [{ text: "mc" }, { text: "git" }];
  const time = { text: "12:00" };
  // "( 12:00 )" is 9 columns and needs one more as a gap: 10 are reserved, so "git" drops.
  // The symmetric spot would leave 7 columns on the right, short of 10, so the line centres in the 10 left of it.
  assert.equal(plainText(row(items, 20, "pills", ASCII, time)), "  ( mc )   ( 12:00 )");
  // Here the symmetric spot clears the right item, so the full width centres the whole line.
  assert.equal(plainText(row(items, 32, "pills", ASCII, time)), `${" ".repeat(10)}( mc | git ) ( 12:00 )`);
});

test("trailing sections drop whole when the line does not fit, and a lone section is cut to the width", () => {
  const dropped = row([{ text: "mc" }, { text: "git" }], 11, "pills", ASCII);
  assert.equal(plainText(dropped).trim(), "( mc )", "the trailing pill goes, the rest is kept");
  assert.equal(visibleWidth(dropped), 11);

  const cut = row([{ text: "abcdefgh" }], 6, "pills", ASCII);
  assert.equal(plainText(cut), "( a… )");
  assert.equal(visibleWidth(cut), 6);
});

test("blocks and plain items are left-aligned, with no spreading", () => {
  assert.equal(plainText(row([{ text: "mc" }, { text: "git" }], 20, "blocks", ASCII)).trimEnd(), " mc > git >");
  assert.equal(plainText(row([{ text: "mc" }, { text: "git" }], 20, "plain", ASCII)).trimEnd(), "mc   git");
});

test("an unresolved colour token falls back to the rotation, and empty input renders nothing", () => {
  const line = row([{ text: "x", color: "borderMuted" }], 80, "blocks", NERD);
  assert.ok(line.startsWith(ACCENT_BG), "the dim-only token is not a background, so the rotation colour is used");
  assert.deepEqual(renderFooterRows([], 80, theme, "pills", NERD), []);
  assert.deepEqual(renderFooterRows([], 80, theme, "plain", NERD), []);
});

test("a single pill is centred and keeps its round caps", () => {
  assert.equal(plainText(row([{ text: "mc" }], 80, "pills", NERD)).trim(), "\uE0B6 mc \uE0B4");
  assert.equal(visibleWidth(row([{ text: "mc" }], 80, "pills", NERD)), 80);
});

test("every style fills the width exactly once it has content, at every width", () => {
  const items = [{ text: "mc" }, { text: "git" }];
  for (const style of ["plain", "blocks", "pills"] as const) {
    for (let width = 1; width <= 60; width++) {
      const [, line] = renderFooterRows(items, width, theme, style, NERD, { text: "12:00" });
      if (line === undefined) continue;
      assert.equal(visibleWidth(line), width, `${style} at ${width}`);
    }
  }
});

test("a group member with its own colour is drawn in that colour inside the pill, which keeps its background", () => {
  const group = {
    text: "tokens · reqcap",
    color: "accent",
    members: [{ text: "tokens", color: "accent" }, { text: "reqcap", color: "success" }],
  };
  // At its natural width (19 columns) the pill is not padded, so the whole row can be compared.
  assert.equal(
    row([group], 19, "pills", NERD),
    `${DEFAULT_BG}${ACCENT_FG}\uE0B6${ACCENT_BG}${BLOCK_FG} tokens${BLOCK_FG} · ${SUCCESS_FG}reqcap${BLOCK_FG} ${DEFAULT_BG}${ACCENT_FG}\uE0B4${RESET}`,
  );
});
