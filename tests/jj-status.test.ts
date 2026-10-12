import test from "node:test";
import assert from "node:assert/strict";
import { renderSegment } from "../segments.ts";
import { parseJjLog } from "../git-status.ts";
import type { SegmentContext } from "../types.ts";

test("jj log rows resolve to the nearest bookmark, the change id, dirty, conflict and line counts", () => {
  // Captured from the JJ_TEMPLATE in git-status.ts on this repo: an empty working copy above `main`.
  assert.deepEqual(parseJjLog("W\t\tuzkswnpy\t0\t0\t0\t0\n\tmain\tvwmooyzv\t1\t0\t0\t0\n"), {
    label: "main", dirty: false, conflict: false, added: 0, removed: 0,
  });

  // A working copy with edits: the counts come from the working-copy row only.
  assert.deepEqual(parseJjLog("W\tfeature\tabcdefgh\t1\t1\t12\t3\n\tmain\tvwmooyzv\t1\t0\t0\t0\n"), {
    label: "feature", dirty: true, conflict: true, added: 12, removed: 3,
  });

  // Without any bookmark the change id labels the working copy.
  assert.deepEqual(parseJjLog("W\t\tzzkqxyvo\t1\t0\t4\t0\n"), {
    label: "zzkqxyvo", dirty: true, conflict: false, added: 4, removed: 0,
  });

  // No working-copy row means no jj state, so the caller falls back to git.
  assert.equal(parseJjLog("\tmain\tvwmooyzv\t1\t0\t0\t0\n"), null);
});

function gitSegmentText(jj: { dirty: boolean; conflict: boolean; added: number; removed: number }, options: object = {}): string {
  const ctx = {
    git: { branch: "main", staged: 0, unstaged: 0, untracked: 0, jj },
    options: { git: options },
    theme: { fg: (token: string, text: string) => `<${token}>${text}</${token}>` },
    colors: {},
  } as unknown as SegmentContext;
  return renderSegment("git", ctx).content;
}

test("a dirty jj working copy shows its line counts, and the bare marker only without counts", () => {
  const counted = gitSegmentText({ dirty: true, conflict: false, added: 12, removed: 3 });
  assert.ok(counted.includes("<success>+12</success>") && counted.includes("<error>-3</error>"));
  assert.ok(!counted.includes("<warning>*</warning>"));

  const bare = gitSegmentText({ dirty: true, conflict: false, added: 0, removed: 0 });
  assert.ok(bare.includes("<warning>*</warning>") && !bare.includes("+0"));

  const hidden = gitSegmentText({ dirty: true, conflict: false, added: 12, removed: 3 }, { showUnstaged: false });
  assert.ok(!hidden.includes("+12") && hidden.includes("<warning>*</warning>"));
});
