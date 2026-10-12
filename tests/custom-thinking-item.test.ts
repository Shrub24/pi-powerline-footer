import test from "node:test";
import assert from "node:assert/strict";
import { renderSegment } from "../segments.ts";
import type { CustomStatusItem, SegmentContext } from "../types.ts";

// Stub tints wrap text with the token or level, so the test sees which colour was chosen.
function ctxWith(status: string, item: Partial<CustomStatusItem>): SegmentContext {
  const custom: CustomStatusItem = {
    id: "thinking", statusKey: "native-router-thinking", position: "secondary", selfColorize: false,
    hideWhenMissing: true, excludeFromExtensionStatuses: true, ...item,
  };
  return {
    extensionStatuses: new Map([["native-router-thinking", status]]),
    customItemsById: new Map([["thinking", custom]]),
    theme: {
      fg: (token: string, text: string) => `<${token}>${text}</${token}>`,
      getThinkingBorderColor: (level: string) => (text: string) => `[${level}]${text}`,
    },
    options: {},
  } as unknown as SegmentContext;
}

test("a thinking item tints by the level its status names, with the icon inside the tint, in bold", () => {
  const rendered = renderSegment("custom:thinking", ctxWith("high✎", { thinkingTint: true, icon: "🧠", color: "accent" }));
  assert.equal(rendered.content, "\x1b[1m[high]🧠 high✎\x1b[22m");
});

test("a thinking item with no level word falls back to its color, and an icon sits before the text without a tint", () => {
  const noLevel = renderSegment("custom:thinking", ctxWith("pending", { thinkingTint: true, color: "accent" }));
  assert.equal(noLevel.content, "<accent>pending</accent>");

  const plain = renderSegment("custom:thinking", ctxWith("low", { icon: "T" }));
  assert.equal(plain.content, "T low");
});
