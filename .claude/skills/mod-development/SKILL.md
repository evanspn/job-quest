---
name: mod-development
description: Rules and gotchas for writing a Claude Code mod (a function-hooks plugin with a panel, band, command or tool hooks), learned building this repo. Use when adding or changing hooks, panel UI, state, or tests in a mod, or when `claude plugin validate`, `tsc` or `claude plugin test` fails on one.
---

# Developing a mod

A mod is a Claude Code plugin whose `hooks/hooks.json` names one hooks module. This skill holds what is not obvious from the API and cost time to find. It is not the API reference.

**The reference is the build's own.** Load the built-in `plugin-authoring` skill first: it gives the path of this build's `claude-code.d.ts` (about 14,000 lines) and `reference.md`. Grep the types file for the name at hand (`'tool.call'`, `export type InputProps`, `PaneOpenArgs`). The API is early access and changes between releases, so check the types before trusting anything written here.

## The three checks

Run all three after every change, from the mod's folder:

```
claude plugin validate .     # reads the module as the engine will; lists hooks and $ calls
tsc -p .                     # needs .claude-plugin/types/, which the engine lays once it has loaded the mod
claude plugin test .         # runs tests/*.test.tsx against the engine
```

Where `.claude-plugin/types/` does not exist yet (a fresh clone, a CI box), type-check with a `tsconfig.json` kept outside the mod whose `include` names the skill's `types/claude-code.d.ts` plus the mod's `hooks`, `types` and `tests`.

`tsc` passing does not mean the module loads. `validate` enforces rules the type checker cannot see (below).

## Rules `validate` enforces on `$`

`$` is traced through the source, so where it may go is restricted:

- In the hooks module, `$` may be passed only to a function **declared at the top level of the file** (a function declaration or a top-level `const` bound to one), or to one imported from the mod's own files. A helper defined inside `register` that takes `$` is refused. Closures inside a hook may still *capture* `$`, as `onPress={() => update($, atom, fn)}` does.
- In an **imported** file, a function that takes `$` must be a `function` declaration. `export const f = ($) => ...` is refused there.
- The parameter is always spelled `$`, and calls are always `$.noun.method(...)`.
- `$.env.get(name)` takes a string literal. `$.state` references take literal `plugin` and `key`.
- Helpers that need the plugin's `options` take them as a second argument, since they can no longer close over `register`'s.

## Module environment

- No DOM, no Node, no `require`, no `import()`. Everything outside the module goes through `$`.
- Import the mod's own files with a plain `import` declaration and no extension (`./storage`).
- `$.fs` has `read`, `write`, `list`, `exists`, `stat`. There is no delete or rename: design data so nothing needs removing (a `closed` stage instead of deleting a folder).
- `$.fs.write` creates missing directories. `$.fs.list` and `$.fs.read` reject on a missing path, so wrap them with `.catch`.
- `~` is not expanded. Resolve the home folder with `$.env.get('HOME')`, falling back to `USERPROFILE`.

## State

- Values a drawing reads live in `$.state`, declared in `types/index.d.ts` under `interface PluginState` and named in `plugin.json` as `"types"`. Use `atom`, `read` and `update` from `'claude-code'`.
- A render hook never writes state. Write from a handler closure or another event.
- State survives a hot reload, so new code meets values old code stored. Declare the key `Shaped<T>` and give the atom a `shape` tag; change the tag whenever the value's fields change.
- Module variables are lost on reload. Use them only for what may be lost.

## Panel UI

- Elements come from `$.ui.resolve(e)`, never globals. `Box`, `Text`, `Button`, `Input`, `Select`, `Link`, `Code` and `Markdown` exist on all four surfaces (terminal, desktop, vscode, mobile). There is no tab element: tabs are a row of Buttons and a `tab` value in state.
- Every Button in a list needs its own `key`. A Button's children may only be strings and `Text`.
- `Text` takes no `key`. A `key` on a `Box` makes it a hover scope, so do not add one for list identity.
- **Input text is easy to lose.** A redraw resets every Input to its `value` prop, so text typed in field A vanishes when field B's submit redraws. Keep unsaved text in a module-level `Map` written by `onInput`, pass `map.get(key) ?? stored` as `value`, and save every field of the form on any submit.
- **`onSubmit` does not imply `onInput` fired.** Use the value `onSubmit` receives; do not rely on what `onInput` recorded.
- Pass optional props by spreading (`{...(rows === undefined ? {} : { rows })}`) and not as `rows={undefined}`.
- Handlers are typed `() => void`. Start async work with a wrapper that catches and reports through `$.ui.toast`, so a failed write is seen and never thrown into the engine.
- `$.prompt.submit` resolves when its turn *starts*, which may be long after the press. Do not await it in a handler; fire it and toast.

## Working with the model

- A button that needs Claude submits a prompt with `$.prompt.submit({ text })`. Write the prompt to stand alone: absolute paths of every file to read and write, the exact fields of any JSON, and what to say in the reply.
- Files Claude wrote during a turn are picked up by re-reading on `turn.complete`.
- Standing context (where the data lives, file schemas) goes in a `prompt.compose` hook: append one `{ id: '<plugin>:<name>', text, scope: 'session' }` after `next(e)`'s sections. Keep its text the same for a whole conversation.

## Tests

- Tests import `test`, `expect`, `mock` from `'claude-code/testing'`. Nothing sits beneath the mod: the test's `on` hooks stand for the engine.
- A call on `$` is answered `{ value }` or `{ deny }` (`on('fs.read', (_, e) => ({ value: text }))`). An event is answered with its own result: a `prompt.submit` hook must return `{ text }` or `{ drop }`, and returning `{}` gets the hook skipped.
- `mock.env(on, { HOME })` and `mock.clock(on, { now })` cover those nouns. The file system has no mock: answer `fs.exists`, `fs.read`, `fs.write` and `fs.list` from a `Map` (see `tests/pane.test.tsx`).
- Mount with `$.ui.mount({ plugin, surface, component: 'Pane', requestId, props })` and act by key: `ui.press`, `ui.input`, `ui.find`. `ui.input` defaults to a submit; pass `kind: 'change'` for a keystroke.
- State persists across mounts within one test. Looping over surfaces reuses what the last surface left, so give each iteration its own data.
- Loop over at least `['terminal', 'desktop']` so the mod is shown not to depend on one surface.
- Record `ui.toast` texts in the mock and assert none carry the error prefix: a swallowed handler error otherwise looks like a missing file.

## Sharing

The repository is its own marketplace: `.claude-plugin/marketplace.json` lists the mod with `"source": "./"`. Before committing anything from a mod's folder, run the `mcp__plugin-authoring__scan_secrets` tool on it. `.claude-plugin/types/` is engine-written and stays out of git.
