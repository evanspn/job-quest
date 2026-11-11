# Job Quest

A whole window for a software job search. A board of applications by stage sits beside the selected application and, when one is working, your coding agent. Other views hold your profile and what you are looking for. All data is plain files in a local folder, and the same mod works alone as a tabbed panel.

No `preview.png` yet: take one in the app with `herdr-app shot`.

## What you see

- **Bar** (44 px, `chrome`): "Job Quest" semibold; chips Pipeline, Profile, Intake, Terminals (24 px, the shown view on `selected`); at the right the chosen agent's name, "Starting agent…" in `working` while one starts, and chips Agent pane, Refresh, Back to Herdr.
- **Body** (12 px padding, 12 px gaps): cards on `surface` with a 1 px `border` and 12 px radius.
- **Pipeline: board** (left, fills): a New application field, a `blocked` line for follow-ups due, then columns 210 px wide, one per stage, scrolling sideways. Leads to Offer always show; Rejected and Closed only when used. Each column has a semibold heading with a count and cards (8 px radius, `background`; the selected one `selected` with an `accent` border): company, role in `muted`, which documents exist, and the follow-up date (`blocked` when due). Under 700 px wide the columns become groups one above another, empty ones hidden.
- **Pipeline: application** (right, 520 px): the name at 15 px; stage chips; applied and follow-up dates in `done`; fields for posting link, contact name and email side by side, follow-up date, notes; Save. A Draft heading with what exists, then Draft both (solid), Resume only, Cover letter only. A Submit heading, then Write email, Open in mail app (once an email exists), Export PDFs, Mark as applied. A Documents card with chips Posting, Resume, Cover letter, Email (a `·` marks one not written), an Edit button and the markdown; editing shows Save, Cancel and a 420 px editor.
- **Profile:** files in `profile/`, Open profile folder; a word dump area with Add to notes; the master profile's state with Build or Update; GitHub projects with Import from GitHub, Summarize included (n), an add field, and a row per repository (checkbox, name, `private` / `summarized`).
- **Intake:** nine labelled fields, Save, Interview me; the data folder with Open folder and Change; a chip per installed agent.
- **Terminals:** the active tab's panes as cards.
- **Agent pane** (right, 520 px, hidden at first): the focused agent's terminal.
- **Status bar:** Herdr's own.
- **Errors:** a line in `ansi1` at the top of the part that failed, with Dismiss.

## How it behaves

- Type `Company, Role` and Enter: a new card in Leads, selected. A taken id gets `-2`, `-3`.
- Click a card: the application view follows, in the layout through shared state, in the panel by switching tab.
- Enter in any text field saves every text field. A field the person has not touched follows its file when the file changes; one they are typing in is left alone.
- A stage chip sets the stage. The first move to Applied stamps today and a follow-up seven days out.
- Save posting: a bare link is stored as the application's `url`; anything else becomes `posting.md`.
- Draft, Write email, Export PDFs, Interview me, Build master profile and Summarize included start the chosen agent in a new tab in the data folder. Drafting from a lead moves it to Drafting. Write email and Export PDFs refuse until a resume exists. In the layout, the agent pane opens on the new agent within a second or two.
- Edit, change, Save writes the document only if the file is still what was opened. If an agent wrote meanwhile, an error says so and the text stays in the editor.
- Import from GitHub runs `gh repo list` and adds repositories it does not have, left out. A row click toggles inclusion.
- Open in mail app turns `email.md` into a `mailto:` address for the system opener.
- The folder is watched; any change re-reads it. After its own save a copy also bumps a shared revision so the other copies reload.

## Built from

- **Layout** `layouts/job-quest.json`: `column root` of `jq-bar` (block, 44 px), `jq-body` (row) and `jq-status` (block `workspace-status`, 28 px). `jq-body` holds `jq-view` (a stack: `jq-pipeline` = row of `jq-board` and `jq-detail` 520 px; `jq-profile`; `jq-intake`; `jq-terminals` = `{ "tab": "active" }`) and `jq-agent` (`{ "agent": "focused" }`, 520 px, hidden). System title bar. Preview `layouts/job-quest.svg`.
- **Mod** `mods/job-quest`, `mod.json` `{ "place": "none", "title": "Job Quest", "overlay": { "width": 620, "height": 780 } }`. `props.part` is `bar`, `board`, `detail`, `profile` or `intake`; none is the tabbed panel.
  - `main.js` state and actions; `views.js` drawing; `ui.js` shared pieces; `model.js` shapes and rules; `store.js` the folder; `prompts.js` agent tasks and the data folder's `AGENTS.md`; `guides.js` the three guides.
- **Shared keys:** `job-quest.selected`, `job-quest.revision`, `job-quest.dir`, `job-quest.agent`.
- **`herdr`:** `run` (`tab.new`, `layout.select`, `layout.show`, `layout.toggle`, `layout.switch`, `agent.focus`), `exec`, `theme`, `notify`, `knownAgents`, `agents`, `pickFolder`, `shared`, `setShared`, `watchFolder`, `window`, `layout`, `settings`, `props`, `nextCommand`, `home`, `readTextFile`, `writeTextFile`. `gpui-base`: `InputState`/`Input`, `TextareaState`/`Textarea`, `EditorState`/`Editor`, `TextView`. `fs/promises` `readdir`.
- **Programs:** `gh`; `open` / `xdg-open` / `cmd /c start`.
- **Commands** (`nextCommand`): `refresh`, `open-<id>`, `tab-<name>`, `doc-<posting|resume|letter|email>`.
- **Keys:** `ctrl-shift-j` to `layout.switch:job-quest`.
- **Modelled on** three gallery entries: Kanban (one mod in several blocks by `props.part`, a view stack, an agent block), Spec Board (files as the database, list and detail, edit in place, test commands), Over9k (a layout whose mod also stands alone, agents taught by `AGENTS.md`).

## Watch out

- Each block is a separate copy of the mod. Nothing on the instance is shared; use `shared()`.
- Create `InputState`s after a load or a selection, never while rendering.
- `writeTextFile` rejects unless `expected` is exactly what the file holds: read first, one edit at a time, and treat a rejection on a document as a conflict.
- `fs.readdir` reads only inside the home folder: a data folder elsewhere lists as empty.
- `run()` returns nothing. The started agent is found by comparing `agents()` before and after.
- Implicit pane commands fail while a layout terminal or agent block has focus; this mod sends none.
- An agent may write malformed JSON. Every reader coerces and never throws.
- A `mailto:` body is limited by the mail app; `email.md` is the full text.
- This build has not been through `herdr-app check` or seen in the app.

## Done when

- `herdr-app check ~/.config/herdr-app/mods/job-quest` passes, and `npm test` passes.
- `herdr-app do layout.switch --name job-quest` shows the bar, the board and an empty application view.
- Adding `Acme, Backend Engineer` puts a card in Leads and fills the application view.
- The Profile chip in the bar swaps the body; Terminals shows the active tab.
- Draft both opens a new tab running the agent in the data folder, the card moves to Drafting, and the agent pane opens on it.
- After the agent writes `resume.md`, the card shows `resume` and the Resume document previews, without Refresh.
- Editing the resume and saving changes the file; saving after the file changed underneath reports a conflict and keeps the typed text.
- `herdr-app do job-quest.open-acme-backend-engineer` selects that application.
