# Job Quest

A mod for Claude Code and the Claude desktop app: a tabbed job-search workspace that sits beside the chat. It tracks applications, drafts tailored resumes and cover letters, and prepares application emails. Everything it knows is kept as plain files in a folder on your computer.

## Install

At the prompt of a terminal session:

```
/plugin install job-quest --marketplace evanspn/job-quest
```

From a shell:

```
claude plugin install job-quest --marketplace evanspn/job-quest
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `evanspn/job-quest`, then Add plugin.

Open the panel with `/job-quest`.

## The tabs

| Tab | What it does |
| --- | --- |
| Intake | What you are looking for: roles, level, work mode, locations, salary floor, stack, company stage, deal-breakers. Fill the form, or press **Interview me in chat**. |
| Profile | Your source material. Drop old resumes, cover letters or notes into the `profile` folder, paste a word dump, and choose which GitHub projects may be described. **Build master profile** turns it all into one document that drafts are tailored from. |
| Pipeline | Every application grouped by stage, with a posting link, notes and a follow-up date. |
| Drafts | Paste a posting (or its link) and have Claude draft a tailored resume, cover letter or both. Preview each in the panel. |
| Submit | For companies that take applications by email: Claude writes the email and creates a Gmail draft for you to review and send. Also exports PDFs and marks the application as applied. |

The buttons that say Claude does something hand a prompt to the chat. You see the work happen there and can steer it. The panel re-reads the folder when the turn ends.

## Where your data lives

In `~/job-quest-data` by default. Change it with the **Data folder** option in `/config`. Nothing is stored in this repository.

```
job-quest-data/
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

- **GitHub**, to list and read your repositories. Without it, add repositories by address in the Profile tab.
- **Gmail**, to create email drafts. Without it, the email is saved as `email.md` for you to copy.

The mod never sends email and never invents experience: drafting prompts tell Claude to use only what your files say and to report gaps to you.

## Developing

```
claude plugin validate .
claude plugin test .
```

Run from a checkout with `claude --plugin-dir .`.
