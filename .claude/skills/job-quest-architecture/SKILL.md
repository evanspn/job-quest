---
name: job-quest-architecture
description: How the Job Quest Herdr mod in this repo is put together: its files, the local data folder's schema, how fields, tabs and agent tasks fit, and the steps to add a field, a stage, a tab or an agent-driven action. Use before changing anything under mods/job-quest/ or tests/.
---

# Job Quest: how it is built

Job Quest is a Herdr mod: one panel with five tabs (Intake, Profile, Pipeline, Drafts, Submit) over a folder of plain files. For Herdr's own rules see the `herdr-mod-development` skill.

## Design rules

- **The repo holds code only.** A person's data lives in their data folder (`~/job-quest-data`, or `shared("job-quest.dir")`). Never write data into the repository.
- **Files are the source of truth.** The panel shows a snapshot of the folder, re-read on start, after each of its own writes, and whenever `watchFolder` reports a change. Agents and the person edit the files too, so every reader tolerates a missing or malformed file.
- **The panel does not think.** Anything that needs judgement (drafting, summarizing, interviewing) is a task handed to a coding agent in a new tab, where the person watches and steers.
- **Never invent, never send.** Every drafting task carries the no-inventing rule. Email is only ever a draft the person sends.

## Files

| File | Holds |
| --- | --- |
| `mods/job-quest/mod.json` | Docked right at 440 px; overlay size for `mod.open` |
| `mods/job-quest/main.js` | The `View`: state, actions, one method per tab |
| `mods/job-quest/model.js` | Shapes and rules, no Herdr imports: stages, coercion, slugs, stage changes, repository merging, `mailto` |
| `mods/job-quest/store.js` | Every read and write of the data folder |
| `mods/job-quest/prompts.js` | Each agent task, and the `AGENTS.md` written into the data folder |
| `mods/job-quest/guides.js` | Resume, cover letter and email guides written on first run |
| `keys.json` | The key a person may merge to open the panel |
| `RECIPE.md` | The brief to rebuild the mod; keep it true to the files |
| `tests/` | `model.test.mjs` (rules), `panel.test.mjs` (the view over a temp folder), `stubs/` (stand-ins for Herdr's modules) |

## Data folder

```
AGENTS.md  CLAUDE.md         written by the panel: what an agent started here is told
intake.json                  { roles, seniority, workMode, locations, salaryMin,
                               stack, companyStage, dealBreakers, notes }  all strings
repos.json                   [{ fullName, url, isPrivate, isIncluded, summary }]
profile/                     the person's documents; notes.md (word dump); master.md
guides/                      resume-guide.md, cover-letter-guide.md, email-guide.md
applications/<id>/
  application.json           { id, company, role, url, stage, contactName, contactEmail,
                               appliedAt, followUpAt, notes, createdAt, updatedAt }
  posting.md  resume.md  cover-letter.md  email.md
```

Dates are `YYYY-MM-DD`. `stage` is one of lead, drafting, ready, applied, interview, offer, rejected, closed. An id is a slug of company and role. Whether a document exists is read from the folder listing, never stored.

The schema is written in three places that must agree: the coercions in `model.js`, `APPLICATION_KEYS` / `INTAKE_FIELDS` there, and `agentsFile` in `prompts.js` (what agents are told). `AGENTS.md` is rewritten on every start; guides are written only when missing.

## How the view works

- `this.snap` is the last snapshot; `this.selected` the chosen application id; `this.tab` the tab. Tab and selection are remembered in `localStorage`.
- **Fields:** `syncFields()` runs after every load and selection, never in `render`. It keeps one `InputState` per editable value in `this.fields`, keyed `intake:<key>` or `app:<id>:<key>`, with the value last read from disk. A field whose text still equals that value follows the file; one the person changed is left alone. `saveFields()` saves all of them at once.
- **Writes:** every edit goes through `mutate(cx, work)`, which runs edits one at a time and reloads after. `store.js`'s `put` reads before writing because `writeTextFile` needs the current text.
- **Agents:** `ask(name, task)` starts the chosen agent (`shared("job-quest.agent")`, else Claude, else the first installed) with `tab.new` in the data folder. The panel learns the result only from the folder changing.
- **The watch:** `start()` holds a generation counter so changing the data folder ends the old watch loop.

## Recipes

**Add an intake field.** Add it to `INTAKE_FIELDS` in `model.js` (the form and `toIntake` follow it) and to `INTAKE_KEYS` in `prompts.js`.

**Add an application field.** Add it to `APPLICATION_KEYS` and `toApplication` in `model.js` and to `agentsFile` in `prompts.js`. If the panel edits it, add it to `APP_FIELDS` in `main.js` and draw it with `labelled(label, `app:${app.id}:<key>`, t)` in the right tab.

**Add a stage.** Add it to `STAGES` (order is display order) and `STAGE_LABEL` in `model.js`, and to the stage list in `agentsFile`.

**Add an agent-driven action.** Export the task from `prompts.js`, taking `dir` (and the application) and naming every file by absolute path. Call it from a button with `this.ask("Tab name", prompts.name(dir, app))`. If it writes a new kind of file, teach `loadApplication` in `store.js` to notice it.

**Add a tab.** Add it to `TABS`, write a `nameTab(t)` method, and add its branch to `body(t)`. A tab that needs an application starts with `if (!app) return this.pickFirst(t);`.

**Change a document's rules.** Edit the guide in `guides.js` for new installs. Tasks point at the guide files and do not repeat their rules.

## Before committing

1. `npm test`, with a test added or extended for the flow changed.
2. Where Herdr is installed: copy `mods/job-quest/` to `~/.config/herdr-app/mods/job-quest/`, run `herdr-app check` on that copy, and look at the change in the app. The tests cannot stand in for this.
3. Keep `README.md` and `RECIPE.md` true to the files.
