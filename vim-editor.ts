import { CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import type { EditorBackend, EditorBackendFactory } from "./editor-composition.ts";
import type { EditorVimSettings } from "./powerline-config.ts";
import { ModalEditor } from "./vim/index.ts";
import { resolveClipboardMirrorPolicy } from "./vim/clipboard-policy.ts";
import { buildModeColorizers, resolveModeColors } from "./vim/mode-colors.ts";
import { fitModeLabel } from "./vim/mode-label.ts";
import { resolveExCommandSettings } from "./vim/settings.ts";
import { enableCursorShapeSupport, type CursorShapeCleanup } from "./vim/cursor-shape.ts";

const REVERSE_VIDEO = (text: string) => `\x1b[7m${text}\x1b[27m`;

/**
 * The vendored members Powerline reads through. ModalEditor keeps its label text, its label
 * colorizer, the cursor-shape sync and its built-in Ex command names private, and Powerline needs
 * each of them: the frame draws the label the editor no longer draws, the render override keeps the
 * cursor shape synced, and the Ex bridge has to know Pi's commands. Keep this list minimal —
 * `vendorSeamMembers` is asserted by a test, so a vendored rename fails loudly instead of quietly
 * dropping a feature.
 */
const VENDOR_SEAM_MEMBERS = ["getModeLabel", "getModeLabelColorizer", "syncCursorShapeForRender", "commandNamesFn"] as const;

type VendorInternals = {
  getModeLabel(): string;
  getModeLabelColorizer(): ((text: string) => string) | null;
  syncCursorShapeForRender(lines: string[]): void;
  commandNamesFn(): ReadonlySet<string>;
};

export function vendorSeamMembers(): readonly string[] {
  return VENDOR_SEAM_MEMBERS;
}

function vendorInternals(editor: ModalEditor): VendorInternals {
  for (const member of VENDOR_SEAM_MEMBERS) {
    if (typeof Reflect.get(editor, member) !== "function") {
      throw new Error(`ModalEditor.${member} is missing: the vendored seam in vim-editor.ts needs an update`);
    }
  }

  return editor as unknown as VendorInternals;
}

/**
 * ModalEditor appends its mode label to the editor's last line and syncs the cursor shape inside
 * `render()`. Powerline's frame draws that label on its own bottom border instead, so this backend
 * renders the editor chrome only and keeps the cursor-shape sync the label-free path would skip.
 */
class FrameLabelModalEditor extends ModalEditor {
  render(width: number): string[] {
    const lines = CustomEditor.prototype.render.call(this, width) as string[];
    vendorInternals(this).syncCursorShapeForRender(lines);
    return lines;
  }
}

export interface VimRuntime {
  createBackend: EditorBackendFactory;
  /** Idempotent: hands the terminal cursor shape back to whoever had it before the first Vim editor. */
  restoreCursorShape(event?: { reason?: string }): void;
}

export function createVimRuntime(options: {
  pi: ExtensionAPI;
  ctx: any;
  settings: EditorVimSettings;
}): VimRuntime {
  const { pi, ctx, settings } = options;

  const clipboardMirror = resolveClipboardMirrorPolicy(settings.clipboardMirror);
  const exCommand = resolveExCommandSettings(settings.exCommand, settings.globalExCommand);
  for (const warning of [clipboardMirror.warning, exCommand.warning]) {
    // The vendored resolvers name their own `piVim.*` namespace in their warnings.
    if (warning && ctx.hasUI) ctx.ui.notify(warning.replace("piVim.", "powerline.editor.vim."), "warning");
  }

  const theme = ctx.ui.theme;
  const labelColorizers = theme ? buildModeColorizers(theme, resolveModeColors(settings.modeColors), REVERSE_VIDEO) : null;

  // Session-scoped: the first Vim editor installs the cursor-shape support, later rebuilds reuse it
  // so they never overwrite its record of the original terminal state.
  let cursorShapeCleanup: CursorShapeCleanup | null = null;
  let cursorShapeInstalled = false;

  const createBackend: EditorBackendFactory = (tui, editorTheme, keybindings): EditorBackend => {
    if (!cursorShapeInstalled) {
      cursorShapeInstalled = true;
      cursorShapeCleanup = enableCursorShapeSupport(tui);
    }

    const editor = new FrameLabelModalEditor(tui, editorTheme, keybindings, { labelColorizers });
    const internals = vendorInternals(editor);
    // ModalEditor's default command-name source is its built-in Ex name set; Powerline unions it
    // with Pi's commands, resolved per submit so commands registered mid-session stay dispatchable.
    const builtinCommandNames = internals.commandNamesFn();
    editor.setClipboardMirrorPolicy(clipboardMirror.policy);
    editor.setQuitFn(() => ctx.shutdown());
    editor.setNotifyFn((message) => ctx.ui.notify(message, "warning"));
    editor.setExCommandSettings(exCommand.settings);
    editor.setCommandNamesFn(() => new Set([
      ...builtinCommandNames,
      ...pi.getCommands().map((command) => command.name),
    ]));

    return {
      editor,
      // The fast renderer bypasses render(), which would skip the frame label and the cursor shape.
      fastRender: false,
      getFrameLabel: (width) => {
        const rawLabel = fitModeLabel(internals.getModeLabel(), width);
        const colorize = internals.getModeLabelColorizer();
        return colorize ? colorize(rawLabel) : rawLabel;
      },
    };
  };

  return {
    createBackend,
    restoreCursorShape(event) {
      const cleanup = cursorShapeCleanup;
      cursorShapeCleanup = null;
      cursorShapeInstalled = false;
      cleanup?.(event);
    },
  };
}
