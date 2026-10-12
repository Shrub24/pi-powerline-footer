import test from "node:test";
import assert from "node:assert/strict";
import { ToolActivityTracker } from "../tool-activity.ts";

test("nothing shows before a tool has run, and reset hides it again", () => {
  const tracker = new ToolActivityTracker();
  assert.equal(tracker.activity, undefined);
  tracker.start("1", "bash");
  tracker.reset();
  assert.equal(tracker.activity, undefined);
});

test("a running tool shows as running, and parallel tools show the latest with a count of the others", () => {
  const tracker = new ToolActivityTracker();
  tracker.start("1", "read");
  assert.deepEqual(tracker.activity, { state: "running", name: "read", others: 0 });
  tracker.start("2", "bash");
  tracker.start("3", "grep");
  assert.deepEqual(tracker.activity, { state: "running", name: "grep", others: 2 });
});

test("a finished tool shows as done or failed once nothing else is running", () => {
  const tracker = new ToolActivityTracker();
  tracker.start("1", "bash");
  tracker.start("2", "read");
  tracker.end("2", "read", false);
  assert.deepEqual(tracker.activity, { state: "running", name: "bash", others: 0 });
  tracker.end("1", "bash", true);
  assert.deepEqual(tracker.activity, { state: "failed", name: "bash", others: 0 });
  tracker.start("3", "edit");
  tracker.end("3", "edit", false);
  assert.deepEqual(tracker.activity, { state: "done", name: "edit", others: 0 });
});
