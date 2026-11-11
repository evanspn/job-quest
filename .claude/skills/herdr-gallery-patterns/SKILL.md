---
name: herdr-gallery-patterns
description: Architecture patterns distilled from three entries in the Herdr gallery (Kanban, Spec Board, Over9k) and how Job Quest uses each. Use when deciding whether something should be a layout, a mod, or both; when adding a new view, panel or agent action; or when structuring a new Herdr project.
---

# Patterns from the Herdr gallery

Three gallery entries were read in full before Job Quest was designed. Each solves part of the same problem: a workspace that is more than one panel. Read the originals when a pattern below is not enough.

| Entry | Repository | What it is |
| --- | --- | --- |
| Kanban | `dougcunha/herdr-mods`, `kanban-app/` | A layout plus one mod: agents as cards in columns, with the chosen agent's terminal beside the board |
| Spec Board | `dougcunha/herdr-mods`, `spec-board-app/` | One mod: a folder of markdown specs as a list and a detail, edited in place, with buttons that start agents |
| Over9k | `herunan/herdr-over9k` | A layout bundle of about fifteen mods, each panel also shipped as a standalone mod |

## Layout or mod?

- A **mod** is one panel. It can only draw inside its own block, plus overlays.
- A **layout** is the whole window: a JSON tree of `row`, `column`, `stack` and `block` nodes. A block shows a mod, a terminal, the active tab, or an agent's terminal.
- A workspace with several regions that must sit side by side is **both**: a layout that arranges blocks, and mods that fill them. All three entries with more than one region do this.
- Ship the mod so it also works alone. People keep their own layout and want one piece of yours.

## Pattern 1: one mod, many parts (Kanban)

The layout places the same mod in several blocks and tells each copy what to be:

```json
{ "id": "bar",   "type": "block", "content": { "mod": "kanban", "props": { "part": "bar" } }, "size": { "px": 44 } }
{ "id": "board", "type": "block", "content": { "mod": "kanban", "props": { "part": "board" } } }
```

- `main.js` reads `props().part` once in `init` and dispatches in `render`.
- Each block is a **separate copy** with its own instance, timers and `localStorage`. Anything two parts must agree on goes through `shared()` / `setShared()`, which is persisted and re-renders every copy.
- One mod folder means one hot reload, one set of helpers, one `herdr-app check`.

## Pattern 2: a stack for views, switched by command (Kanban)

```json
{ "id": "view", "type": "stack", "active": "board-view", "children": [ ... ] }
```

- Switch with `run("layout.select", { stack: "view", child: "tabs-view" })`.
- Read which is up from the tree: find the node in `layout()` and take its `active`. Do not keep a second copy of that fact.
- A copy in a hidden child stays alive but is not drawn, so it does no work until shown again.
- Keep one child that is `{ "tab": "active" }`, so the person can always get to their terminals without leaving the layout.

## Pattern 3: the agent's terminal as a block (Kanban)

```json
{ "id": "detail", "type": "block", "content": { "agent": "focused" }, "size": { "px": 460 } }
```

- `run("agent.focus", { terminal: address })` chooses which agent that block shows.
- `run()` returns nothing. To find what a command just made, record `agents()` (or `panes()`) before and compare after, on a timer.
- Show and hide the block with `layout.show`, `layout.hide`, `layout.toggle` by node id.

## Pattern 4: files as the database, list and detail (Spec Board)

- The data is a folder of files that agents and people also edit. The mod scans it, never caches beyond a snapshot, and tolerates anything malformed.
- Stay live with `watchFolder` in a loop, plus a slow timer as a fallback. `watchFolder` rejects for a folder that does not exist.
- **List and detail** in one mod: side by side when wide, one at a time when narrow. Width comes from `.on_size_change` on the root, divided by `settings().zoom`.
- **Preview and edit in place:** `TextView.markdown(id, text)` to read; `EditorState.new({ language: "markdown", value, soft_wrap: true, line_numbers: false })` with `Editor.new(state)` to edit; save with `writeTextFile(path, text, original)` and treat a rejection as a conflict to report, never to force.
- **Start agents from the data:** `knownAgents()` for what is installed, then `run("tab.new", { folder, argv: agent.run, task, name })`. The prompt is the agent's first message.
- **Commands for testing:** a `nextCommand()` loop that takes `refresh`, `open-<id>`, `tab-<id>` lets a shell drive the mod with `herdr-app do <mod>.<command>`, since nothing can click it. `herdr-app check` only sees the first render.
- Rules and parsing live in modules with no Herdr imports (`data.js`), so they can be tested outside the app.

## Pattern 5: a bundle that is also separate mods (Over9k)

```
over9k/              the whole layout: layouts/, mods/, keys.json, keys.macos.json, RECIPE.md
over9k-todo/         one panel alone: mods/, RECIPE.md, preview.png
over9k-launcher/     ...
tools/build-mods.py  copies each mod out of the bundle with a mod.json that docks it alone
```

- One source of truth for the code (the bundle's `mods/`); the standalone folders are generated.
- The layout keeps Herdr's familiar skeleton (sidebar, tab bar, `{ "tab": "active" }`, a hidden right panel holding a `stack`, the status bar) and swaps in its own mods. People are not lost.
- Small mods, one idea each. A right-hand `stack` of panels is how several of them share one column.
- macOS gets its own `keys.macos.json` with Cmd where people expect it.
- **Teach the agents.** Over9k's to-do mod writes a short rule into `CLAUDE.md` / `AGENTS.md` and gives agents a command, so agents keep the data themselves.

## What Job Quest takes

| Pattern | In Job Quest |
| --- | --- |
| One mod, many parts | `mods/job-quest` draws `bar`, `board`, `detail`, `profile`, `intake`; no part is the all-in-one `panel` |
| Stack for views | `jq-view` holds `jq-pipeline`, `jq-profile`, `jq-intake`, `jq-terminals`; the bar runs `layout.select` |
| Agent block | `jq-agent`, hidden until an agent is started, then `agent.focus` and `layout.show` |
| Files as the database | `~/job-quest-data`, `watchFolder`, plus a shared revision so sibling copies reload after a save |
| List and detail | The board and the detail are two blocks in the layout, two tabs in the panel; the board goes from columns to groups under 700 px |
| Edit in place | The detail's documents: markdown preview, `Editor`, conflict-checked save |
| Test commands | `job-quest.refresh`, `open-<id>`, `tab-<name>`, `doc-<name>` |
| Works alone too | With no `part`, the mod is a tabbed panel for any layout (`mod.open:job-quest`, or a block) |
| Teach the agents | `AGENTS.md` and `CLAUDE.md` written into the data folder, where agents are started |

Not taken: Over9k's generated standalone folders (one mod does not need a build step), Kanban's custom title bar (`"titlebar": "none"` means drawing window buttons on Linux and Windows), and drag between columns (stage chips do it).
