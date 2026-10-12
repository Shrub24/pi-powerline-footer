import test from "node:test";
import assert from "node:assert/strict";
import { __setCurrencyRatesForTest } from "../currency-rates.ts";
import { getIcons } from "../icons.ts";
import { renderSegment } from "../segments.ts";
import type { SegmentContext } from "../types.ts";

// Icons follow POWERLINE_NERD_FONTS at call time, so each case sets it and restores it afterwards.
function withNerdFonts(value: "0" | "1", run: () => void): void {
  const saved = process.env.POWERLINE_NERD_FONTS;
  process.env.POWERLINE_NERD_FONTS = value;
  try {
    run();
  } finally {
    if (saved === undefined) delete process.env.POWERLINE_NERD_FONTS;
    else process.env.POWERLINE_NERD_FONTS = saved;
  }
}

const plain = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");
const theme = { fg: (_token: string, text: string) => text };
const costContext = {
  theme,
  colors: {},
  options: {},
  usingSubscription: false,
  usageStats: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 4.19, subagentCost: 0 },
} as unknown as SegmentContext;
const toolContext = { theme, colors: {}, options: {}, tool: { state: "idle" } } as unknown as SegmentContext;

test("the cost segment shows the Nerd dollar icon in place of the dollar sign; ASCII keeps the dollar sign", () => {
  __setCurrencyRatesForTest({});
  withNerdFonts("1", () => assert.equal(plain(renderSegment("cost", costContext).content), "\uF155 4.19"));
  withNerdFonts("0", () => assert.equal(plain(renderSegment("cost", costContext).content), "$4.19"));
});

test("the idle tool state shows the sleep icon with idle in the Nerd set, and the word alone in ASCII", () => {
  withNerdFonts("1", () => assert.equal(plain(renderSegment("tool", toolContext).content), "\u{F04B2} idle"));
  withNerdFonts("0", () => assert.equal(plain(renderSegment("tool", toolContext).content), "idle"));
});

test("the pill caps come from the icon set: round caps in Nerd, parentheses in ASCII", () => {
  withNerdFonts("1", () => assert.deepEqual([getIcons().capLeft, getIcons().capRight], ["\uE0B6", "\uE0B4"]));
  withNerdFonts("0", () => assert.deepEqual([getIcons().capLeft, getIcons().capRight], ["(", ")"]));
});
