---
name: job-quest-architecture
description: How the Job Quest mod in this repo is put together: its files, the local data folder's schema, how the panel's tabs, fields and prompts fit, and the steps to add a tab, a field, a stage or a Claude-driven action. Use before changing anything under hooks/, types/ or tests/.
---

# Job Quest: how it is built

Job Quest is a mod that draws a five-tab panel (Intake, Profile, Pipeline, Drafts, Submit) and keeps all its data as files in a local folder. For general mod rules see the `mod-development` skill.

## Design rules

- **The repo holds code only.** Application data lives in the person's data folder (`~/job-quest-data` by default, the `dataDir` option). Never write data into the repository.
- **Files are the source of truth.** The panel's state is a snapshot of the folder, re-read on session start, after every turn, after each write, and on Refresh. Claude and the person may edit the files directly, so every reader tolerates a missing or malformed file.
- **The mod does not call a model itself.** Anything that needs judgement (drafting, summarizing, interviewing) is a prompt handed to the chat, where the person sees and steers it.
- **Never invent, never send.** Every drafting prompt carries the no-inventing rule, and email is only ever a Gmail draft.

## Files

| File | Holds |
| --- | --- |
| `.claude-plugin/plugin.json` | Manifest, the `dataDir` option, the path of the state contract |
| `.claude-plugin/marketplace.json` | Makes the repo installable as a marketplace |
| `types/index.d.ts` | Data types and the `PluginState` contract (`snapshot`, `view`) |
| `hooks/register.tsx` | The hooks and the whole panel: one render hook, one function per tab |
| `hooks/storage.ts` | Every read and write of the data folder, and coercion of what is read |
| `hooks/prompts.ts` | Each prompt a button submits, and the system prompt section |
| `hooks/guides.ts` | The resume, cover letter and email guides written on first run |
| `tests/pane.test.tsx` | Panel flows against an in-memory file system |

## Hooks

- `session.start`: registers `/job-quest`, writes the guides if missing, loads the snapshot, opens the pane.
- `command.run` for `job-quest`: reloads and opens the pane.
- `turn.complete`: reloads, since Claude may have written files.
- `prompt.compose`: appends the `job-quest:data` section describing the folder, so chat requests like "add this posting" land in the right files.
- `ui.render` for the pane: draws the tab row and the current tab.

## Data folder

```
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

Dates are `YYYY-MM-DD`. `stage` is one of lead, drafting, ready, applied, interview, offer, rejected, closed. An application's id is a slug of company and role. Whether a document exists is read from the folder listing, never stored.

This schema appears in three places that must agree: `types/index.d.ts`, the coercion functions in `storage.ts`, and `dataSection` in `prompts.ts` (which is what Claude is told). Guides are written only when missing, so editing `guides.ts` does not change a guide a person already has.

## State

- `snapshot` (`Shaped<Snapshot>`): the folder as last read, plus `dir` and `today`.
- `view` (`Shaped<View>`): current tab, selected application id, open preview.
- `typed` (module-level `Map`): unsaved field text, keyed `intake-<field>` or `<appId>-<field>`.

Bump the atom's `shape` tag in `register.tsx` when `Snapshot` or `View` changes.

## Recipes

**Add an intake field.** Add it to `Intake` in the types, to `EMPTY_INTAKE` and `toIntake` in `storage.ts`, to `INTAKE_FIELDS` in `register.tsx`, and to `INTAKE_KEYS` in `prompts.ts`. Bump `snapshot`'s shape tag.

**Add an application field.** Add it to `Application`, to `toApplication`, `saveApplication` and `createApplication` in `storage.ts`, and to `dataSection`. If it is edited in the panel, add it to `AppField` and `APP_FIELDS` and draw it with `appField(...)`. Bump the shape tag.

**Add a stage.** Add it to `Stage`, to `STAGES` (order is display order), to `STAGE_LABEL`, and to the stage list in `dataSection`.

**Add a Claude-driven action.** Write the prompt as an exported function in `prompts.ts` taking `dir` (and the row), naming absolute paths for everything read and written. Call it from a Button with `ask($, prompts.name(dir), 'toast text')`. If the action writes a new kind of file, teach `loadApplication` to notice it.

**Add a tab.** Add its id to `Tab`, an entry to `TABS` (with the next hotkey digit), a `nameTab` function inside the render hook, and a branch in `body`. Tabs that need a selected application fall through to `needsPick`.

**Change a document's rules.** Edit the guide text in `guides.ts` for new installs. Prompts point at the guide files and do not repeat their rules.

## Before committing

Run the three checks from `mod-development`, add or extend a test in `tests/pane.test.tsx` for the flow changed, and keep `README.md`'s tab table and folder layout current.
