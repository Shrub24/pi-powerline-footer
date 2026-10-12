import test from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { visibleWidth, type AutocompleteProvider, type AutocompleteSuggestions } from "@earendil-works/pi-tui";
import type { EditorFactory } from "../editor-composition.ts";
import { vendorSeamMembers } from "../vim-editor.ts";
import { ModalEditor } from "../vim/index.ts";
import { stubKeybindings, stubTheme, stubTui, sendKeys } from "../vim/test/harness.ts";

const MODE_COLOR_CODES: Record<string, number> = {
  borderMuted: 1,
  borderAccent: 2,
  customMessageLabel: 3,
  warning: 4,
};
const BORDER_COLOR_CODE = 9;
const modeColorEscape = (token: string) => `\x1b[38;5;${MODE_COLOR_CODES[token] ?? 0}m`;
const borderColorEscape = `\x1b[48;5;${BORDER_COLOR_CODE}m`;

const FRAME_WIDTH = 40;

function labelsIn(lines: string[], label: string): string[] {
  return lines.filter((line) => line.includes(label));
}

/**
 * Drives the real extension with `powerline.editor.mode` set to `"vim"`. Pi is simulated: it hands
 * the factory to `setEditorComponent`, constructs an editor from it, and later rebuilds the same way.
 */
async function vimHarness(
  t: test.TestContext,
  powerlineSettings: Record<string, unknown> = {},
  projectSettings?: Record<string, unknown>,
) {
  const root = mkdtempSync(join(tmpdir(), "powerline-vim-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  writeFileSync(join(root, "settings.json"), JSON.stringify({
    bashMode: { completions: true },
    powerline: { welcome: false, editor: { mode: "vim" }, ...powerlineSettings },
  }));
  if (projectSettings) {
    mkdirSync(join(root, ".pi"), { recursive: true });
    writeFileSync(join(root, ".pi", "settings.json"), JSON.stringify({ powerline: projectSettings }));
  }

  const { default: extension } = await import("../index.ts");
  const { KeybindingsManager } = await import(
    new URL("../node_modules/@earendil-works/pi-coding-agent/dist/core/keybindings.js", import.meta.url).href
  );
  const keybindings = KeybindingsManager.create();

  const terminalWrites: string[] = [];
  const hardwareCursorValues: boolean[] = [];
  let showHardwareCursor = false;
  const tui = {
    requestRender() {},
    terminal: { columns: 80, rows: 24, write: (data: string) => terminalWrites.push(data) },
    getShowHardwareCursor: () => showHardwareCursor,
    setShowHardwareCursor: (show: boolean) => {
      showHardwareCursor = show;
      hardwareCursorValues.push(show);
    },
    hasOverlay: () => false,
  };

  // Each editor construction reads `theme.borderColor` once, so the count sees hidden editors.
  let borderColorReads = 0;
  const theme = {
    get borderColor() {
      borderColorReads += 1;
      return (text: string) => `${borderColorEscape}${text}\x1b[49m`;
    },
    fg: (token: string, text: string) => `${modeColorEscape(token)}${text}\x1b[39m`,
    bold: (text: string) => text,
  };

  const editors: any[] = [];
  const foreignEditors: unknown[] = [];
  let installedFactory: EditorFactory | undefined = () => {
    const foreign = { kind: "foreign" };
    foreignEditors.push(foreign);
    return foreign;
  };
  let editor: any = null;
  const notifications: Array<{ message: string; level?: string }> = [];
  const statuses = new Map<string, string | undefined>();
  const compactions: unknown[] = [];

  const ctx = {
    cwd: root,
    hasUI: true,
    mode: "tui",
    thinkingLevel: "off",
    model: { name: "Test model", provider: "test" },
    modelRegistry: {},
    sessionManager: { getBranch: () => [], getSessionId: () => "vim-editor-test", getCwd: () => root },
    isIdle: () => true,
    shutdown() {},
    compact(options: unknown) {
      compactions.push(options);
    },
    ui: {
      theme,
      getEditorText: () => editor?.getExpandedText?.() ?? "",
      setEditorText(text: string) {
        editor?.setText?.(text);
      },
      setEditorComponent(factory?: EditorFactory) {
        if (!factory) {
          installedFactory = undefined;
          return;
        }
        installedFactory = factory;
        editor = factory(tui as never, theme as never, keybindings);
        editors.push(editor);
      },
      getEditorComponent: () => installedFactory,
      setStatus(key: string, value?: string) {
        statuses.set(key, value);
      },
      setWidget() {},
      setFooter() {},
      setHeader() {},
      setWorkingMessage() {},
      notify(message: string, level?: string) {
        notifications.push({ message, level });
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
    getCommands: () => [...commands.keys()].map((name) => ({ name })),
  });

  await handlers.get("session_start")?.({ reason: "new" }, ctx);

  // Pi installs its own autocomplete provider once the editor exists; Powerline wraps that one.
  const piProvider: AutocompleteProvider = {
    async getSuggestions(): Promise<AutocompleteSuggestions | null> {
      return { items: [], prefix: "@sr" };
    },
    applyCompletion(lines: string[], cursorLine: number, cursorCol: number) {
      return { lines, cursorLine, cursorCol };
    },
  };
  editor.setAutocompleteProvider(piProvider);

  t.after(async () => {
    await handlers.get("session_shutdown")?.({ reason: "quit" }, ctx);
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(root, { recursive: true, force: true });
  });

  return {
    currentEditor: () => editor,
    piProvider,
    render: (width = FRAME_WIDTH) => editor.render(width) as string[],
    editors,
    foreignEditors,
    notifications,
    statuses,
    compactions,
    terminalWrites,
    hardwareCursorValues,
    borderColorReads: () => borderColorReads,
    runCommand: (name: string, args = "") => commands.get(name)?.(args) as Promise<void>,
    shutdown: (reason: string) => handlers.get("session_shutdown")?.({ reason }, ctx) as Promise<void>,
  };
}

