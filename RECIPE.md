# Job Quest

A side panel for a software job search. Five tabs take the person from saying what they want, through gathering their history, to tracking each application, drafting its resume and cover letter with a coding agent, and preparing the email that submits it. All data is plain files in a local folder.

No `preview.png` yet: take one in the app with `herdr-app shot`.

## What you see

A column, 440 px wide when docked right, on the theme's `surface`, text 12.5 px.

- **Top bar:** five chips (Intake, Profile, Pipeline, Drafts, Submit), 24 px tall, the current one on `selected`; a Refresh chip at the right. A bottom border.
- **Error line:** only when something failed, in `ansi1`, with a Dismiss chip.
- **Body:** scrolls. Section headings are semibold with a dim aside. Text fields are 30 px, rounded 7, `input` border on `background`. Buttons are 28 px; the main action of a group is `solid`.
- **Intake:** nine labelled fields, Save and Interview me, the data folder with Open folder and Change, and a chip per installed agent.
- **Profile:** the files in `profile/`, a word dump text area with Add to notes, the master profile's state with Build or Update, then GitHub projects: Import from GitHub, Summarize included (n), an add field, and one row per repository with a checkbox, its name, and `private` / `summarized`.
- **Pipeline:** a New application field, a warning line for follow-ups due, then applications grouped under stage headings with counts. The selected row is on `selected`. Under the list, a card for the selected application: stage chips, posting link, follow-up date, notes, and Save, Drafts, Submit.
- **Drafts:** the application's name, which documents exist, a text area for the posting with Save posting, Draft both / Resume only / Cover letter only, View chips for each document, and a markdown preview card.
- **Submit:** contact name and email, Save, Write email, Export PDFs; once `email.md` exists, Open in mail app and View email; Mark as applied, or the applied and follow-up dates.

## How it behaves

- Enter in any text field saves every text field. A field the person has not touched follows its file when the file changes; one they are typing in is left alone.
- New application takes `Company, Role`, makes a slug id, selects it. A taken id gets `-2`, `-3`.
- A stage chip sets the stage. The first move to Applied stamps today's date and a follow-up seven days out.
- Save posting: a bare link is stored as the application's `url`; anything else becomes `posting.md`.
- Draft, Write email, Export PDFs, Interview me, Build master profile and Summarize included each start the chosen agent in a new tab (`tab.new` with `folder`, `argv`, `task`). Drafting from a lead moves it to Drafting. Write email and Export PDFs refuse until a resume exists.
- Import from GitHub runs `gh repo list` and adds repositories it does not have, left out. Clicking a repository row toggles whether it is included.
- Open in mail app turns `email.md` into a `mailto:` address and hands it to the system opener.
- The folder is watched; any change re-reads it. Agent statuses are not shown: the agent's own tab shows them.

## Built from

- `mods/job-quest/mod.json`: `{ "place": "right", "size": 440, "title": "Job Quest", "overlay": { "width": 560, "height": 760 } }`.
- `main.js`: the `View`. State on the instance; `InputState` per field kept in a `Map`; `TextareaState` for the word dump and the posting; `TextView.markdown` for previews.
- `model.js`: shapes and rules, no Herdr imports: stages, coercion of every file, slugs, stage changes, follow-ups, repository merging, `mailto`.
- `store.js`: the folder. `fs.readdir` to list, `readTextFile` / `writeTextFile` (with the current text as `expected`) to read and write, `shared("job-quest.dir")` for the folder.
- `prompts.js`: each agent task, and the `AGENTS.md` written into the data folder.
- `guides.js`: the three guides and the profile README.
- `herdr` functions: `run`, `exec`, `theme`, `notify`, `knownAgents`, `pickFolder`, `shared`, `setShared`, `watchFolder`, `window`, `home`, `readTextFile`, `writeTextFile`. Commands: `tab.new`. Programs: `gh`, and `open` / `xdg-open` / `cmd /c start`.
- `keys.json`: `ctrl-shift-j` to `mod.open:job-quest`.

## Watch out

- Create text field states outside `render` (in `init` and after each load), never while rendering.
- `writeTextFile` rejects unless `expected` is exactly what the file holds, so read first, and run edits one at a time.
- `fs.readdir` reads only inside the home folder: a data folder elsewhere lists as empty.
- An agent may write malformed JSON. Every reader coerces and never throws.
- `run()` returns nothing, so the panel cannot tell when an agent finishes. It relies on the folder watch.
- A `mailto:` body is limited by the mail app; a very long email may be cut. `email.md` is the full text.
- Guides are written only when missing, so changing `guides.js` does not update a guide a person already has.
- This build has not been through `herdr-app check`. Run it before calling a change done.

## Done when

- `herdr-app check ~/.config/herdr-app/mods/job-quest` passes.
- `npm test` passes.
- Adding `Acme, Backend Engineer` creates `applications/acme-backend-engineer/application.json` with stage `lead` and selects it.
- Typing in two intake fields and pressing Enter in one saves both to `intake.json`.
- Draft both opens a new tab running the chosen agent in the data folder, and the application moves to Drafting.
- After an agent writes `resume.md`, the row shows `resume` without pressing Refresh.
- Mark as applied sets `appliedAt` to today and `followUpAt` a week later.
