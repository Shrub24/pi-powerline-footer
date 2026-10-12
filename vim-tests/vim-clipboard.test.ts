import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clipboardWriteUnavailable, createVimRuntime } from "../vim-editor.ts";
import { writeClipboardInChildProcess } from "../vim/clipboard-mirror.ts";
import { createCursorShapeTui, stubKeybindings } from "../vim/test/harness.ts";

const theme = { borderColor: (text: string) => text, fg: (_token: string, text: string) => text };
const UNIQUE_LINE = "powerline-clipboard-probe-7f3a";

/** Two macrotask turns: one for the mirror's write, one for its drain loop. */
async function settle(): Promise<void> {
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
}

function vimEditor(clipboard: { copy?: (text: string) => unknown } = {}) {
  const runtime = createVimRuntime({
    pi: { getCommands: () => [] } as never,
    ctx: { hasUI: true, shutdown() {}, ui: { theme, notify() {} } },
    settings: {},
    clipboard,
  });

  return runtime.createBackend(createCursorShapeTui() as never, theme as never, stubKeybindings as never).editor;
}

function typeLine(editor: any, text: string): void {
  for (const char of text) editor.handleInput(char);
  editor.handleInput("\x1b");
}

test("a yank mirrors through the injected writer, never a vendored helper process", async () => {
  const copied: string[] = [];
  const editor = vimEditor({ copy: (text) => copied.push(text) });

  typeLine(editor, `${UNIQUE_LINE}\nsecond`);
  editor.handleInput("k");
  editor.handleInput("y");
  editor.handleInput("y");
  await settle();

  // The yanked text arrived at the injected writer, which is Pi's `copyToClipboard` in production.
  assert.deepEqual(copied, [`${UNIQUE_LINE}\n`]);
  // Both clipboard hooks are therefore replacement functions, so the vendored pair — which spawns
  // `process.execPath -e` and resolves the native sidecar through module resolution — is unreachable.
  const mirrorWriter = Reflect.get(Reflect.get(editor, "clipboardMirror"), "writeFn");
  assert.notEqual(mirrorWriter, writeClipboardInChildProcess, "the mirror still has the vendored write helper");
  assert.equal(Reflect.get(editor, "clipboardReadFn")(), null, "the vendored read helper is replaced by the null read hook");
});

test("a NORMAL-mode paste takes the internal register, not the OS clipboard", async () => {
  const editor = vimEditor({ copy: () => {} });

  typeLine(editor, `${UNIQUE_LINE}\nsecond`);
  editor.handleInput("k");
  editor.handleInput("y");
  editor.handleInput("y");
  await settle();
  editor.handleInput("p");
  await settle();

  // The mirror landed, so `p` consults the read hook; it returns null and the register wins.
  assert.equal(editor.getText().split(UNIQUE_LINE).length - 1, 2);
});

test("the mirror is reported unavailable only without a tool and without a terminal", (t) => {
  const emptyPath = mkdtempSync(join(tmpdir(), "powerline-clipboard-empty-"));
  const withTool = mkdtempSync(join(tmpdir(), "powerline-clipboard-tool-"));
  t.after(() => {
    rmSync(emptyPath, { recursive: true, force: true });
    rmSync(withTool, { recursive: true, force: true });
  });
  writeFileSync(join(withTool, "wl-copy"), "");

  assert.equal(clipboardWriteUnavailable({ path: emptyPath, isTTY: false }), true);
  assert.equal(clipboardWriteUnavailable({ path: emptyPath, isTTY: true }), false, "Pi's OSC 52 fallback needs no tool");
  assert.equal(clipboardWriteUnavailable({ path: withTool, isTTY: false }), false);
  assert.equal(clipboardWriteUnavailable({ path: `${emptyPath}:${withTool}`, isTTY: false }), false, "a tool anywhere on PATH counts");
});
