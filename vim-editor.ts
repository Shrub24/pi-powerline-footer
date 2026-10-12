import { copyToClipboard, CustomEditor, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { themeBackgroundEscape } from "./colors.ts";
import type { EditorBackend, EditorBackendFactory } from "./editor-composition.ts";
import type { EditorVimSettings } from "./powerline-config.ts";
import { ModalEditor } from "./vim/index.ts";
import { resolveClipboardMirrorPolicy } from "./vim/clipboard-policy.ts";
import { buildModeColorizers, resolveModeColors, type ModeColorKey } from "./vim/mode-colors.ts";
import { fitModeLabel } from "./vim/mode-label.ts";
import { resolveExCommandSettings } from "./vim/settings.ts";
import { enableCursorShapeSupport, type CursorShapeCleanup } from "./vim/cursor-shape.ts";
import type { Mode } from "./vim/types.ts";
import { getInclusiveEndColumn, getVisualLineRange, isVisualMode, orderVisualEndpoints, type VisualMode, type VisualPosition } from "./vim/visual.ts";

const REVERSE_VIDEO = (text: string) => `\x1b[7m${text}\x1b[27m`;
// Black text on the mode's background: readable on every mode colour the default theme uses.
const BADGE_FOREGROUND = "\x1b[30m";
const BACKGROUND_RESET = "\x1b[39m\x1b[49m";

/**
 * Each mode's default token is a different core theme colour, so the four labels differ by colour.
 * A token the theme gives no colour falls back to that mode's fixed token, distinct per mode, so two
 * modes never share a look because one of their tokens is missing.
 */
export const MODE_COLOR_DEFAULTS: Record<ModeColorKey, string> = {
  insert: "success",
  normal: "accent",
  visual: "warning",
  ex: "error",
};
const MODE_FALLBACK_TOKENS: Record<ModeColorKey, string> = {
  insert: "muted",
  normal: "borderAccent",
  visual: "customMessageLabel",
  ex: "borderMuted",
};

const CLIPBOARD_WRITE_TOOLS = ["wl-copy", "xclip", "xsel", "pbcopy", "clip", "termux-clipboard-set"];

/**
 * Nothing can receive the mirror: no platform tool for the clipboard, and no terminal for Pi's
 * OSC 52 fallback. Only then is the user told, once, why yanks stay in the Vim register.
 */
export function clipboardWriteUnavailable(options: { path?: string; isTTY?: boolean } = {}): boolean {
  const directories = (options.path ?? process.env.PATH ?? "").split(delimiter);
  const onPath = (command: string) => directories.some((directory) => directory !== "" && existsSync(join(directory, command)));

  if (CLIPBOARD_WRITE_TOOLS.some(onPath)) return false;
  return !(options.isTTY ?? process.stdout.isTTY);
}

/**
 * The vendored members Powerline reads through. ModalEditor keeps its label text, its label
 * colorizer, the cursor-shape sync and its built-in Ex command names private, and Powerline needs
 * each of them: the frame draws the label the editor no longer draws, the render override keeps the
 * cursor shape synced, and the Ex bridge has to know Pi's commands. Keep this list minimal —
 * `vendorSeamMembers` is asserted by a test, so a vendored rename fails loudly instead of quietly
 * dropping a feature.
 */
const VENDOR_SEAM_MEMBERS = ["getModeLabel", "getModeLabelColorizer", "getActiveMode", "syncCursorShapeForRender", "commandNamesFn", "layoutText", "getVisualAnchor"] as const;

type VendorInternals = {
  getModeLabel(): string;
  getModeLabelColorizer(): ((text: string) => string) | null;
  getActiveMode(): ModeColorKey;
  syncCursorShapeForRender(lines: string[]): void;
  commandNamesFn(): ReadonlySet<string>;
  layoutText(contentWidth: number): LayoutChunk[];
  getVisualAnchor(): VisualPosition;
  /** The vendored editor's mode field; pi-tui's Editor does not type it. */
  mode: Mode;
};

export function vendorSeamMembers(): readonly string[] {
  return VENDOR_SEAM_MEMBERS;
}

/**
 * A mode's background: its configured token, else its fixed fallback token. The background is the
 * token's theme foreground colour escape with 38 turned into 48, so it follows the Pi theme. Pi's
 * bundled theme can resolve a token to the terminal default (only a dim attribute), which has no
 * colour to paint, so the caller falls back to reverse video when this is undefined.
 */
export function modeBackground(mode: ModeColorKey, colors: Record<ModeColorKey, string>, theme: { getFgAnsi(token: string): string }): string | undefined {
  return themeBackgroundEscape(theme, colors[mode].trim()) ?? themeBackgroundEscape(theme, MODE_FALLBACK_TOKENS[mode]);
}

export function modeBadge(text: string, mode: ModeColorKey, colors: Record<ModeColorKey, string>, theme: { getFgAnsi(token: string): string }): string {
  const background = modeBackground(mode, colors, theme);
  if (!background) return `\x1b[7m${text}\x1b[27m`;
  return `${background}${BADGE_FOREGROUND}${text}${BACKGROUND_RESET}`;
}

/** Escapes that open and close the Visual selection's highlight around its cells. */
export type SelectionStyle = { open: string; close: string };
const REVERSE_SELECTION: SelectionStyle = { open: "\x1b[7m", close: "\x1b[27m" };

function visualSelectionStyle(theme: { getFgAnsi(token: string): string }, colors: Record<ModeColorKey, string>): SelectionStyle {
  const background = modeBackground("visual", colors, theme);
  return background ? { open: `${background}${BADGE_FOREGROUND}`, close: BACKGROUND_RESET } : REVERSE_SELECTION;
}

/** One screen row of an editor's text as pi-tui lays it out, before the cursor cell is drawn. */
type LayoutChunk = { text: string; hasCursor: boolean; cursorPos?: number };

const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Whether the cell at (logical line, column) is inside the selection, for charwise and linewise Visual. */
function selectedColumns(mode: VisualMode, anchor: VisualPosition, cursor: VisualPosition, lines: string[]): (line: number, col: number) => boolean {
  if (mode === "visual-line") {
    const { startLine, endLine } = getVisualLineRange(anchor, cursor);
    return (line) => line >= startLine && line <= endLine;
  }
  const { start, end } = orderVisualEndpoints(anchor, cursor);
  const endColumn = getInclusiveEndColumn(lines[end.line] ?? "", end.col);
  return (line, col) => {
    if (line < start.line || line > end.line) return false;
    const from = line === start.line ? start.col : 0;
    const to = line === end.line ? endColumn : Number.POSITIVE_INFINITY;
    return col >= from && col < to;
  };
}

/**
 * Wraps the chunk's graphemes in the highlight. The cursor cell is drawn by pi-tui as its own reverse
 * video followed by a full reset, so the highlight is closed before it and reopened after it, and the
 * cursor offset moves with the inserted escapes.
 */
function paintChunk(text: string, cursorPos: number | undefined, selected: (index: number) => boolean, style: SelectionStyle): { text: string; cursorPos?: number } {
  let out = "";
  let open = false;
  let cursorOut: number | undefined;
  for (const { segment, index } of GRAPHEMES.segment(text)) {
    const wanted = selected(index);
    if (wanted !== open) {
      out += wanted ? style.open : style.close;
      open = wanted;
    }
    if (index === cursorPos) cursorOut = out.length;
    out += segment;
    if (index === cursorPos) open = false;
  }
  if (open) out += style.close;
  return { text: out, cursorPos: cursorPos === undefined ? undefined : (cursorOut ?? out.length) };
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
  selectionStyle: SelectionStyle = REVERSE_SELECTION;

  constructor(...args: ConstructorParameters<typeof ModalEditor>) {
    super(...args);
    // pi-tui types layoutText as private, and the vendored editor draws no Visual selection of its own.
    // Wrapping layoutText on the instance paints the highlight into the layout rows without editing vendor code.
    const layoutText = vendorInternals(this).layoutText.bind(this);
    Reflect.set(this, "layoutText", (contentWidth: number) => this.paintVisualSelection(layoutText(contentWidth)));
  }

  render(width: number): string[] {
    const lines = CustomEditor.prototype.render.call(this, width) as string[];
    vendorInternals(this).syncCursorShapeForRender(lines);
    return lines;
  }

  private paintVisualSelection(chunks: LayoutChunk[]): LayoutChunk[] {
    const internals = vendorInternals(this);
    if (!isVisualMode(internals.mode)) return chunks;

    const lines = this.getLines();
    const selected = selectedColumns(internals.mode, internals.getVisualAnchor(), this.getCursor(), lines);
    // Chunks come in order and cover their logical lines in order, so each one is found after the last.
    let line = 0;
    let offset = 0;
    return chunks.map((chunk) => {
      let index = -1;
      while (line < lines.length && index === -1) {
        const text = lines[line] ?? "";
        index = chunk.text === "" ? (text === "" && offset === 0 ? 0 : -1) : text.indexOf(chunk.text, offset);
        if (index === -1) {
          line++;
          offset = 0;
        }
      }
      if (index === -1) return chunk;

      const logicalLine = line;
      const start = index;
      offset = start + chunk.text.length;
      const painted = paintChunk(chunk.text, chunk.cursorPos, (column) => selected(logicalLine, start + column), this.selectionStyle);
      return { ...chunk, text: painted.text, cursorPos: painted.cursorPos };
    });
  }
}

export interface VimRuntime {
  createBackend: EditorBackendFactory;
  /** Idempotent: hands the terminal cursor shape back to whoever had it before the first Vim editor. */
  restoreCursorShape(event?: { reason?: string }): void;
}

/**
 * pi-vim's own write hook spawns a helper that resolves the native clipboard sidecar through the
 * pi-coding-agent module URL rather than the sidecar path next to the executable, so the helper never
 * finds it and yanks never reached the OS clipboard. Powerline injects Pi's writer instead, which
 * deliberately skips the Linux native writer — an X11-only one that drops selection ownership — for
 * wl-copy/xclip/xsel, and disables the vendored read hook.
 */
export interface VimClipboardOptions {
  /** Pi's `copyToClipboard` by default; injectable so a test can observe what the editor mirrors. */
  copy?: (text: string) => unknown;
}

/** Powerline's mode colours: the configured tokens, each mode's default filled in. */
function resolvePowerlineModeColors(settings: EditorVimSettings["modeColors"]) {
  return resolveModeColors({ ...MODE_COLOR_DEFAULTS, ...settings });
}

export function createVimRuntime(options: {
  pi: ExtensionAPI;
  ctx: any;
  settings: EditorVimSettings;
  clipboard?: VimClipboardOptions;
}): VimRuntime {
  const { pi, ctx, settings, clipboard } = options;

  const clipboardMirror = resolveClipboardMirrorPolicy(settings.clipboardMirror);
  const exCommand = resolveExCommandSettings(settings.exCommand, settings.globalExCommand);
  for (const warning of [clipboardMirror.warning, exCommand.warning]) {
    // The vendored resolvers name their own `piVim.*` namespace in their warnings.
    if (warning && ctx.hasUI) ctx.ui.notify(warning.replace("piVim.", "powerline.editor.vim."), "warning");
  }

  const copyToOsClipboard = clipboard?.copy ?? copyToClipboard;
  if (clipboardWriteUnavailable()) {
    if (ctx.hasUI) {
      ctx.ui.notify("Vim clipboard unavailable: install wl-clipboard, xclip, or xsel; yanks and deletes stay in the register", "warning");
    }
  }

  const theme = ctx.ui.theme;
  const modeColors = resolvePowerlineModeColors(settings.modeColors);
  const labelColorizers = theme ? buildModeColorizers(theme, modeColors, REVERSE_VIDEO) : null;

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
    if (theme) editor.selectionStyle = visualSelectionStyle(theme, modeColors);
    const internals = vendorInternals(editor);
    // ModalEditor's default command-name source is its built-in Ex name set; Powerline unions it
    // with Pi's commands, resolved per submit so commands registered mid-session stay dispatchable.
    const builtinCommandNames = internals.commandNamesFn();
    // The register stays authoritative for `p`/`P`: the OS clipboard is an outbound mirror only.
    // Both vendored defaults have to be replaced explicitly — they spawn `process.execPath -e` and
    // resolve the native sidecar through the module URL rather than the sidecar path, so they can
    // never work. Mirror writes go through Pi's own `copyToClipboard`.
    editor.setClipboardFn((text) => copyToOsClipboard(text));
    editor.setClipboardReadFn(() => null);
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
      getFrameLabel: (width, badge = false) => {
        const rawLabel = fitModeLabel(internals.getModeLabel(), width);
        if (badge) return modeBadge(rawLabel, internals.getActiveMode(), modeColors, theme);
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
