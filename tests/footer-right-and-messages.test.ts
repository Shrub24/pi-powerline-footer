import test from "node:test";
import assert from "node:assert/strict";
import { mergeSegmentsWithCustomItems, parsePowerlineConfig } from "../powerline-config.ts";
import { PRESETS } from "../presets.ts";
import { countUserTurns } from "../message-count.ts";
import { renderSegment } from "../segments.ts";
import type { SegmentContext } from "../types.ts";

test("layout.footerRight is a flat list placed once, and a segment placed there leaves the top-right row", () => {
  const config = parsePowerlineConfig({ layout: { footerRight: ["time", "bogus"] } }, ["default"]);
  assert.deepEqual(config.layout?.footerRight, ["time"]);
  assert.ok(config.invalidLayoutSegments.includes("footerRight:bogus"));

  const merged = mergeSegmentsWithCustomItems(PRESETS.default, config.customItems, { layout: config.layout });
  assert.deepEqual(merged.footerRightSegments, ["time"]);
  assert.ok(!merged.rightSegments.includes("time"), "the time segment is not also on the top row");
});

test("the turn count is user-role messages on the branch, as pi-starship counts them", () => {
  const branch = [
    { type: "message", message: { role: "user" } },
    { type: "message", message: { role: "assistant" } },
    { type: "message", message: { role: "toolResult" } },
    { type: "model_change" },
    { type: "message", message: { role: "user" } },
  ];
  assert.equal(countUserTurns(branch), 2);
  assert.equal(countUserTurns([]), 0);
});

const messageContext = (userTurnCount: number) =>
  ({ theme: { fg: (_token: string, text: string) => text }, colors: {}, options: {}, userTurnCount } as unknown as SegmentContext);

test("the messages segment shows the chat glyph with the count in the Nerd set, and msg in ASCII", () => {
  const saved = process.env.POWERLINE_NERD_FONTS;
  try {
    process.env.POWERLINE_NERD_FONTS = "1";
    assert.equal(renderSegment("messages", messageContext(7)).content, "\u{F0361} 7");
    process.env.POWERLINE_NERD_FONTS = "0";
    assert.equal(renderSegment("messages", messageContext(7)).content, "msg 7");
  } finally {
    if (saved === undefined) delete process.env.POWERLINE_NERD_FONTS;
    else process.env.POWERLINE_NERD_FONTS = saved;
  }
});
