# Vendored pi-vim

`vim/` is a verbatim snapshot of [lajarre/pi-vim](https://github.com/lajarre/pi-vim) at
`e55b07c05b648f3bbccf656c2b0c6ec63f1a91d1` (v0.14.2). Nothing in this tree is edited by Powerline:
the `.js` import specifiers, the enums, and every other upstream choice stay as they are. All
integration lives in `vim-editor.ts` and the editor factory in `index.ts`.

## File list

Runtime files (`vim/`):

```
clipboard-mirror.ts  clipboard-policy.ts  cursor-shape.ts  index.ts  input-keys.ts
mode-change-command.ts  mode-colors.ts  mode-label.ts  motions.ts  settings.ts
text-objects.ts  types.ts  visual.ts  word-boundary-cache.ts
LICENSE  tsconfig.json
```

Test files (`vim/test/`), with the helpers they import:

```
clipboard-policy-editor.test.ts  clipboard-policy.test.ts  cursor-shape.test.ts
dot-repeat-review.test.ts  input-keys.test.ts  modal-editor.test.ts  mode-label.test.ts
motions.test.ts  settings.test.ts  text-objects.test.ts  visual.test.ts
harness.ts  nvim-oracle.ts
```

Excluded from the snapshot: `script/`, `doc/`, `README.md`, `AGENTS.md`, the lint/CI configuration,
and the `nvim-parity*` suites (they need a live Neovim oracle).

`vim/index.ts`'s default export, which registers pi-vim's own editor, is never called. Powerline
imports `ModalEditor`, its helpers, and the settings/clipboard/cursor-shape modules.

## Refreshing the snapshot

```sh
git clone https://github.com/lajarre/pi-vim /tmp/pi-vim-src
git -C /tmp/pi-vim-src checkout <commit>
mkdir -p vim/test
cp /tmp/pi-vim-src/*.ts vim/
cp /tmp/pi-vim-src/LICENSE /tmp/pi-vim-src/tsconfig.json vim/
cp /tmp/pi-vim-src/test/*.test.ts vim/test/
cp /tmp/pi-vim-src/test/harness.ts /tmp/pi-vim-src/test/nvim-oracle.ts vim/test/
```

## Known incompatibility

`vim/test/modal-editor.test.ts` → "keeps the software cursor when focused render has no cursor
marker" fails against the installed `@earendil-works/pi-tui` (0.84.4, and 1.1.0 as bundled with
Pi). That pi-tui emits `CURSOR_MARKER` whenever the editor is focused, including while
autocomplete is visible, so pi-vim's assertion that the focused render carries no marker no longer
holds; pi-vim instead syncs the cursor shape and drops the software cursor while autocomplete is
open. Upstream pi-vim has no newer commit.

`npm run test:vim` therefore skips that one case with
`--test-skip-pattern='keeps the software cursor when focused render has no cursor marker'`. Remove
the pattern when a pi-vim refresh makes the test pass again; it is the only skip in the run.
