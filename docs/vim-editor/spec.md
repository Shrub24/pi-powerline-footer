# Vim editor backend: specification

Fork: `Shrub24/pi-powerline-footer`, tracking `nicobailon/pi-powerline-footer`
(remote `upstream`). Base: upstream `9ed2915` (v0.20.0).
Vim source: `lajarre/pi-vim` at `e55b07c` (v0.14.2).

## Invariants

- The default editor behaves exactly as before. Selecting Vim changes only
  which editor is constructed; both editors receive Powerline's shared
  behaviour, and Vim never imitates `BashModeEditor` internals.
- The vendored Vim tree stays a recognisable upstream snapshot. All
  integration lives in small Powerline-owned files or factory changes.
  Low rebase cost wins over abstracting shared behaviour.
- Full parity with standalone pi-vim is not a goal. A pi-vim feature that
  Powerline duplicates or supersedes, or that we do not need, is dropped by
  leaving it unwired in the adapter. The vendored code itself is not edited.
  If a behaviour change cannot be made without a vendored edit, it is recorded
  as a patch in `vim/UPSTREAM.md`. Each such case is decided individually; see
  [Feature disposition](#feature-disposition).

## Configuration

```json
{ "powerline": { "editor": { "mode": "vim" } } }
```

- `mode` is `"default"` (when omitted) or `"vim"`. Any other value warns once
  and falls back to `"default"`, following the existing `invalid*` pattern in
  `powerline-config.ts`.
- The mode is read at startup. There is no runtime switching and no
  `/powerline` subcommand for it.
- Vim settings live under `powerline.editor.vim`, and only the settings for
  kept features are recognised (see [Feature disposition](#feature-disposition)).
  No `piVim` configuration exists today, so the namespace moves without a
  compatibility shim. The adapter passes the parsed object to the vendored
  `resolve*` functions and does not call `readPiVimSettings`.

## Feature disposition

All rows are decided.

| pi-vim feature | Disposition |
| --- | --- |
| Editing engine: modes, motions, operators, text objects, counts, registers, undo/redo, `.` repeat, visual modes, bracketed-paste guards | Keep. This is the reason for vendoring. |
| Ex line: `:q` family, the Pi-command bridge, `:!cmd`, reserved names | Keep. |
| Prompt snapshot and restore around an Ex dispatch | Keep. It is part of the bridge's correctness. |
| Ex options `piDispatch`, `copyInputToClipboard` | Keep as `powerline.editor.vim.exCommand`. Cheap passthrough. |
| Clipboard mirror and policy (`clipboardMirror`) | Keep. Future Wayland work builds on it. |
| Cursor shape per mode | Keep (session-scoped, see below). |
| Mode label drawn on the editor's last line | Superseded by the label on Powerline's frame. |
| Mode colours for the label (`modeColors`) | Keep, for the label on Powerline's frame only (`powerline.editor.vim.modeColors`). |
| Mode-coloured border and the sync policies (`borderSync`, `labelSync`, "defer while thinking", deprecated `syncBorderColorWithMode`) | Drop. Pi and Powerline already colour the border for thinking level, and dropping these removes pi-vim's largest settings surface. |
| `modeChange` shell commands and the `pi-vim:mode-change` event | Drop both. They are unused, and the commands run shell commands on every mode change. Powerline can emit its own event later if needed. |
| Normal-mode Escape passed through to Pi (aborts the agent) | Keep. During a pending send, Powerline's restore wins (see Escape below). |
| Alt insert shortcuts (`Alt+o`, `Shift+Alt+A/I/O`) | Keep. They do not collide with Powerline's defaults. |
| Powerline's `editorStart`/`editorEnd` shortcuts, currently implemented inside `BashModeEditor` | Not provided in Vim mode; `gg`/`G` supersede them. |
| Powerline's copy/cut editor shortcuts and stash | Keep. These are shared behaviour. |

## Slice 1: generic editor seams (upstream candidate)

No Vim imports or Vim knowledge. Behaviour is unchanged.

1. **Factory stacking.** `setupCustomEditor` currently reads
   `ctx.ui.getEditorComponent()` on every call, and after the first setup this
   returns Powerline's own factory. Each rebuild therefore constructs the whole
   chain of earlier editors. Capture the foreign (non-Powerline) factory once
   and reuse it on every rebuild, recognising Powerline's own factories (for
   example by tagging them in a `WeakSet`), so that earlier Powerline editors
   are never constructed. Skipping editors after they have been built is not
   enough.
2. **Autocomplete wrapping state.** The "Powerline provider installed" flag
   moves from `BashModeEditor` (`installAutocompleteProvider`,
   `hasWrappedProvider`) into the factory. The factory's existing
   `setAutocompleteProvider` override already distinguishes Powerline's own
   installation from Pi's, so it can reset the flag when Pi installs a new
   provider. `BashModeEditor` loses these methods.
3. **Construction seam.** Split `editorFactory` into backend construction (the
   `new BashModeEditor(...)` call and its bash-only options) and the shared
   enhancements:
   - delayed-send `onSubmit` property;
   - autocomplete wrapping;
   - input interception (pending send, compaction, stash, shortcuts,
     autocomplete recovery);
   - prompt history;
   - performance instrumentation;
   - the render frame.

   The seam carries only what the shared code needs from a backend:
   - the editor;
   - whether the fast renderer may be used;
   - an optional `getFrameLabel(width)`, drawn into the frame's bottom border
     when present. The default backend provides none.

**Acceptance**
- The existing suite (`npm test`) and `npm run typecheck` pass unchanged.
- New test: three successive `setupCustomEditor` calls against a `ctx.ui` stub
  whose `getEditorComponent` returns the installed factory construct exactly
  one foreign editor per Pi construction and never construct an earlier
  Powerline editor.
- New test: when Pi calls `setAutocompleteProvider` after Powerline has
  wrapped, Powerline re-wraps the new provider (this behaviour previously
  depended on the flag inside `BashModeEditor`).

## Slice 2: Vim backend (fork-owned)

### Vendoring

- `vim/`: pi-vim's runtime `*.ts` files, `LICENSE`, and `test/*.test.ts`
  together with the test helpers they import (`harness.ts`, `nvim-oracle.ts`).
  `script/`, `doc/` and `nvim-parity*` are excluded.
- `vim/UPSTREAM.md` records the repository, the commit (`e55b07c`), the file
  list, and the command used to refresh the snapshot.
- Vendored sources are not modified. In particular, the enums and `.js` import
  specifiers stay as they are.
- `npm run test:vim` runs the vendored tests through `tsx` (added as a dev
  dependency). `npm test` and its `--experimental-strip-types` runner are not
  changed.
- Typecheck the vendored tree with its own `tsconfig` (`vim/tsconfig.json`,
  copied from upstream) rather than adding it to the root `include`.
- `package.json` `files` ships `vim/*.ts` and `vim/LICENSE`. It does not ship
  the tests.
- The vendored `index.ts` default export, which registers its own editor, is
  never called. Powerline imports only `ModalEditor` and its helpers.

### Adapter: `vim-editor.ts`

- Builds `ModalEditor` following pi-vim's `session_start`, but wires only the
  features kept in [Feature disposition](#feature-disposition):
  - clipboard mirror policy;
  - `setQuitFn(() => ctx.shutdown())`;
  - notify;
  - Ex settings;
  - `setCommandNamesFn` over `EX_BUILTIN_COMMAND_NAMES` plus `pi.getCommands()`;
  - label colorizers built from `modeColors`. No border colorizers, sync maps
    or mode-change handler are wired.

  Settings warnings are shown once per session, not on every rebuild.
- **Mode label.** Powerline owns the frame and draws the label there. The
  adapter supplies `getFrameLabel(width)` from pi-vim's own label and colouring
  logic (`getModeLabel`, `fitModeLabel`, the label colorizer), so the Ex
  command label and pending-count label are preserved. The label appears
  exactly once: not duplicated on an autocomplete row, and not lost when the
  frame redraws the border.
- **Vendor internals.** Where these require private members, access goes
  through one narrowly scoped, commented seam in the adapter, never through
  edits to vendored files. A test fails if a vendor update renames those
  members.
- **Border colour.** With no border colorizers wired, pi-vim leaves Pi's
  border colour untouched, and Powerline's `colorEditorBorder` keeps reading
  `editor.borderColor` as before. A test confirms that the frame border is not
  painted in mode colours.
- **Fast renderer.** Off for the Vim backend. It bypasses `render()`, so it
  would skip the label and cursor-shape sync.

### Cursor shape (session-scoped)

- `enableCursorShapeSupport` runs at most once per session, on the first Vim
  editor construction. Later rebuilds reuse that installation and do not
  overwrite its record of the original terminal state.
- Cleanup runs on `session_shutdown` and on `/powerline` disable, is
  idempotent, and restores the original hardware-cursor setting and cursor
  shape.

### Persistent bash mode

- `setBashModeActive(true)` in Vim mode notifies that persistent bash mode is
  unavailable with the Vim editor, and returns without changing state. This
  one guard covers both the command and the shortcut.
- One-off `!command` keeps working, including its completion through
  `ModeAwareAutocompleteProvider`. Its ghost suggestion is not available in
  Vim mode.

### Escape and pending send

- Behaviour is unchanged. While a delayed send is pending (the editor is
  empty), Escape restores the pending prompt and Vim does not see the key.
  Otherwise Escape goes to Vim and switches mode.
- Document this in the README.

**Acceptance (integration tests, roughly 4–6, contract-level)**
1. The mode label is visible exactly once in the framed render, in normal,
   insert and Ex states, with and without autocomplete showing.
2. A `:name` Ex command reaches Pi's `onSubmit` through Powerline's
   delayed-send wrapper without delay, as slash commands do.
3. In NORMAL mode, Enter on `/compact` triggers Powerline's compaction path,
   and the stash shortcut stashes and restores.
4. A rebuild (preset change) constructs no hidden editors, and cursor-shape
   cleanup restores the original state after rebuild followed by
   `/powerline` off.
5. `/bash-mode` is refused in Vim mode with a notification, and `!cmd`
   completion still works.

Do not add tests that duplicate pi-vim's motion or operator coverage.

## Validation

1. Default backend: `npm test` and `npm run typecheck` pass unchanged after
   each slice.
2. Vendored: `npm run test:vim` passes.
3. Loader smoke: the real Pi-Bolt lead build loads the fork with
   `mode: "vim"`. This covers both the compiled build and a `-e` path load.
   If either loader fails to resolve the vendored modules, investigate the
   load or build boundary before touching vendored sources.
4. Manual terminal pass in both modes:
   - startup;
   - editing and submission;
   - autocomplete (`/`, `@`, `!`);
   - stash;
   - delayed send and Escape restore;
   - `/compact` and queue during compaction;
   - preset and placement change;
   - `/powerline` off and on;
   - `/reload`;
   - quit and cursor restore.

## Documented v1 limitations

- A preset or placement change, and the first-keystroke autocomplete recovery,
  rebuild the editor. Vim mode, undo history and registers reset.
- No persistent `/bash-mode` and no shell ghost suggestions in Vim mode.
- `:compact` goes to Pi's `/compact` and skips Powerline's queue-aware
  compaction interception. Typing `/compact` uses Powerline's path.
- Escape during a pending send restores the prompt instead of switching Vim
  mode.
- pi-vim features that were dropped (see
  [Feature disposition](#feature-disposition)) are listed in the README's Vim
  section, so users coming from standalone pi-vim can see what is missing.

## Out of scope

- Runtime editor switching and state transfer.
- Avoiding rebuilds on presentation changes (a later upstream PR).
- Wayland clipboard, mouse support and Vim ghost suggestions.
- Restoring a foreign editor factory on `/powerline` disable.

## Delivery

- Slice 1: bookmark `editor-factory-seams` based on `main@upstream`, kept
  PR-ready.
- Slice 2: on fork `main`, on top of slice 1.
- Deployment (dotfiles, separate change):
  - add the fork as a flake input with a `pkgs/pi-plugins` recipe and an
    `_pi-extensions.nix` row;
  - remove the `vim` and `starship` rows and recipes, and the `starship`
    settings key, once the smoke passes. Powerline replaces both;
  - never load these alongside Powerline.
