import test from "node:test";
import assert from "node:assert/strict";
import { parseJjLog } from "../git-status.ts";

test("jj log rows resolve to the nearest bookmark, the change id, dirty and conflict state", () => {
  // Captured from `jj log -r '@ | latest(::@ & bookmarks(), 1)'` in this repo: an empty working copy above `main`.
  assert.deepEqual(parseJjLog("W\t\tprrtnwkr\t0\t0\n\tmain\tmtyowmlq\t1\t0\n"), { label: "main", dirty: false, conflict: false });

  // The working copy's own bookmark wins; a dirty, conflicted working copy is flagged.
  assert.deepEqual(parseJjLog("W\tfeature\tabcdefgh\t1\t1\n"), { label: "feature", dirty: true, conflict: true });

  // Without any bookmark the change id labels the working copy.
  assert.deepEqual(parseJjLog("W\t\tzzkqxyvo\t1\t0\n"), { label: "zzkqxyvo", dirty: true, conflict: false });

  // No working-copy row means no jj state, so the caller falls back to git.
  assert.equal(parseJjLog("\tmain\tmtyowmlq\t1\t0\n"), null);
});
