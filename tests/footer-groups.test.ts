import test from "node:test";
import assert from "node:assert/strict";
import { footerStatusKeys, parsePowerlineConfig } from "../powerline-config.ts";
import { extensionStatusParts, footerGroupItem } from "../segments.ts";
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
  extensionStatuses: new Map([["pi-cache-stats", "⚡ 87/91 93%"], ["magic-context", "mc: 12k"]]),
  statusFormats: new Map(),
  hiddenExtensionStatusKeys: new Set(),
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

test("a footer status entry is kept as status:<key>, in a group or alone, and a repeat or empty key is dropped", () => {
  const config = parsePowerlineConfig({
    layout: { footer: [["tokens", "status:pi-cache-stats"], "status:pi-cache-stats", "status:"] },
  }, ["default"]);
  assert.deepEqual(config.layout?.footer, [["tokens", "status:pi-cache-stats"]]);
  assert.ok(config.invalidLayoutSegments.includes("footer:status:"));
});

test("a placed status renders as a pill member, alone or in a group, and a missing one drops out", () => {
  const cache = footerGroupItem(["tokens", "status:pi-cache-stats"], baseContext);
  assert.ok(cache?.text.includes("↑1.2k ↓300") && cache.text.includes("87/91"), cache?.text);

  assert.ok(footerGroupItem(["status:pi-cache-stats"], baseContext)?.text.includes("87/91"));
  assert.equal(footerGroupItem(["status:absent"], baseContext), undefined);
  assert.ok(footerGroupItem(["status:absent", "tokens"], baseContext)?.text.startsWith("↑1.2k"));
});

test("a placed status takes its statusFormats colour, and a hide rule drops it", () => {
  const coloured = { ...baseContext, statusFormats: new Map([["pi-cache-stats", { color: "success" as const }]]) };
  assert.equal(footerGroupItem(["status:pi-cache-stats"], coloured as SegmentContext)?.color, "success");

  const hidden = { ...baseContext, statusFormats: new Map([["pi-cache-stats", { hide: true }]]) };
  assert.equal(footerGroupItem(["status:pi-cache-stats"], hidden as SegmentContext), undefined);
});

test("a placed status is not repeated in the trailing statuses, and the others still follow", () => {
  const placed = footerStatusKeys([["tokens", "status:pi-cache-stats"]]);
  assert.deepEqual([...placed], ["pi-cache-stats"]);
  const trailing = extensionStatusParts({ ...baseContext, hiddenExtensionStatusKeys: placed, statusOrder: [] });
  assert.deepEqual(trailing.map((part) => part.text), ["mc: 12k"]);
});
