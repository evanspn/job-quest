# Job Quest

A mod for the [Herdr](https://herdr.dev) desktop app: a job-search workspace in a side panel. It tracks applications, has a coding agent draft tailored resumes and cover letters, and prepares application emails. Everything it knows is plain files in a folder on your computer.

## Install

Ask an agent inside Herdr:

> Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/evanspn/job-quest

Or by hand:

1. Copy `mods/job-quest/` to `~/.config/herdr-app/mods/job-quest/`.
2. Optionally merge `keys.json` into `~/.config/herdr-app/keys.json` (Ctrl+Shift+J opens the panel as a window).
3. Run `herdr-app check ~/.config/herdr-app/mods/job-quest`.

The first time Herdr sees the folder it docks the panel on the right of the shown layout.

**Before you install:** the mod runs programs (`gh` to list your repositories, your system's opener for folders and the mail app), starts coding agents in new tabs, and reads and writes files in its data folder. It makes no network requests of its own.

## The tabs

| Tab | What it does |
| --- | --- |
| Intake | What you are looking for: roles, level, work mode, locations, salary floor, stack, company stage, deal-breakers. Fill the form, or press **Interview me**. Also where you pick the data folder and the agent. |
| Profile | Your source material. Drop old resumes, cover letters or notes into the `profile` folder, paste a word dump, and choose which GitHub projects may be described. **Build master profile** turns it all into one document that drafts are tailored from. |
| Pipeline | Every application grouped by stage, with a posting link, notes and a follow-up date. |
| Drafts | Paste a posting (or its link) and have an agent draft a tailored resume, cover letter or both. Preview each in the panel. |
| Submit | For companies that take applications by email: an agent writes the email, and **Open in mail app** opens it as a draft for you to attach files and send. Also exports PDFs and marks the application as applied. |

Buttons that need judgement start your coding agent in a new Herdr tab, in the data folder, with the task as its first message. You watch and steer it there. The panel re-reads the folder whenever a file changes.

## Where your data lives

In `~/job-quest-data` by default. Change it in the Intake tab. Keep it inside your home folder. Nothing is stored in this repository.

```
job-quest-data/
  AGENTS.md  CLAUDE.md       what agents started here are told (written by the panel)
  intake.json                what you are looking for
  repos.json                 GitHub projects and whether each is included
  profile/                   your documents, notes.md, master.md
  guides/                    resume, cover letter and email guides
  applications/<id>/
    application.json         company, role, stage, contact, dates, notes
    posting.md  resume.md  cover-letter.md  email.md
```

The three guides are written on first run and are yours to edit. Drafts follow whatever they say. The resume guide covers modern software engineering resumes: one page, a single column that applicant tracking systems can read, impact-first bullets with real numbers, and tailoring to the posting.

## What it needs

- **A coding agent** Herdr knows how to start (Claude Code, Codex, ...), for drafting, summarizing and the interview.
- **The GitHub CLI** (`gh`, signed in) to import your repositories. Without it, add repositories by address.

The mod never sends email and never submits an application. Drafting prompts tell the agent to use only what your files say and to report gaps to you.

## Developing

```
npm test
```

runs the data rules and the panel's logic against stand-ins for Herdr's modules. It does not prove the UI draws: for that, copy the mod into `~/.config/herdr-app/mods/` and run `herdr-app check` there, then look at it in the app. `.claude/skills/` holds notes for agents working on this repo, and `RECIPE.md` is the brief to rebuild the mod from scratch.
