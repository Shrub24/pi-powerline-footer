import test from "node:test";
import assert from "node:assert/strict";
import { parsePowerlineConfig } from "../powerline-config.ts";

const parse = (padding: unknown) => parsePowerlineConfig({ editor: { frame: "rounded", padding } }, ["default"]).editor;
const sides = (padding: unknown) => {
  const { top, bottom } = parse(padding).padding;
  return [top, bottom];
};

test("editor padding defaults to one row above and none below", () => {
  assert.deepEqual(sides(undefined), [1, 0]);
});

test("a number pads both sides, zero keeps none, and large values are capped at three", () => {
  assert.deepEqual([sides(0), sides(2), sides(9)], [[0, 0], [2, 2], [3, 3]]);
  assert.equal(parse(9).invalidPadding, null, "a large value is capped, not reported");
});

test("an object sets each side, capped at three, and a missing side takes its default", () => {
  assert.deepEqual(sides({ top: 2, bottom: 1 }), [2, 1]);
  assert.deepEqual(sides({ top: 9 }), [3, 0]);
  assert.deepEqual(sides({ bottom: 2 }), [1, 2]);
});

test("a value that is not a whole non-negative number falls back to the default and is reported", () => {
  for (const value of [-1, 1.5, "2", null, { top: -1 }, { bottom: "1" }, []]) {
    const editor = parse(value);
    assert.deepEqual(sides(value), [1, 0], `padding ${JSON.stringify(value)}`);
    assert.notEqual(editor.invalidPadding, null, `padding ${JSON.stringify(value)} is reported`);
  }
});
