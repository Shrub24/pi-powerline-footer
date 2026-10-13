import test from "node:test";
import assert from "node:assert/strict";
import { visibleWidth, type AutocompleteProvider } from "@earendil-works/pi-tui";
import {
  createEditorFactoryTracker,
  getEditorAutocompleteProvider,
  isPowerlineEditorFactory,
  passAutocompleteProviderThroughPreviousEditor,
  renderFrameBorder,
  renderRoundedFrame,
  type EditorFactory,
} from "../editor-composition.ts";

function baseProvider(): AutocompleteProvider {
  return {
    async getSuggestions() {
      return {
        prefix: "@",
        items: [{ label: "base", value: "base" }],
      };
    },
    applyCompletion(lines, cursorLine, cursorCol) {
      return { lines, cursorLine, cursorCol };
    },
  };
}

test("previous editor autocomplete provider wrappers are preserved", async () => {
  const previousEditor = {
    autocompleteProvider: undefined as AutocompleteProvider | undefined,
    setAutocompleteProvider(provider: AutocompleteProvider) {
      this.autocompleteProvider = {
        async getSuggestions(lines, cursorLine, cursorCol, context) {
          const suggestions = await provider.getSuggestions(lines, cursorLine, cursorCol, context);
          return {
            ...suggestions,
            items: [...suggestions.items, { label: "previous-wrapper", value: "previous-wrapper" }],
          };
        },
        applyCompletion: provider.applyCompletion.bind(provider),
      };
    },
  };

  const composed = passAutocompleteProviderThroughPreviousEditor(baseProvider(), previousEditor);
  const suggestions = await composed.getSuggestions(["@"], 0, 1, { signal: new AbortController().signal });

  assert.equal(composed, previousEditor.autocompleteProvider);
  assert.deepEqual(suggestions.items.map((item) => item.label), ["base", "previous-wrapper"]);
});

test("autocomplete provider detection rejects incomplete editor providers", () => {
  assert.equal(getEditorAutocompleteProvider({ autocompleteProvider: {} }), undefined);
  assert.equal(getEditorAutocompleteProvider({ autocompleteProvider: { getSuggestions() {} } }), undefined);
  assert.ok(getEditorAutocompleteProvider({ autocompleteProvider: baseProvider() }));
});

test("editor rebuilds build on the foreign factory instead of nesting Powerline editors", () => {
  const tracker = createEditorFactoryTracker();
  const foreignEditors: Array<{ kind: "foreign" }> = [];
  const foreignFactory: EditorFactory = () => {
    const editor = { kind: "foreign" } as const;
    foreignEditors.push(editor);
    return editor;
  };

  const powerlineEditors: Array<{ previous: unknown }> = [];
  let installed: EditorFactory | undefined = foreignFactory;

  // One round is one setupCustomEditor call followed by Pi constructing the installed editor.
  for (let rebuild = 0; rebuild < 3; rebuild += 1) {
    const previousEditorFactory = tracker.capture(installed);
    const factory = tracker.own((tui, editorTheme, keybindings) => {
      const previousEditor = previousEditorFactory?.(tui, editorTheme, keybindings);
      const editor = { previous: previousEditor };
      powerlineEditors.push(editor);
      return editor;
    });

    assert.equal(isPowerlineEditorFactory(factory), true);
    installed = factory;
    factory({}, {}, {});
  }

  // One editor per Pi construction: no earlier Powerline editor was built a second time.
  assert.equal(powerlineEditors.length, 3);
  assert.equal(foreignEditors.length, 3);
  assert.deepEqual(powerlineEditors.map((editor) => editor.previous), foreignEditors);
});

