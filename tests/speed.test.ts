import test from "node:test";
import assert from "node:assert/strict";
import { completeSpeedSample, noteSpeedFirstToken, speedText, startSpeedTiming } from "../speed.ts";

// Request starts at 0 ms; the first token arrives at 500 ms.
const timed = () => noteSpeedFirstToken(startSpeedTiming(0), 500);

test("rate is output tokens over the window from first token to message end, and ttft is start to first token", () => {
  const sample = completeSpeedSample(timed(), { stopReason: "stop", usage: { output: 100 } }, 2500);
  assert.deepEqual(sample, { ttftSec: 0.5, tokensPerSec: 50 });
  assert.equal(speedText(sample, "both"), "50 t/s · 0.5s");
  assert.equal(speedText(sample, "rate"), "50 t/s");
  assert.equal(speedText(sample, "ttft"), "0.5s");
});

test("the rate is hidden for no usage, zero output, or a window too short to mean anything; ttft stays", () => {
  for (const usage of [undefined, { output: 0 }]) {
    assert.equal(completeSpeedSample(timed(), { stopReason: "stop", usage }, 2500)?.tokensPerSec, undefined);
  }
  assert.equal(completeSpeedSample(timed(), { stopReason: "stop", usage: { output: 9 } }, 600)?.tokensPerSec, undefined);
  assert.equal(speedText({ ttftSec: 0.5 }, "both"), "0.5s");
});

test("aborted, errored and first-token-less requests produce no sample", () => {
  assert.equal(completeSpeedSample(timed(), { stopReason: "aborted", usage: { output: 100 } }, 2500), undefined);
  assert.equal(completeSpeedSample(timed(), { stopReason: "error", usage: { output: 100 } }, 2500), undefined);
  assert.equal(completeSpeedSample(startSpeedTiming(0), { stopReason: "stop", usage: { output: 100 } }, 2500), undefined);
});

test("only the first assistant update sets the first token, and large rates round to the nearest 5", () => {
  assert.equal(noteSpeedFirstToken(timed(), 900).firstTokenMs, 500);
  const fast = completeSpeedSample(timed(), { stopReason: "stop", usage: { output: 1003 } }, 2500);
  assert.equal(speedText(fast, "rate"), "500 t/s"); // 1003 tokens over 2 s is 501.5 t/s
});