test("the mode label is drawn once on the frame in insert, normal and Ex states", async (t) => {
  const h = await vimHarness(t);
  const editor = h.currentEditor();

  const insertFrame = h.render();
  const insertLabels = labelsIn(insertFrame, " INSERT ");
  assert.equal(insertLabels.length, 1);
  assert.equal(insertLabels[0], insertFrame.at(-1));
  assert.match(insertLabels[0], /─/);

  sendKeys(editor, ["\x1b"]);
  assert.equal(editor.getMode(), "normal");
  const normalFrame = h.render();
  assert.equal(labelsIn(normalFrame, " NORMAL ").length, 1);
  assert.equal(labelsIn(normalFrame, " INSERT ").length, 0);

  sendKeys(editor, [":", "q"]);
  const exFrame = h.render();
  assert.equal(labelsIn(exFrame, " EX :q_ ").length, 1);

  sendKeys(editor, ["\x1b"]);
  // An autocomplete row renders below the frame border; the label stays on the border line only.
  Reflect.set(editor, "autocompleteState", "regular");
  Reflect.set(editor, "autocompleteList", {
    render: () => ["  suggestion"],
    handleInput() {},
    getSelectedItem: () => null,
  });
  const autocompleteFrame = h.render();
  assert.equal(labelsIn(autocompleteFrame, " NORMAL ").length, 1);
  assert.match(labelsIn(autocompleteFrame, " NORMAL ")[0] ?? "", /─/);
  assert.equal(labelsIn(autocompleteFrame, "  suggestion").length, 1);
});

test("an Ex command reaches Pi's onSubmit through the delayed-send wrapper without delay", async (t) => {
  const h = await vimHarness(t, { sendDelayMs: 4000 });
  const editor = h.currentEditor();
  const submitted: string[] = [];
  editor.onSubmit = (text: string) => {
    submitted.push(text);
  };

  sendKeys(editor, ["\x1b", ":", ..."powerline".split(""), "\r"]);

  assert.deepEqual(submitted, ["/powerline"]);
});

test("in NORMAL mode Enter on /compact uses Powerline's compaction path and the stash toggles", async (t) => {
  const h = await vimHarness(t);
  const editor = h.currentEditor();

  editor.setText("/compact");
  sendKeys(editor, ["\x1b"]);
  assert.equal(editor.getMode(), "normal");
  sendKeys(editor, ["\r"]);

  assert.equal(h.compactions.length, 1);
  assert.equal(editor.getExpandedText(), "");

  editor.setText("draft");
  sendKeys(editor, ["\x13"]);
  assert.equal(editor.getExpandedText(), "");
  assert.equal(h.statuses.get("stash"), "stash");

  sendKeys(editor, ["\x13"]);
  assert.equal(editor.getExpandedText(), "draft");
});

test("a preset rebuild builds one editor and cursor-shape cleanup restores the terminal", async (t) => {
  const h = await vimHarness(t);
  assert.deepEqual(h.hardwareCursorValues, [true]);
  assert.equal(h.foreignEditors.length, 1);
  assert.equal(h.borderColorReads(), 1);

  await h.runCommand("powerline", "minimal");

  // One editor per Pi construction: the rebuild reused the captured foreign factory and did not
  // build a second Powerline editor.
  assert.equal(h.editors.length, 2);
  assert.equal(h.foreignEditors.length, 2);
  assert.equal(h.borderColorReads(), 2);
  assert.equal(typeof h.currentEditor().getMode, "function");
  assert.equal(labelsIn(h.render(), " INSERT ").length, 1);
  // The cursor-shape installation is session-scoped: the rebuild did not re-take the hardware cursor.
  assert.deepEqual(h.hardwareCursorValues, [true]);

  await h.runCommand("powerline", "");

  assert.deepEqual(h.hardwareCursorValues, [true, false]);
  assert.ok(h.terminalWrites.includes("\x1b[0 q"), `expected a cursor-shape reset, got ${JSON.stringify(h.terminalWrites)}`);
});

