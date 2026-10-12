import test from "node:test";
import assert from "node:assert/strict";
import { getIcons } from "../icons.ts";
import { nixShellText, renderSegment } from "../segments.ts";
import type { SegmentContext } from "../types.ts";

test("nix state comes from IN_NIX_SHELL, with the shell's name only when it is specific", () => {
  assert.equal(nixShellText({ IN_NIX_SHELL: "impure" }), "impure");
  assert.equal(nixShellText({ IN_NIX_SHELL: "pure", name: "nix-shell" }), "pure");
  assert.equal(nixShellText({ IN_NIX_SHELL: "impure", name: "shell" }), "impure");
  assert.equal(nixShellText({ IN_NIX_SHELL: "impure", name: "nix-shell-env" }), "impure");
  assert.equal(nixShellText({ IN_NIX_SHELL: "impure", name: "my-app" }), "impure · my-app");
  assert.equal(nixShellText({ name: "my-app" }), undefined, "a name alone is not a nix shell");
  assert.equal(nixShellText({}), undefined);
});

test("the segment reads the environment on render and stays hidden outside a nix shell", () => {
  const ctx = { theme: { fg: (_token: string, text: string) => text }, colors: {} } as unknown as SegmentContext;
  const saved = process.env.IN_NIX_SHELL;
  try {
    process.env.IN_NIX_SHELL = "impure";
    const plain = renderSegment("nix", ctx).content.replace(/\x1b\[[0-9;]*m/g, "");
    assert.equal(plain, `${getIcons().nix} impure`);
    delete process.env.IN_NIX_SHELL;
    assert.equal(renderSegment("nix", ctx).visible, false);
  } finally {
    if (saved === undefined) delete process.env.IN_NIX_SHELL;
    else process.env.IN_NIX_SHELL = saved;
  }
});
