import { truncateToWidth, visibleWidth, type AutocompleteProvider } from "@earendil-works/pi-tui";

export type EditorFactory = (tui: any, editorTheme: any, keybindings: any) => any;

export interface EditorBackend {
  /** The editor the shared Powerline behaviour wraps. */
  editor: any;
  /**
   * Whether the fast renderer may replace the framed render. It bypasses `render()`, so a backend
   * that supplies a frame label has to keep this false or the label is lost.
   */
  fastRender: boolean;
  /** Optional label for the frame's bottom border, fitted to the width it is handed. */
  getFrameLabel?: (width: number) => string | undefined;
}

export type EditorBackendFactory = (tui: any, editorTheme: any, keybindings: any) => EditorBackend;

/** A frame border line: a full-width rule, or one carrying the backend's label at its right end. */
export function renderFrameBorder(width: number, colorBorder: (text: string) => string, label?: string): string {
  const innerWidth = Math.max(0, width - 2);
  if (!label) {
    return ` ${colorBorder("─".repeat(innerWidth))}`;
  }

  const fitted = truncateToWidth(label, innerWidth, "");
  return ` ${colorBorder("─".repeat(Math.max(0, innerWidth - visibleWidth(fitted))))}${fitted}`;
}

export interface FrameGroups {
  left: string[];
  right: string[];
}

// The two corners and the rule beside each corner; a group is padded by one space on each side.
const FRAME_CHROME_WIDTH = 4;

function groupWidth(parts: string[], separator: string): number {
  return parts.length === 0 ? 0 : visibleWidth(parts.join(` ${separator} `)) + 2;
}

/** Keeps whole parts, in order, from one end while the group still fits the budget. */
function fitGroup(parts: string[], budget: number, separator: string, fromEnd = false): string[] {
  let kept: string[] = [];
  for (const part of fromEnd ? [...parts].reverse() : parts) {
    const next = fromEnd ? [part, ...kept] : [...kept, part];
    if (groupWidth(next, separator) > budget) break;
    kept = next;
  }
  return kept;
}

/**
 * The rounded frame's top and bottom rules. The top fills from its left group, so the right group
 * keeps whatever space remains. The bottom reserves its right group (the Vim label) first, so the
 * label wins when space is short.
 */
export function renderRoundedFrame(options: {
  width: number;
  colorBorder: (text: string) => string;
  separator: string;
  top: FrameGroups;
  bottom: FrameGroups;
}): { top: string; bottom: string } {
  const { width, colorBorder, separator } = options;
  const budget = width - FRAME_CHROME_WIDTH;

  const topLeft = fitGroup(options.top.left, budget, separator);
  const topRight = fitGroup(options.top.right, budget - groupWidth(topLeft, separator), separator, true);

  const bottomRight = fitGroup(options.bottom.right, budget, separator, true);
  const bottomLeft = fitGroup(options.bottom.left, budget - groupWidth(bottomRight, separator), separator);

  const rule = (open: string, close: string, left: string[], right: string[]): string => {
    const fill = budget - groupWidth(left, separator) - groupWidth(right, separator);
    const leftText = left.length > 0 ? ` ${left.join(` ${separator} `)} ` : "";
    const rightText = right.length > 0 ? ` ${right.join(` ${separator} `)} ` : "";
    return colorBorder(`${open}─`) + leftText + colorBorder("─".repeat(fill)) + rightText + colorBorder(`─${close}`);
  };

  return {
    top: rule("╭", "╮", topLeft, topRight),
    bottom: rule("╰", "╯", bottomLeft, bottomRight),
  };
}

const POWERLINE_EDITOR_FACTORY = Symbol.for("pi-powerline-footer.editorFactory");

/** Recognises a factory Powerline installed itself, including one installed before a reload. */
export function isPowerlineEditorFactory(factory: unknown): boolean {
  return typeof factory === "function" && Reflect.get(factory, POWERLINE_EDITOR_FACTORY) === true;
}

export interface EditorFactoryTracker {
  /** Tags Powerline's own factory so a later rebuild never adopts it as the previous one. */
  own<T extends EditorFactory>(factory: T): T;
  /** The foreign factory a rebuild should build on, given the factory now installed. */
  capture(installed: unknown): EditorFactory | undefined;
}

/**
 * Pi's `ctx.ui.getEditorComponent()` returns whatever factory is currently installed, which after
 * the first setup is Powerline's own. Adopting that factory on a rebuild would construct the whole
 * chain of earlier Powerline editors again, so an installed factory Powerline recognises as its own
 * keeps the remembered foreign factory, and any other installed factory replaces it. The tag is
 * process-global so the recognition survives a `/reload`, while the remembered factory does not
 * need to.
 */
export function createEditorFactoryTracker(): EditorFactoryTracker {
  let foreignFactory: EditorFactory | undefined;

  return {
    own(factory) {
      Reflect.set(factory, POWERLINE_EDITOR_FACTORY, true);
      return factory;
    },
    capture(installed) {
      if (typeof installed !== "function") {
        foreignFactory = undefined;
      } else if (!isPowerlineEditorFactory(installed)) {
        foreignFactory = installed as EditorFactory;
      }
      return foreignFactory;
    },
  };
}

export function getEditorAutocompleteProvider(sourceEditor: unknown): AutocompleteProvider | undefined {
  const candidate = sourceEditor && typeof sourceEditor === "object" ? Reflect.get(sourceEditor, "autocompleteProvider") : null;
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }
  if (typeof Reflect.get(candidate, "getSuggestions") !== "function") {
    return undefined;
  }
  if (typeof Reflect.get(candidate, "applyCompletion") !== "function") {
    return undefined;
  }
  return candidate;
}

export function passAutocompleteProviderThroughPreviousEditor(
  provider: AutocompleteProvider,
  previousEditor: unknown,
): AutocompleteProvider {
  if (!previousEditor || typeof previousEditor !== "object") {
    return provider;
  }

  const setAutocompleteProvider = Reflect.get(previousEditor, "setAutocompleteProvider");
  if (typeof setAutocompleteProvider !== "function") {
    return getEditorAutocompleteProvider(previousEditor) ?? provider;
  }

  setAutocompleteProvider.call(previousEditor, provider);
  return getEditorAutocompleteProvider(previousEditor) ?? provider;
}
