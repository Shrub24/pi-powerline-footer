import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AutocompleteProvider, AutocompleteSuggestions } from "@earendil-works/pi-tui";
import { getEditorAutocompleteProvider, isPowerlineEditorFactory, type EditorFactory } from "../editor-composition.ts";

type ForeignEditor = { kind: "foreign" };
type PowerlineEditor = { handleInput(data: string): void; render(width: number): string[] };

async function editorHarness(t: test.TestContext, settings: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), "powerline-editor-rebuild-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  writeFileSync(join(root, "settings.json"), JSON.stringify({ powerline: { welcome: false }, ...settings }));

  const { default: extension } = await import("../index.ts");
  const { KeybindingsManager } = await import(
    new URL("../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js", import.meta.url).href
  );
  const keybindings = KeybindingsManager.create();
  const theme = { borderColor: (text: string) => text };
  const tui = { requestRender() {}, terminal: { columns: 80, rows: 24 }, hasOverlay: () => false };

  const foreignEditors: ForeignEditor[] = [];
  let installedFactory: EditorFactory | undefined = () => {
    const editor: ForeignEditor = { kind: "foreign" };
    foreignEditors.push(editor);
    return editor;
  };
  const editors: PowerlineEditor[] = [];
  let editor: PowerlineEditor | null = null;

  const ctx = {
    cwd: root,
    hasUI: true,
    model: { name: "Test model", provider: "test" },
    modelRegistry: {},
    sessionManager: { getBranch: () => [], getSessionId: () => "editor-rebuild-test", getCwd: () => root },
    ui: {
      getEditorText: () => "",
      setEditorComponent(factory?: EditorFactory) {
        if (!factory) {
          installedFactory = undefined;
          return;
        }
        installedFactory = factory;
        // Pi constructs an editor from the factory it has just been handed.
        editor = factory(tui, theme, keybindings);
        editors.push(editor);
      },
      getEditorComponent: () => installedFactory,
      setStatus() {}, setWidget() {}, setFooter() {}, setHeader() {}, setWorkingMessage() {}, notify() {},
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
    foreignEditors,
    editors,
    editor: () => editor!,
    installedFactory: () => installedFactory,
    setPreset: (preset: string) => commands.get("powerline")!(preset),
  };
}

test("successive editor rebuilds construct one foreign editor per Pi construction", async (t) => {
  const h = await editorHarness(t);

  await h.setPreset("minimal");
  await h.setPreset("compact");
  await h.setPreset("full");

  assert.equal(h.editors.length, 4);
  assert.equal(h.foreignEditors.length, 4);
  assert.equal(isPowerlineEditorFactory(h.installedFactory()), true);
  for (const editor of h.editors) {
    assert.equal(typeof editor.handleInput, "function");
    assert.equal(typeof editor.render, "function");
    assert.equal(h.foreignEditors.includes(editor as unknown as ForeignEditor), false);
  }

  // The default backend supplies no frame label, so the frame keeps its plain border.
  const frame = h.editor().render(60).map((line) => line.replace(/\x1b\[[0-9;]*m/g, ""));
  assert.equal(frame.at(-1), ` ${"─".repeat(58)}`);
});

test("Pi installing a provider after Powerline wrapped re-wraps the new provider", async (t) => {
  const h = await editorHarness(t, { bashMode: { completions: true } });
  const editor = h.editor();
  const signal = new AbortController().signal;
  const suggestions = (label: string): AutocompleteSuggestions => ({ prefix: "/", items: [{ label, value: label }] });
  const provider = (result: AutocompleteSuggestions): AutocompleteProvider => ({
    async getSuggestions() {
      return result;
    },
    applyCompletion(lines, cursorLine, cursorCol) {
      return { lines, cursorLine, cursorCol };
    },
  });
  const second = suggestions("second");

  editor.setAutocompleteProvider(provider(suggestions("first")));
  editor.setAutocompleteProvider(provider(second));

  const wrapped = getEditorAutocompleteProvider(editor);
  assert.notEqual(wrapped, undefined);
  // Powerline's mode-aware wrapper stays installed over the provider Pi replaced.
  assert.equal(typeof Reflect.get(wrapped as object, "shouldTriggerFileCompletion"), "function");
  assert.equal(await wrapped!.getSuggestions(["draft"], 0, 5, { signal }), second);
});