test("the frame border carries a backend label inside the frame without changing its width", () => {
  const colorBorder = (text: string) => `\x1b[2m${text}\x1b[0m`;
  const strip = (text: string) => text.replace(/\x1b\[[0-9;]*m/g, "");

  // The default backend has no label: a plain rule, exactly as before.
  const plain = renderFrameBorder(40, colorBorder);
  assert.equal(plain, ` ${colorBorder("─".repeat(38))}`);
  assert.equal(visibleWidth(plain), 39);

  const labelled = renderFrameBorder(40, colorBorder, "\x1b[36m NORMAL \x1b[0m");
  assert.equal(strip(labelled), ` ${"─".repeat(30)} NORMAL `);
  assert.equal(visibleWidth(labelled), 39);

  // A label wider than the border is clipped so the frame keeps its width.
  const clipped = renderFrameBorder(20, colorBorder, "x".repeat(50));
  assert.equal(strip(clipped), ` ${"x".repeat(18)}`);
  assert.equal(visibleWidth(clipped), 19);
});

test("the rounded frame keeps whole segments: the top fills left first, the bottom reserves its label", () => {
  const plain = (text: string) => text;
  const frame = (width: number, top: { left: string[]; right: string[] }, bottom: { left: string[]; right: string[] }) =>
    renderRoundedFrame({ width, colorBorder: plain, separator: "\u00b7", top, bottom });

  // The right group keeps only the segment that still fits after the left group.
  const roomy = frame(30, { left: ["model", "path", "git"], right: ["cost", "ctx"] }, { left: [], right: [] });
  assert.equal(roomy.top, "\u256d\u2500 model \u00b7 path \u00b7 git \u2500 ctx \u2500\u256e");
  assert.equal(visibleWidth(roomy.top), 30);

  // A tight top keeps the left group's first segment and drops the rest of it.
  const tight = frame(16, { left: ["model", "path", "git"], right: ["cost", "ctx"] }, { left: [], right: [] });
  assert.equal(tight.top, "\u256d\u2500 model  ctx \u2500\u256e");

  // The title on the right shrinks into leftover space rather than displacing the left group.
  const fittedTitle = frame(20, { left: ["model"], right: ["long session title"] }, { left: [], right: [] });
  assert.match(fittedTitle.top.replace(/\x1b\[[0-9;]*m/g, ""), /long s…/);
  assert.equal(visibleWidth(fittedTitle.top), 20);

  // The Vim label is reserved before the bottom's secondary segments, so the segments give way.
  const labelled = frame(20, { left: [], right: [] }, { left: ["extension"], right: [" NORMAL "] });
  assert.equal(labelled.bottom, "\u2570" + "\u2500".repeat(7) + "  NORMAL  " + "\u2500\u256f");
  assert.equal(visibleWidth(labelled.bottom), 20);
});

test("a Powerline factory installed before a reload is recognised and never adopted", () => {
  const foreignFactory: EditorFactory = () => ({});
  const beforeReload = createEditorFactoryTracker();
  const installed = beforeReload.own((() => ({})) as EditorFactory);
  const afterReload = createEditorFactoryTracker();

  assert.equal(isPowerlineEditorFactory(installed), true);
  assert.equal(afterReload.capture(installed), undefined);
  assert.equal(afterReload.capture(foreignFactory), foreignFactory);
});

test("a foreign factory installed after Powerline's own is adopted on the next rebuild", () => {
  const tracker = createEditorFactoryTracker();
  const firstForeign: EditorFactory = () => ({});
  const secondForeign: EditorFactory = () => ({});
  const ownFactory = tracker.own((() => ({})) as EditorFactory);

  assert.equal(tracker.capture(firstForeign), firstForeign);
  // A rebuild sees Powerline's own factory installed: the remembered foreign factory stays.
  assert.equal(tracker.capture(ownFactory), firstForeign);
  // Another editor extension installing its factory replaces the remembered one.
  assert.equal(tracker.capture(secondForeign), secondForeign);
  assert.equal(tracker.capture(ownFactory), secondForeign);
  // With no custom editor installed there is nothing to build on.
  assert.equal(tracker.capture(undefined), undefined);
});
