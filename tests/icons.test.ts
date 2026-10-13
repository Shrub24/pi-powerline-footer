import { test } from "node:test";
import assert from "node:assert/strict";
import { hasNerdFonts } from "../icons.ts";

test("hasNerdFonts defaults on, independent of terminal name, and POWERLINE_NERD_FONTS=0 opts out", () => {
  const saved = process.env.POWERLINE_NERD_FONTS;
  try {
    delete process.env.POWERLINE_NERD_FONTS;
    assert.equal(hasNerdFonts(), true, "unset means Nerd Fonts");

    process.env.POWERLINE_NERD_FONTS = "1";
    assert.equal(hasNerdFonts(), true, "explicit enable");

    process.env.POWERLINE_NERD_FONTS = "0";
    assert.equal(hasNerdFonts(), false, "explicit disable selects ASCII");
  } finally {
    if (saved === undefined) delete process.env.POWERLINE_NERD_FONTS;
    else process.env.POWERLINE_NERD_FONTS = saved;
  }
});
