import test from "node:test";
import assert from "node:assert/strict";
import { formatExtensionStatus, parsePowerlineConfig } from "../powerline-config.ts";

test("status format rules rename, hide, drop empties, order replacements and truncate", () => {
  const config = parsePowerlineConfig({
    statusFormats: {
      mc: { icon: "I", replace: [["^mc: ", ""], ["\\((\\d+)%\\)", "$1%"], [" · idle$", ""]] },
      order: { replace: [["ab", "b"], ["b", "c"]] },
      quiet: { hide: true },
      blank: { icon: "I" },
      long: { maxWidth: 5 },
      bad: { icon: "I", bogus: true, replace: [["(", "x"]] },
    },
  }, ["default"]);
  const rule = (key: string) => config.statusFormats.get(key);

  // Case-insensitive, replacements applied in order, icon prefixed.
  assert.equal(formatExtensionStatus("MC: 98.8K (48%) · idle", rule("mc")), "I 98.8K 48%");
  assert.equal(formatExtensionStatus("ab", rule("order")), "c");
  assert.equal(formatExtensionStatus("anything", rule("quiet")), null);
  // A leading separator from the extension is trimmed, so an empty status vanishes instead of leaving a dot.
  assert.equal(formatExtensionStatus("· ", rule("blank")), null);
  assert.equal(formatExtensionStatus("abcdefghij", rule("long"))?.replace(/\x1b\[[0-9;]*m/g, ""), "abcd…");

  // Unknown fields and an invalid pattern are reported; the valid fields of the same key still apply.
  assert.deepEqual(config.invalidStatusFormats, ["bad.bogus", "bad.replace"]);
  assert.equal(rule("bad")?.icon, "I");
});
