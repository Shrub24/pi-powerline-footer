import test from "node:test";
import assert from "node:assert/strict";
import { renderSegment } from "../segments.ts";
import type { SegmentContext } from "../types.ts";

// The fake tint wraps text in brackets with its level, so the test sees which tint the segment asked for.
function createSegmentContext(thinkingLevel: string): SegmentContext {
  return {
    model: undefined,
    thinkingLevel,
    sessionId: undefined,
    usageStats: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0, subagentCost: 0 },
    contextTokens: 0,
    contextPercent: 0,
    contextWindow: 0,
    contextApproximate: false,
    autoCompactEnabled: true,
    customCompactionEnabled: false,
    usingSubscription: false,
    sessionStartTime: Date.now(),
    shellModeActive: false,
    shellRunning: false,
    shellName: null,
    shellCwd: null,
    git: { branch: null, staged: 0, unstaged: 0, untracked: 0 },
    extensionStatuses: new Map(),
    hiddenExtensionStatusKeys: new Set(),
    statusFormats: new Map(),
    statusOrder: [],
    customItemsById: new Map(),
    options: {},
    theme: {
      fg: (_token: string, text: string) => text,
      getThinkingBorderColor: (level: string) => (text: string) => `[${level}]${text}`,
    } as SegmentContext["theme"],
    colors: {},
  };
}

test("thinking segment takes the editor border's tint for its level, in bold", () => {
  assert.equal(renderSegment("thinking", createSegmentContext("off")).content, "\x1b[1m[off]think:off\x1b[22m");
  assert.equal(renderSegment("thinking", createSegmentContext("high")).content, "\x1b[1m[high]think:high\x1b[22m");
});
