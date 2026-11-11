---
name: job-quest-architecture
description: How Job Quest is put together: the layout and the one mod that fills it, the parts and how they stay in step, the local data folder's schema, and the steps to add a field, a stage, a document, a view or an agent-driven action. Use before changing anything under layouts/, mods/job-quest/ or tests/.
---

# Job Quest: how it is built

Job Quest is a Herdr **layout** (`layouts/job-quest.json`) filled by **one mod** (`mods/job-quest`) drawn as several parts. The same mod with no part is a standalone tabbed panel. For why, see `herdr-gallery-patterns`; for Herdr's own rules, `herdr-mod-development`.

## Design rules

- **The repo holds code only.** A person's data lives in their data folder (`~/job-quest-data`, or `shared("job-quest.dir")`).
- **Files are the source of truth.** Every copy shows a snapshot of the folder. Agents and the person edit the files too, so every reader tolerates a missing or malformed file.
- **The mod does not think.** Drafting, summarizing and interviewing are tasks handed to a coding agent in a new tab.
- **Never invent, never send.** Every drafting task carries the no-inventing rule. Email is only ever a draft the person sends.

## The window

```
column root
  jq-bar        mod part "bar", 44 px: views, agent, refresh, back to Herdr
  row jq-body
    stack jq-view (active: jq-pipeline)
      row jq-pipeline
        jq-board    mod part "board": applications as columns by stage
        jq-detail   mod part "detail", 520 px: the selected application
      jq-party      mod part "party": roster, approvals, adventure log
      jq-profile    mod part "profile"
      jq-intake     mod part "intake"
      jq-terminals  column: jq-term-tabs (mod part "tabs": a tab per data-folder terminal)
                    over jq-term-view { agent: focused }; jq-agent is hidden while it shows
    jq-chat         mod part "chat", 380 px: the party chat (layout.toggle jq-chat)
    jq-agent        { agent: focused }, 520 px, hidden until an agent is started
    jq-rail         mod part "rail", 78 px: a tile per party agent; click swaps jq-agent to it
  jq-status     Herdr's workspace-status
```

`main.js` exports the ids it drives (`VIEW_STACK`, `AGENT_BLOCK`); a test checks the layout against them.

## Files

| File | Holds |
| --- | --- |
| `layouts/job-quest.json`, `.svg` | The window, and its picture for Herdr's settings |
| `mods/job-quest/mod.json` | `place: none` (the layout places it), overlay size for `mod.open` |
| `mods/job-quest/main.js` | The `View`: state and every action. Reads `props().part` |
| `mods/job-quest/views.js` | What each part looks like; calls the view's actions, touches no files |
| `mods/job-quest/ui.js` | Shared pieces: button, chip, heading, input, area, card, scroller |
| `mods/job-quest/model.js` | Shapes and rules, no Herdr imports |
| `mods/job-quest/store.js` | Every read and write of the data folder |
| `mods/job-quest/prompts.js` | Each agent task (the buttons' and the party members'), and the `AGENTS.md` written into the data folder |
| `mods/job-quest/party.js` | The party: the leader's round (follow jobs, move stages, start members), the lease, showing and cycling agents |
| `mods/job-quest/party-views.js` | The rail, the Party view, and the party's pieces on the bar, board and detail |
| `mods/job-quest/guides.js` | Resume, cover letter and email guides written on first run |
| `keys.json` | Ctrl+Shift+J switches to the layout |
| `tests/` | `model.test.mjs`, `panel.test.mjs`, and `stubs/` standing in for Herdr's modules |

## How the copies stay in step

Each block is its own copy of the mod, with its own snapshot. Three shared keys tie them:

- `job-quest.selected`: the chosen application's id. The board sets it; the detail reads it.
- `job-quest.revision`: bumped after every save. `render` calls `follow(cx)`, which reloads when the revision moved or the selection changed. This backs up `watchFolder`.
- `job-quest.dir`, `job-quest.agent`: the data folder and the chosen agent.

Rules that keep this sound:

- `follow` may start work with `cx.spawn` but never changes what this `render` draws.
- Text field states are made in `syncFields()`, after a load or a selection, never while drawing. A field whose text still equals the value last read follows the file; one the person changed is left alone. `saveFields()` saves all of them.
- Every write goes through `mutate(cx, work)`: one at a time, then reload, then bump the revision. `store.js` reads before writing because `writeTextFile` needs the current text.
- A document edit (`saveEdit`) passes the text it opened as `expected`. A rejection means an agent wrote meanwhile: the error says so and the person's text stays in the editor.
- `ask()` records `agents()` and starts the agent; `followAgent`, on a one-second timer, focuses the new agent and shows `jq-agent` once it appears.

## The party