test("persistent bash mode is refused in Vim mode and one-off !command completion still routes", async (t) => {
  const h = await vimHarness(t);
  const editor = h.currentEditor();

  await h.runCommand("bash-mode", "on");

  assert.ok(
    h.notifications.some(({ message }) => message.includes("Persistent bash mode is unavailable")),
    `expected a refusal notification, got ${JSON.stringify(h.notifications)}`,
  );
  assert.match(h.render()[1] ?? "", />/, "the frame keeps the normal prompt glyph");

  const installed = editor.autocompleteProvider;
  assert.notEqual(installed, h.piProvider, "Powerline wraps Pi's provider for the Vim editor");

  const signal = AbortSignal.abort();
  assert.equal(installed.shouldTriggerFileCompletion(["!ls src/"], 0, 8), true);
  assert.deepEqual(await installed.getSuggestions(["@sr"], 0, 3, { signal }), { items: [], prefix: "@sr" });
});

test("the rounded frame carries the segments on its top rule and the live Vim label on its bottom rule", async (t) => {
  const h = await vimHarness(t, { editor: { mode: "vim", frame: "rounded" } });
  const editor = h.currentEditor();
  const plain = (lines: string[]) => lines.map((line) => line.replace(/\x1b\[[0-9;]*m/g, ""));

  const insertFrame = plain(h.render());
  assert.equal(insertFrame.length, 3, "top rule, one body row and bottom rule");
  assert.ok(insertFrame[0]!.startsWith("\u256d") && insertFrame[0]!.endsWith("\u256e"));
  assert.match(insertFrame[0]!, /Test model/);
  assert.ok(insertFrame[1]!.startsWith("\u2502 > ") && insertFrame[1]!.endsWith(" \u2502"));
  assert.ok(insertFrame.at(-1)!.startsWith("\u2570") && insertFrame.at(-1)!.endsWith("\u256f"));
  assert.match(insertFrame.at(-1)!, / INSERT /);
  assert.deepEqual(insertFrame.map((line) => visibleWidth(line)), [FRAME_WIDTH, FRAME_WIDTH, FRAME_WIDTH]);

  // The label is read at paint time, so a mode switch shows without any layout change.
  sendKeys(editor, ["\x1b"]);
  const normalFrame = plain(h.render());
  assert.match(normalFrame.at(-1)!, / NORMAL /);
  assert.doesNotMatch(normalFrame.at(-1)!, / INSERT /);
});

test("the Vim backend leaves the frame border in Pi's colour", async (t) => {
  const h = await vimHarness(t);
  const frame = h.render();
  const border = frame[0];
  const labelLine = frame.at(-1) ?? "";

  assert.ok(border.includes(borderColorEscape), "the frame border keeps the editor border colour");
  assert.ok(!border.includes(modeColorEscape("borderMuted")), "the border is not painted in the mode colour");
  assert.ok(labelLine.includes(modeColorEscape("borderMuted")), "the label uses the insert mode colour");
});

test("the vendored seam members Powerline reads still exist", () => {
  const editor = new ModalEditor(stubTui, stubTheme, stubKeybindings);

  for (const member of vendorSeamMembers()) {
    assert.equal(
      typeof Reflect.get(editor, member),
      "function",
      `ModalEditor.${member} is missing from the vendored snapshot; vim-editor.ts needs an update`,
    );
  }
});

test("copyInputToClipboard is refused when only a project settings file enables it", async (t) => {
  const h = await vimHarness(
    t,
    { editor: { mode: "vim", vim: { exCommand: { piDispatch: false } } } },
    { editor: { mode: "vim", vim: { exCommand: { copyInputToClipboard: true } } } },
  );

  const exCommand = Reflect.get(h.currentEditor(), "exCommandSettings");
  assert.equal(exCommand.copyInputToClipboard, false);
  assert.equal(exCommand.piDispatch, false, "the merged project value still applies to piDispatch");
});

test("copyInputToClipboard is enabled from the user-global settings file", async (t) => {
  const h = await vimHarness(t, { editor: { mode: "vim", vim: { exCommand: { copyInputToClipboard: true } } } });

  assert.equal(Reflect.get(h.currentEditor(), "exCommandSettings").copyInputToClipboard, true);
});

test("a Vim settings warning names the powerline namespace and is shown once per session", async (t) => {
  const h = await vimHarness(t, { editor: { mode: "vim", vim: { clipboardMirror: "sometimes" } } });

  const warning = 'Invalid powerline.editor.vim.clipboardMirror "sometimes" (type string); expected all, yank, never.';
  const warnings = () => h.notifications.filter(({ message }) => message === warning);
  assert.equal(warnings().length, 1);
  assert.equal(h.currentEditor().getClipboardMirrorPolicy(), "all");

  await h.runCommand("powerline", "minimal");

  assert.equal(warnings().length, 1, "the rebuild does not repeat the settings warning");
});

test("session shutdown hands the cursor shape back, idempotently", async (t) => {
  const h = await vimHarness(t);
  assert.deepEqual(h.hardwareCursorValues, [true]);

  await h.shutdown("new");
  await h.shutdown("new");

  assert.deepEqual(h.hardwareCursorValues, [true, false]);
  assert.equal(h.terminalWrites.filter((write) => write === "\x1b[0 q").length, 1);
});
