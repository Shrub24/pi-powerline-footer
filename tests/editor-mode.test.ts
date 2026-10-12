import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isPowerlineEditorFactory, type EditorFactory } from "../editor-composition.ts";

async function editorHarness(t: test.TestContext, powerline: Record<string, unknown>) {
  const root = mkdtempSync(join(tmpdir(), "powerline-editor-mode-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  writeFileSync(join(root, "settings.json"), JSON.stringify({ powerline: { welcome: false, ...powerline } }));

  const { default: extension } = await import("../index.ts");
  const { KeybindingsManager } = await import(
    new URL("../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js", import.meta.url).href
  );
  const keybindings = KeybindingsManager.create();
  const theme = { borderColor: (text: string) => text, fg: (_token: string, text: string) => text };
  const tui = { requestRender() {}, terminal: { columns: 80, rows: 24 }, hasOverlay: () => false };

  const editors: any[] = [];
  let installedFactory: EditorFactory | undefined;
  let editor: any = null;
  const notifications: string[] = [];
  const ctx = {
    cwd: root,
    hasUI: true,
    model: { name: "Test model", provider: "test" },
    modelRegistry: {},
    sessionManager: { getBranch: () => [], getSessionId: () => "editor-mode-test", getCwd: () => root },
    ui: {
      getEditorText: () => editor?.getExpandedText?.() ?? "",
      setEditorText() {},
      setEditorComponent(factory?: EditorFactory) {
        installedFactory = factory;
        if (!factory) return;
        editor = factory(tui as never, theme as never, keybindings);
        editors.push(editor);
      },
      getEditorComponent: () => installedFactory,
      setStatus() {},
      setWidget() {},
      setFooter() {},
      setHeader() {},
      setWorkingMessage() {},
      notify(message: string) {
        notifications.push(message);
      },
      onTerminalInput: () => () => {},
    },
  };

  const commands = new Map<string, (args: string) => Promise<void>>();
  const handlers = new Map<string, (event: object, context: typeof ctx) => unknown>();
  (extension as unknown as (api: object) => void)({
    on: (name: string, handler: (event: object, context: typeof ctx) => unknown) => handlers.set(name, handler),
    registerCommand: (name: string, command: { handler: (args: string, context: typeof ctx) => Promise<void> }) => {
      commands.set(name, (args: string) => command.handler(args, ctx));
    },
    sendUserMessage() {},
    getCommands: () => [],
  });

  await handlers.get("session_start")?.({ reason: "new" }, ctx);

  t.after(async () => {
    await handlers.get("session_shutdown")?.({ reason: "quit" }, ctx);
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(root, { recursive: true, force: true });
  });

  return {
    editors,
    currentEditor: () => editor,
    notifications,
    installedFactory: () => installedFactory,
    setPreset: (preset: string) => commands.get("powerline")!(preset),
  };
}

test("an invalid powerline editor mode warns once and keeps the default editor", async (t) => {
  const h = await editorHarness(t, { editor: { mode: "emacs" } });

  const warning = 'Ignoring invalid powerline editor mode: "emacs"';
  assert.equal(h.notifications.filter((message) => message === warning).length, 1);
  assert.equal(isPowerlineEditorFactory(h.installedFactory()), true);
  // The default backend has no mode label and no Vim editor behind it.
  assert.equal(typeof h.currentEditor().getMode, "undefined");
  assert.equal(
    h.currentEditor().render(40).at(-1).replace(/\x1b\[[0-9;]*m/g, ""),
    ` ${"─".repeat(38)}`,
  );

  await h.setPreset("minimal");

  assert.equal(h.notifications.filter((message) => message === warning).length, 1);
  assert.equal(h.editors.length, 2);
  assert.equal(typeof h.currentEditor().getMode, "undefined");
});

test("powerline.editor.mode defaults to the default editor", async (t) => {
  const h = await editorHarness(t, {});

  assert.equal(h.notifications.length, 0);
  assert.equal(typeof h.currentEditor().getMode, "undefined");
});