- **Files decide.** `nextStep(app)` in `model.js` reads an application's stage and which files exist (and `review.md`'s `Verdict:`/`Round:` lines) and names the next member, a stage to move to, or why it is stuck. `jobDone(job, app)` says whether a job's output is on disk. Both are pure and tested.
- **One leader.** The `rail` copy (or the standalone `panel`) runs `party.round` every 3 s while it holds `job-quest.leader`, a lease renewed every 5 s and taken over after 15 s. Only the leader starts jobs, moves stages, closes finished tabs and appends `log.jsonl`.
- **Jobs live in shared state** (`job-quest.party`), merged by key on every write so the leader and a button in another copy never drop each other's jobs. A job's agent is found in `agents()` by its tab name, then by address. Its state: starting → working ↔ waiting (blocked, or idle without its file) → done | failed.
- **No loops.** A job key (member, kind, application, review round) is tried once; a failed step waits for **Start the … now** (`runNext`). At most `MAX_PARTY` live jobs; one job per application.
- **One space.** Every job, automatic or from a button, starts in the "Job Quest" space (`space.new` the first time, then back to the person's space), Claude Code with `--permission-mode auto`. Each round the leader renames an old "Job Quest party" space, makes one `tab.move` toward needs-you → working → starting → finished (`nextMove`), closes finished tabs after 90 s and stale ones (a party job waiting 20 min, or stopped unfinished) after 20 min, never the shown one.
- **Gates.** `nextStep` stops an application after research with no `posting.md` or no valid `contactEmail`; the Herald's job is done only when `email.md` has a To: address and every `Attachments:` file exists (`emailReady`). `mail.js` turns `email.md` into a Mail.app compose (osascript, values as arguments).
- `job-quest.autopilot` (false: off), `job-quest.shown` (the address last put in the agent block).

**Add a member or step.** A `MEMBERS` entry and a `DOING` word in `model.js`; the step in `nextStep` and its check in `jobDone`; its prompt in `prompts.js` and its case in `forJob`, naming the file that means done; a test in `tests/party.test.mjs`.

## The party chat

- Workers write one JSON file a message into `chat/` (named `<YYYYMMDD-HHMMSS>-<member>.json`, `{ at, from, appId, text }`); every briefing says how (`chatHowTo` in `prompts.js`). The person's messages are saved the same way (`saveMessage`, `from: "you"`) and typed into the chosen workers' terminals with `hc send` as `[Chat] …` (`party.deliver`).
- `feed()` weaves `log.jsonl` into the chat as events. Recipients come only from @mentions (`mentionsIn`, `handlesFor`, `chatTarget` in `main.js`): none or `@everyone` is every running worker; an unknown name sends nothing; a role/application with no running worker but an earlier message starts a reply worker. Typing `@` shows `mentionChoices()` over the field. The leader toasts each new worker message once (`v.chatSeen`).

## Data folder

```
AGENTS.md  CLAUDE.md         written by the mod: what an agent started here is told
intake.json                  { roles, seniority, workMode, locations, salaryMin,
                               stack, companyStage, dealBreakers, notes }  all strings
repos.json                   [{ fullName, url, isPrivate, isIncluded, summary }]
profile/                     the person's documents; notes.md (word dump); master.md
guides/                      resume-guide.md, cover-letter-guide.md, email-guide.md
targets.json                 [{ company, careers, ats, slug }]  the Scout's watchlist
reports/scout-<date>.md      a Scout's search; its existence ends the Scout's job
log.jsonl                    { at, member, appId, text } a line; the leader appends
.claude/settings.json        Claude Code permissions for agents here, written once
applications/<id>/
  application.json           { id, company, role, url, stage, contactName, contactEmail,
                               appliedAt, followUpAt, notes, fit, source, createdAt, updatedAt }
  posting.md  research.md  resume.md  cover-letter.md  review.md  email.md  followup.md  prep.md
```

Dates are `YYYY-MM-DD`. `stage` is one of lead, drafting, ready, applied, interview, offer, rejected, closed. Whether a document exists is read from the folder listing, never stored. The schema is written in `model.js` (coercions, `APPLICATION_KEYS`, `INTAKE_FIELDS`, `DOCS`) and in `agentsFile` in `prompts.js`; keep them agreeing. `AGENTS.md` is rewritten on every start; guides only when missing.

## Recipes

**Add an intake field.** `INTAKE_FIELDS` in `model.js`, and `INTAKE_KEYS` in `prompts.js`.

**Add an application field.** `APPLICATION_KEYS` and `toApplication` in `model.js`, `agentsFile` in `prompts.js`. If it is edited in the detail: `APP_FIELDS` in `main.js` and a `field(label, key)` line in `detailBody` in `views.js`.

**Add a stage.** `STAGES` and `STAGE_LABEL` in `model.js` (and `columns` if it should hide when empty), and the stage list in `agentsFile`.

**Add a document.** A row in `DOCS` in `model.js`, its `has...` flag in `loadApplication` in `store.js`, and what to show when it is missing in `documentBox` in `views.js`.

**Add an agent-driven action.** Export the task from `prompts.js`, naming every file by absolute path. Add a one-line action on the view that calls `this.ask(tabName, task)`, and a button in `views.js`.

**Add a view.** A body function in `views.js` and its entry in `BODIES`; the part name in `PARTS` in `main.js`; a block under `jq-view` in the layout with id `jq-<name>`; an entry in `LAYOUT_VIEWS` and `PANEL_TABS`. The layout test lists the parts it expects.

## Before committing

1. `npm test`, with a test added or extended for the flow changed.
2. Where Herdr is installed: copy `layouts/job-quest.*` and `mods/job-quest/` into `~/.config/herdr-app/`, run `herdr-app check ~/.config/herdr-app/mods/job-quest`, switch to the layout and look. The tests cannot stand in for this.
3. Keep `README.md` and `RECIPE.md` true to the files.
