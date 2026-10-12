import test from "node:test";
import assert from "node:assert/strict";
import { parsePowerlineConfig } from "../powerline-config.ts";
import { footerGroupItem } from "../segments.ts";
import type { SegmentContext } from "../types.ts";

test("footer entries are segments or groups; a group is one pill, and an unknown member is reported", () => {
  const config = parsePowerlineConfig({
    layout: { footer: [["tool"], ["speed", "tokens"], "cost", ["bogus"]] },
    statusStyle: "pills",
  }, ["default"]);
  assert.deepEqual(config.layout?.footer, [["tool"], ["speed", "tokens"], ["cost"]]);
  assert.ok(config.invalidLayoutSegments.includes("footer:bogus"));
  assert.equal(config.statusStyle, "pills");
});

const theme = { fg: (_token: string, text: string) => text };
const baseContext = {
  theme,
  colors: {},
  options: {},
  usageStats: { input: 1200, output: 300, cacheRead: 0, cacheWrite: 0, cost: 0 },
  speed: { ttftSec: 0.5, tokensPerSec: 42 },
  tool: { state: "idle" },
} as unknown as SegmentContext;

test("a nested group is one item: its visible segments joined by a thin separator", () => {
  const item = footerGroupItem(["speed", "tokens"], baseContext);
  assert.ok(item?.text.includes("0.5s · ↑1.2k ↓300"), item?.text);
});

test("a group with nothing visible yields no item, and the tool group carries its state colour", () => {
  assert.equal(footerGroupItem(["speed"], { ...baseContext, speed: undefined } as SegmentContext), undefined);

  const idle = footerGroupItem(["tool"], baseContext);
  assert.ok(idle?.text.includes("idle"));
  assert.equal(idle?.color, "muted");

  const running = footerGroupItem(["tool"], { ...baseContext, tool: { state: "running", name: "bash", others: 2 } } as SegmentContext);
  assert.ok(running?.text.includes("bash +2"));
  assert.equal(running?.color, "warning");
});
