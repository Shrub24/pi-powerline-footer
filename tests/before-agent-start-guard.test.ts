import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// `before_agent_start` starts either a user-message run or a custom-message run. Pi-Bolt types it as a union
// where only the user variant carries `prompt`; upstream pi-coding-agent declares `prompt` as required. A
// custom-message run therefore reaches this handler with an absent prompt, and reading it threw inside the
// run, which Pi reported to the user as an extension error.
async function harness(t: test.TestContext) {
  const root = mkdtempSync(join(tmpdir(), "powerline-before-agent-start-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = root;
  writeFileSync(join(root, "settings.json"), JSON.stringify({ powerline: { welcome: false } }));

  const { default: extension } = await import("../index.ts");
  const workingMessages: (string | undefined)[] = [];
  const widgets = new Map<string, () => { render(width: number): string[] }>();
  const ctx = {
    cwd: root,
    hasUI: true,
    mode: "tui",
    sessionManager: { getBranch: () => [], getSessionId: () => "before-agent-start-guard", getCwd: () => root },
    ui: {
      notify() {},
      setWorkingMessage: (message?: string) => { workingMessages.push(message); },
      setStatus() {},
      setWidget(name: string, factory?: () => { render(width: number): string[] }) {
        if (factory) widgets.set(name, factory);
      },
      setFooter() {},
      setHeader() {},
      getEditorText: () => "",
      setEditorText() {},
      setEditorComponent() {},
      getEditorComponent: () => undefined,
      onTerminalInput: () => () => {},
    },
  };
  const handlers = new Map<string, (event: object, context: typeof ctx) => unknown>();
  (extension as unknown as (api: object) => void)({
    on: (name: string, handler: (event: object, context: typeof ctx) => unknown) => handlers.set(name, handler),
    registerCommand() {},
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
    workingMessages,
    beforeAgentStart: (event: object) => handlers.get("before_agent_start")!(event, ctx),
    // The last-prompt widget is the only observable effect of the prompt reaching the handler.
    lastPromptWidget: () => widgets.get("powerline-last-prompt")?.().render(120).join("\n") ?? "",
  };
}

test("a custom-message run does not throw in before_agent_start", async (t) => {
  const h = await harness(t);

  await assert.doesNotReject(async () => h.beforeAgentStart({
    messageType: "custom",
    message: { role: "custom", customType: "nudge", content: [{ type: "text", text: "hi" }] },
  }));
  await assert.doesNotReject(async () => h.beforeAgentStart({ prompt: undefined }));
  await assert.doesNotReject(async () => h.beforeAgentStart({}));
  await assert.doesNotReject(async () => h.beforeAgentStart({ prompt: null }));
});

test("a user-message run still reaches the prompt path", async (t) => {
  const h = await harness(t);

  await h.beforeAgentStart({ messageType: "user", prompt: "fix the parser" });

  assert.match(h.lastPromptWidget(), /fix the parser/);
});

test("a custom-message run leaves the last-prompt widget on the previous prompt", async (t) => {
  const h = await harness(t);
  await h.beforeAgentStart({ messageType: "user", prompt: "fix the parser" });

  await h.beforeAgentStart({ messageType: "custom", message: { role: "custom" } });

  assert.match(h.lastPromptWidget(), /fix the parser/);
});
