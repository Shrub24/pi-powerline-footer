import test from "node:test";
import assert from "node:assert/strict";
import { parsePowerlineConfig } from "../powerline-config.ts";

const parse = (padding: unknown) => parsePowerlineConfig({ editor: { frame: "rounded", padding } }, ["default"]).editor;

test("editor padding defaults to one row, keeps zero, and caps large values at three", () => {
  assert.deepEqual([parse(undefined).padding, parse(0).padding, parse(2).padding, parse(9).padding], [1, 0, 2, 3]);
  assert.equal(parse(9).invalidPadding, null, "a large value is capped, not reported");
});

test("a value that is not a whole non-negative number falls back to one row and is reported", () => {
  for (const value of [-1, 1.5, "2", null]) {
    const editor = parse(value);
    assert.equal(editor.padding, 1, `padding ${JSON.stringify(value)}`);
    assert.notEqual(editor.invalidPadding, null, `padding ${JSON.stringify(value)} is reported`);
  }
});
