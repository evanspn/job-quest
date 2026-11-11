# Job Quest

A job-search workspace for the [Herdr](https://herdr.dev) desktop app. It is a **layout**, a whole window with a pipeline board, an application view and your coding agent side by side, filled by one **mod** that also works alone as a panel in your own layout. It tracks applications, has an agent draft tailored resumes and cover letters, and prepares application emails. Everything it knows is plain files in a folder on your computer.

![Job Quest](preview.png)

## Install

Ask an agent inside Herdr:

> Read ~/.config/herdr-app/AGENTS.md, then add this layout: https://github.com/evanspn/job-quest

Or by hand:

1. Copy `mods/job-quest/` to `~/.config/herdr-app/mods/job-quest/`.
2. Copy `layouts/job-quest.json` and `layouts/job-quest.svg` to `~/.config/herdr-app/layouts/`.
3. Optionally merge `keys.json` into `~/.config/herdr-app/keys.json`: Ctrl+Shift+J switches to Job Quest; in it, Cmd+Alt+5 shows the Party and Cmd+Alt+. / Cmd+Alt+, swap the agent pane between the party's agents.
4. Run `herdr-app check ~/.config/herdr-app/mods/job-quest`.

Then switch layouts with Ctrl+Shift+L, or `herdr-app do layout.switch --name job-quest`. **Back to Herdr** in the bar returns to your main layout.

**Before you install:** the mod runs programs (`gh` to list your repositories, your system's opener for folders and the mail app), starts coding agents in new tabs, **including by itself while autopilot is on**, and reads and writes files in its data folder. It makes no network requests of its own; the agents it starts browse the web. On first run it writes `.claude/settings.json` into the data folder, putting Claude Code agents there in auto mode and letting them edit files, search and fetch the web and run `curl`, `gh` and `pandoc` without asking, and denying Gmail sends. Read it, and edit it to taste.

## The window

| Region | What it does |
| --- | --- |
| Bar | Switches between Pipeline, Profile, Intake and Terminals; shows or hides the agent pane. |
| Pipeline: board | Applications as cards in columns by stage. Type `Company, Role` and press Enter to add one. Follow-ups that are due are flagged. |
| Pipeline: application | The selected application: stage, posting link, contact, notes; Draft and Submit buttons; and its documents (posting, resume, cover letter, email), previewed and editable in place. |
| Profile | Your source material. Drop old resumes, cover letters or notes into the `profile` folder, paste a word dump, and choose which GitHub projects may be described. **Build master profile** turns it all into one document that drafts are tailored from. |
| Intake | What you are looking for: roles, level, work mode, locations, salary floor, stack, company stage, deal-breakers. Fill the form, or press **Interview me**. Also the data folder and which agent to use. |
| Terminals | A tab per terminal Job Quest started, named for who and what for (`🔮 sage/hooli-ai-engineer`, `🏹 scout/2026-11-11`), with the chosen one full size below. The agent pane closes while you are here, so no terminal is drawn twice. A terminal still asking a first-run question opens over the window when you click it. |
| Chat | A dock on the right (Chat in the bar, Cmd+Alt+6): one feed of what the workers post (questions, blockers, what they finished), your messages, and the party's events. A message with no `@` goes to **⚔ the Guildmaster**, your point of contact: it works out who should handle it and passes it on (mentioning workers in the chat), answers you, or steers the party through the files (a stage, a contact email, your intake). It starts with your first such message and then listens; it does no worker's job itself and takes no working slot. Type `@` to name someone instead: a list of `@guildmaster`, `@everyone` and the running workers by handle (`@sage/northwind`, `@scribe/globex`), filtered as you type. `@sage` reaches every running Sage; several mentions reach several; `@everyone` reaches every running worker, only when you say so. A line under the field says who it goes to. Press Enter: your message is saved and typed into those workers' terminals; a message for a terminal you are typing in waits until you leave it, so nothing lands on top of what you are writing. Reply on a worker's message puts its handle in your message, and Watch shows its terminal. Mentioning a worker that has finished (`@sage/northwind` after it closed) starts a new one in its role, briefed with its message and yours, to act on it (set the contact email, fix a document) and post what it changed. A new message from a worker is also a toast. |
| Party | The party at work: what waits for your approval, each member and their job, the adventure log, autopilot on or off, and **Send the Scout**. |
| Agent pane | Opens on the right when a button or a party member starts an agent, showing it live so you can steer it. |
| Rail | A strip on the far right with one tile per agent the party has running: a spinner while it works, a red pulse when it needs you. Click a tile to show that agent in the agent pane; click it again to hide the pane. |

### The party

A team of coding agents that works your search by itself. Each member is your coding agent started with one job; they hand over through files, and the window decides who goes next from which files exist.

| Member | Job | Writes |
| --- | --- | --- |
| 🏹 Scout | Once a day (or on **Send the Scout**): searches your watchlist's public job boards (Greenhouse, Lever, Ashby), Hacker News "Who is hiring", Work at a Startup and the web, scores each opening 0–100 against your intake, and adds up to 8 leads | `applications/<id>/` as leads with `fit` and `posting.md`, `targets.json`, `reports/scout-<date>.md` |
| ⚔ Guildmaster | Your point of contact in the chat: takes what you write without an @ and passes it to the right worker, answers you, or changes the files that steer the party | chat messages, `application.json`, `intake.json`, `targets.json` |
| 🔮 Sage | Pulls in the whole posting (finding it on the company's careers page and job board when there is no link, reading the ATS's API for the full text), how to apply, and a contact address that a page actually publishes; then researches the company: product, funding, team, stack, news, red flags, why you fit | `posting.md`, `url`, `contactEmail`, `research.md` |
| 🪶 Scribe | Drafts the resume and cover letter from your master profile and the research; revises after a review | `resume.md`, `cover-letter.md` |
| 🔍 Inquisitor | Checks every claim against your profile, the posting's requirements, ATS format and the writing; passes or sends it back (two rounds at most) | `review.md` (`Verdict: pass` or `revise`) |
| 📯 Herald | Exports the PDFs and writes the email with `To:`, `From:`, `Subject:` and `Attachments:` headers; later, drafts follow-ups when they come due | `email.md`, PDFs, `followup.md` |
| 🥊 Coach | When an application reaches Interviewing: likely questions with answers from your real stories, topics to brush up, questions to ask | `prep.md` |
| 📜 Archivist | The Profile and Intake buttons: interview, master profile, project summaries | `intake.json`, `profile/master.md`, `repos.json` |

How work flows:

- **Leads.** A Scout's lead scoring at least the threshold in Intake ("The party takes on leads that score at least", 70 when blank, `off` to never) moves to **Party at work** by itself. Leads you add yourself wait until you press **Send the party** or move them there.
- **Party at work.** Sage → Scribe → Inquisitor (→ Scribe → Inquisitor) → Herald. **No contact email, no drafts:** if research finds no published address, the Sage searches once more (`contact-search.md`); if there is still none, the application is **closed** with the reason in its notes, and you are told once. A posting the Sage could not find closes it too. To reopen, add what was missing and move it back to Party at work. The Herald is done only when `email.md` has a To: address and every attachment it names is in the folder. Then the application moves to **Ready to submit**, you get a notification, and it waits for you.
- **You approve.** Read the Review tab (the Inquisitor's notes and the Herald's checklist), press **Open email, attachments in** (on a Mac it opens a new message in Mail, addressed, with the subject, body and PDFs attached; macOS asks once to let Herdr control Mail), send it yourself, and press **Mark as applied**. Nothing is ever sent or submitted for you.
- **Later.** Due follow-ups get a draft from the Herald; Interviewing gets the Coach.

Every agent Job Quest starts, the party's and the buttons', opens in one Herdr space named "Job Quest", with Claude Code in auto mode (its classifier approves routine actions; the folder's deny rules on sending mail still hold). At most three party members work at once. Nothing moves under you: starting an agent never takes you anywhere (if a new tab takes the view in the space you are in, your tab is put back), tabs are not reordered while you are in the Job Quest space, and the tab you are on or the terminal you are typing in is never closed. Otherwise the space keeps itself tidy (while the Job Quest layout or panel is open: that is where the party runs). Job Quest agents it is not tracking, in any space (older tabs, say), are closed once quiet for 10 minutes, if the tab holds nothing else. tabs are ordered needs-you, working, starting, finished; a finished tab closes 90 seconds after it is done; a party member waiting 20 minutes, or stopped without finishing, is closed as stale; never the one on screen. A step that stops without its file is not retried by itself: the application shows **Start the … now**. Autopilot off stops new jobs from starting; running ones carry on.

Buttons that need judgement (draft, write email, export PDFs, interview, build profile, summarize projects) start your coding agent in a new tab, in the data folder, with the task as its first message. The window re-reads the folder whenever a file changes.

### Keys and scripts

Besides `refresh`, `open-<id>`, `tab-<pipeline|party|profile|intake|terminals>`, `party-next` and `party-prev` (swap the agent pane between the party's agents), `autopilot`, `scout` and `doc-<posting|resume|letter|email>`, the selected application takes `draft-both`, `draft-resume`, `draft-letter` and `write-email`. Bind them in `keys.json` (for example `"layout:job-quest": { "ctrl-shift-d": "job-quest.draft-both" }`) or run `herdr-app do job-quest.draft-both`.

The first time an agent starts in the data folder it may ask a question first (Claude Code asks whether to trust the folder). Job Quest shows the Terminals view so you can answer, then opens the agent pane.

### Keep the party running outside Job Quest

The party runs in the copy of the mod that holds its lease: the rail in the Job Quest layout, the standalone panel, or the **beacon**, a one-line strip for your everyday layout ("⚔ 2 questing · 1 need you · 1 to approve", AUTO / PAUSED; click it to open Job Quest). With the beacon in the layout you use, the party keeps working, closing and tidying while Job Quest is not on screen, and Job Quest's Back button returns to that layout. Herdr's own layouts are read-only, so clone one first:

```sh
herdr-app do layout.clone '{"name":"main","as":"herdr-jq"}'
```

then, in `~/.config/herdr-app/layouts/herdr-jq.json`, put the beacon beside the status block: replace `{ "id": "status", ... }` with a row of it and `{ "id": "jq-beacon", "type": "block", "content": { "mod": "job-quest", "props": { "part": "beacon" } }, "size": { "px": 300 } }`.

### As a panel in your own layout

The same mod with no `part` is a tabbed panel. Open it as a window with `herdr-app do mod.open --name job-quest`, or add a block to your layout: `{ "type": "block", "content": { "mod": "job-quest" }, "size": { "px": 440 } }`.

## Where your data lives

In `~/job-quest-data` by default. Change it in Intake. Keep it inside your home folder. Nothing is stored in this repository.

```
job-quest-data/
  AGENTS.md  CLAUDE.md       what agents started here are told (written by the mod)
  .claude/settings.json      Claude Code permissions for agents here (written once)
  targets.json               the Scout's watchlist
  reports/                   the Scout's report of each search
  log.jsonl                  the party's adventure log
  chat/                      the party chat, one JSON file a message: { at, from, to, appId, text }
  intake.json                what you are looking for
  repos.json                 GitHub projects and whether each is included
  profile/                   your documents, notes.md, master.md
  guides/                    resume, cover letter and email guides
  applications/<id>/
    application.json         company, role, stage, contact, dates, notes
    posting.md  research.md  resume.md  cover-letter.md  review.md
    email.md  followup.md  prep.md
```

The three guides are written on first run and are yours to edit. Drafts follow whatever they say. The resume guide covers modern software engineering resumes: one page, a single column that applicant tracking systems can read, impact-first bullets with real numbers, and tailoring to the posting.

## What it needs

- **A coding agent** Herdr knows how to start (Claude Code, Codex, ...).
- **The GitHub CLI** (`gh`, signed in) to import your repositories. Without it, add repositories by address.

The mod never sends email and never submits an application. Drafting tasks tell the agent to use only what your files say and to report gaps to you.

## Developing

```
npm test
```

runs the data rules and the mod's logic against stand-ins for Herdr's modules. It does not prove the UI draws: for that, install as above, run `herdr-app check`, and look at it in the app. `.claude/skills/` holds notes for agents working on this repo, including the patterns taken from three gallery entries (Kanban, Spec Board, Over9k). `RECIPE.md` is the brief to rebuild it from scratch.
