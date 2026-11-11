// The first message each button gives the agent it starts. Every prompt names the files to
// read and write by absolute path, so the agent needs nothing else. No Herdr imports.

const NO_INVENTING =
  "Never invent an employer, title, date, technology, number or contact. Use only what these files and I have said. Where something a document needs is missing, leave it out of the document and ask me about it in your reply.";

const INTAKE_KEYS =
  "`roles`, `seniority`, `workMode`, `locations`, `salaryMin`, `stack`, `companyStage`, `dealBreakers`, `notes`";

const appDir = (dir, id) => `${dir}/applications/${id}`;

const EMAIL_FORMAT = (folder) =>
  `Write \`${folder}/email.md\` as a header block, a blank line, then the plain-text body:

\`\`\`
To: Name <address>
From: Name <address>
Subject: ...
Attachments: Firstname-Lastname-Resume.pdf, Firstname-Lastname-Cover-Letter.pdf
\`\`\`

\`To\` is the contact address in \`${folder}/application.json\`. \`From\` is the address my intake notes say to apply from (else leave it out). \`Attachments\` lists the files to attach, by name, each one in \`${folder}\`; the panel opens the email in my mail app with them attached.`;



const title = (row) => (row.role ? `${row.role} at ${row.company}` : row.company);

// Written to <data folder>/AGENTS.md: agents start in that folder and read it.
export const agentsFile = (dir) => `# Job Quest data folder

This folder holds one person's job search. The Job Quest panel in the Herdr app reads and writes it, and re-reads it whenever a file changes. You are usually started here by one of the panel's buttons, with the task as your first message.

- \`intake.json\`: what they are looking for. String fields: ${INTAKE_KEYS}.
- \`profile/\`: their source documents (old resumes, cover letters, notes). \`profile/notes.md\` holds pasted notes and \`profile/master.md\` the master profile that drafts are tailored from.
- \`repos.json\`: GitHub repositories offered as context, an array of \`{ fullName, url, isPrivate, isIncluded, summary }\`. Only entries with \`isIncluded: true\` may be described in a document.
- \`guides/\`: \`resume-guide.md\`, \`cover-letter-guide.md\` and \`email-guide.md\`. Follow them when writing those documents.
- \`applications/<id>/\`: one folder per application, holding \`application.json\` (\`id\`, \`company\`, \`role\`, \`url\`, \`stage\`, \`contactName\`, \`contactEmail\`, \`appliedAt\`, \`followUpAt\`, \`notes\`, \`fit\`, \`source\`, \`createdAt\`, \`updatedAt\`, all strings; dates as YYYY-MM-DD; \`fit\` a score from 0 to 100; \`stage\` one of lead, drafting, ready, applied, interview, offer, rejected, closed), plus, when they exist, \`posting.md\`, \`research.md\`, \`resume.md\`, \`cover-letter.md\`, \`review.md\`, \`email.md\`, \`followup.md\` and \`prep.md\`.
- \`targets.json\`: companies the Scout watches, an array of \`{ company, careers, ats, slug }\`.
- \`reports/\`: the Scout's report of each search. \`log.jsonl\`: the party's log, written by the panel.
- \`chat/\`: the party chat, one JSON file a message: \`{ at, from, to, appId, text }\`. The person reads it in the panel; to reach them, write a new file there named \`<YYYYMMDD-HHMMSS>-<your role>.json\`. Their replies are typed into your terminal, starting with \`[Chat]\`.

## The party

The panel runs a party of agents, each started with one job, handing work over through these files. An application in \`drafting\` is the party's: the Sage writes \`research.md\`, the Scribe the resume and cover letter, the Inquisitor \`review.md\` (first lines \`Verdict: pass\` or \`Verdict: revise\`, then \`Round: n\`), the Herald \`email.md\` and the PDFs. Then the panel moves it to \`ready\` and the person approves and sends it. Nothing is drafted for an application without a \`contactEmail\`: the party stops there until the person adds one. \`email.md\` starts with \`To:\`, \`From:\`, \`Subject:\` and \`Attachments:\` lines (file names in the application's folder), then a blank line and the body. The panel decides who goes next from which files exist, so write the file your task names, and write it last when the task says so.

Rules:

- Keep each JSON file's fields exactly as listed, and change only the fields the task names.
- Never invent experience, employers, dates, numbers or contacts. Report what is missing instead.
- Never send an email or submit an application. Prepare drafts only; the person sends.
- When the person gives you a document about themselves, save a copy under \`profile/\`.
- Do the job you were given without stopping to ask, unless you cannot do it at all. Put questions and gaps in the file you write, where the person reads them.
- This file is rewritten by the panel. Put your own notes elsewhere.

The folder is at \`${dir}\`.
`;

export const interview = (dir) =>
  `Interview me about the job I am looking for, then save my answers.

Ask one or two questions at a time and wait for my reply. Cover: the roles and titles I want, my level, remote, hybrid or on-site and where, my salary floor, the stack I want to work in, the company size or stage I prefer, my deal-breakers, and anything else that should steer which jobs I apply to and how my documents are written.

Start from what \`${dir}/intake.json\` already holds, if it exists, and only ask about what is empty or unclear. When we are done, write \`${dir}/intake.json\` as one JSON object with exactly these string fields: ${INTAKE_KEYS}. Keep each value short, in my own words.`;

export const summarizeRepos = (dir) =>
  `Summarize my included GitHub repositories so resumes and cover letters can draw on them.

Read \`${dir}/repos.json\`. For each entry with \`"isIncluded": true\` and an empty \`summary\`, read the repository (clone it to a temporary folder, or use \`gh\`): its README, its manifest or build files, its layout, and the commit history for what I wrote myself. Then set its \`summary\` to 3 to 5 sentences: what it does and for whom, the stack, what I built and what was technically hard, and any real result (users, stars, performance, deployment). Write the file back with every other field and entry unchanged.

${NO_INVENTING} If you cannot read a repository, leave its summary empty and tell me which.`;

export const buildMaster = (dir) =>
  `Build my master profile, the single source every resume and cover letter is tailored from.

Read every file in \`${dir}/profile/\` (old resumes, cover letters, notes, in PDF, Word, Markdown or text), the summaries of the included entries in \`${dir}/repos.json\`, and \`${dir}/intake.json\`. Write \`${dir}/profile/master.md\` with: my contact details and links; a skills inventory grouped by kind; every role with its dates and every accomplishment I have recorded for it, kept in full, not trimmed to a page; every project with its stack, link and results; education and anything else (talks, open source, awards).

If \`master.md\` already exists, update it: keep what I edited by hand and add what is new.

${NO_INVENTING} End your reply, not the file, with a short list of questions whose answers would most strengthen it, such as missing numbers or dates.`;

const WANTED = {
  resume: "a tailored resume",
  "cover-letter": "a tailored cover letter",
  both: "a tailored resume and cover letter",
};

// kind: "resume" | "cover-letter" | "both".
export function draft(dir, row, kind) {
  const folder = appDir(dir, row.id);
  const posting = row.hasPosting
    ? `Read the posting in \`${folder}/posting.md\`.`
    : row.url
      ? `Fetch the posting from ${row.url} and save its text as \`${folder}/posting.md\` first. If you cannot fetch it, ask me to paste it.`
      : `There is no posting saved for this application. Ask me to paste it, save it as \`${folder}/posting.md\`, then go on.`;
  const resume = kind === "cover-letter" ? "" : `\n- \`${folder}/resume.md\`, following \`${dir}/guides/resume-guide.md\`.`;
  const letter = kind === "resume" ? "" : `\n- \`${folder}/cover-letter.md\`, following \`${dir}/guides/cover-letter-guide.md\`.`;

  return `Draft ${WANTED[kind]} for my application: ${title(row)}.

${posting}

Then read \`${dir}/profile/master.md\` (if it does not exist, read the files in \`${dir}/profile/\` instead), \`${dir}/intake.json\`, the included entries of \`${dir}/repos.json\`, \`${folder}/application.json\` for my notes and the contact, and \`${folder}/research.md\` if it exists, for what the company does and the angles worth using.

Write:${resume}${letter}

Tailor to the posting's main requirements: lead with my most relevant work, use the posting's own terms for skills I really have, and cut what does not serve this job. ${NO_INVENTING}

Do not change \`application.json\`: the panel moves the application on once the documents exist. In your reply, give me the posting's requirements I do not meet and any questions, briefly. Do not paste the documents into the chat.`;
}

export function emailDraft(dir, row) {
  const folder = appDir(dir, row.id);
  const to = row.contactEmail
    ? `It goes to ${row.contactEmail}${row.contactName ? ` (${row.contactName})` : ""}.`
    : `No contact address is saved. Look for one published in the posting, \`${folder}/research.md\` or the company's careers and team pages, never building one from a pattern. If you find one, set \`contactEmail\` in \`${folder}/application.json\` and go on. If not, stop: write nothing and tell me where you looked.`;

  return `Write the email for my application: ${title(row)}. Write a draft only. Do not send anything.

Read \`${folder}/posting.md\`, \`${folder}/resume.md\` and \`${folder}/cover-letter.md\` (whichever exist), \`${folder}/application.json\`, \`${dir}/intake.json\` and \`${dir}/guides/email-guide.md\`. ${to}

${EMAIL_FORMAT(folder)} Name the resume and cover letter PDFs in the folder; if they do not exist yet, name the files Export PDFs will make (\`Firstname-Lastname-Resume.pdf\`, \`Firstname-Lastname-Cover-Letter.pdf\`) and tell me to export them. Follow the guide and any instructions the posting gives for applying.

${NO_INVENTING}`;
}

export function exportFiles(dir, row) {
  const folder = appDir(dir, row.id);

  return `Export the documents for my application (${title(row)}) as files I can upload or attach.

Convert \`${folder}/resume.md\` and, if it exists, \`${folder}/cover-letter.md\` to PDF in the same folder, named \`Firstname-Lastname-Resume.pdf\` and \`Firstname-Lastname-Cover-Letter.pdf\` with my real name from the resume. Follow the Format section of \`${dir}/guides/resume-guide.md\`: one column, a common font, selectable text an applicant tracking system can read. Use a converter already on this machine (pandoc, a headless browser, LibreOffice); ask before installing one.

Change no wording. Check the result by opening it: the resume must fit the page count the guide sets, with nothing cut off. If it runs over, tell me what you would trim and wait for my answer. Tell me the files' full paths when done.`;
}

// ---- the party's jobs. Each is the first message of an agent the panel starts by itself, so
// each says who the agent is, names every file, and says which file means the job is done.

// How an agent talks to the person: a message file in chat/, which the panel shows in the party
// chat. The person's replies are typed into the agent's terminal.
export const chatHowTo = (dir, member, appId = "") =>
  `**The party chat.** I read the party chat, not your terminal. To ask me something, tell me about a blocker, or report what you finished, write a new file \`${dir}/chat/<YYYYMMDD-HHMMSS>-${member}.json\` (the time from \`date +%Y%m%d-%H%M%S\`) holding one JSON object: \`{ "at": "<ISO 8601 time>", "from": "${member}", "appId": "${appId}", "text": "<your message, a few lines at most>" }\`. Never edit another file there. Post a question, then carry on with whatever does not depend on the answer. My replies arrive in your terminal as a message starting with \`[Chat]\`. When your job is done, post one short message saying what you did and anything I should know.`;

const intro = (dir, name, what, appId = "") =>
  `You are the ${name} in my job-search party, a team of agents that each do one job and hand over through files in \`${dir}\`. ${what} Work on your own: do not stop to ask me unless you cannot do the job at all. I approve and send everything myself, so never send, submit or sign up for anything.

${chatHowTo(dir, name.toLowerCase(), appId)}`;

export function scout(dir, report, today) {
  return `${intro(dir, "Scout", "Your job: find new openings that fit me and add each as a lead.")}

1. Read \`${dir}/intake.json\` (what I want; \`dealBreakers\` rule a job out), \`${dir}/profile/master.md\` (what I can do), and every \`${dir}/applications/*/application.json\`, so you never add a job I already have: match on the company and role, or the posting link.
2. Read \`${dir}/targets.json\`, my watchlist: an array of \`{ company, careers, ats, slug }\`. If it does not exist, start it from the companies in \`applications/\` that are not closed, finding each one's careers page and applicant tracking system.
3. Search, using only public pages and APIs, never LinkedIn or a site that forbids automated access, and never signing in:
   - each target's job board: Greenhouse \`https://boards-api.greenhouse.io/v1/boards/<slug>/jobs?content=true\`, Lever \`https://api.lever.co/v0/postings/<slug>?mode=json\`, Ashby \`https://api.ashbyhq.com/posting-api/job-board/<slug>\`, or its careers page;
   - this month's Hacker News "Ask HN: Who is hiring?" thread (\`https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring\` lists them; read the comments of the newest);
   - Y Combinator's Work at a Startup, and web searches for the roles and stack in my intake.
4. Score each opening from 0 to 100 for fit against my intake and master profile: role and level, stack, work mode and location, company stage, salary when posted. A deal-breaker scores 0. Score honestly: openings at or above my threshold (\`autoFit\` in intake.json, 70 when blank) are taken on by the party at once, so a generous score costs me time.
5. Add at most 8 new openings, the best first, skipping anything under 50, closed or already listed. For each, create \`${dir}/applications/<id>/\`, where \`<id>\` is the company and role in lowercase words joined by hyphens, with:
   - \`application.json\`: exactly the fields \`id\`, \`company\`, \`role\`, \`url\`, \`stage\` ("lead"), \`contactName\`, \`contactEmail\` (only an address the posting or its page publishes, else ""), \`appliedAt\` (""), \`followUpAt\` (""), \`notes\` (one line: size, stage, what they build, location, salary if posted), \`fit\` (the score, as a string), \`source\` (where you found it), \`createdAt\` and \`updatedAt\` ("${today}"), all strings;
   - \`posting.md\`: the posting's full text, its link on the first line.
6. Add companies worth watching to \`${dir}/targets.json\`.
7. Last, write \`${dir}/reports/${report}\`: where you searched, each lead you added with its score and one line on why, and what you skipped and why. This file tells the party you are done, so write it after everything else, even when you found nothing.`;
}

export function research(dir, row) {
  const folder = appDir(dir, row.id);
  const posting = `\`${folder}/posting.md\``;
  return `${intro(dir, "Sage", `Your job: pull in everything about ${title(row)}: the whole posting, how to apply and who to send it to, and research the company so the Scribe can tailor my documents and I can judge the job.`, row.id)}

1. **The posting, all of it.** ${row.url ? `Open ${row.url}${row.hasPosting ? ` (a copy is in ${posting}; check it is complete)` : ""} and follow it to the real job page.` : `There is no link yet: find the posting yourself. Search ${row.company}'s careers page and its job board (Greenhouse, Lever, Ashby, Workable and the like) for ${row.role ? `the ${row.role} role` : "the role"}${row.notes ? ` (my notes: "${row.notes}")` : ""}, picking the open posting that best matches; read \`${folder}/\` for any notes I left. Set \`url\` in \`${folder}/application.json\` to the posting's link, and \`role\` to its exact title if mine was vague.`} For Greenhouse, Lever and Ashby pages read the board's public API, which has the full text (Greenhouse \`https://boards-api.greenhouse.io/v1/boards/<board>/jobs/<id>\`, Lever \`https://api.lever.co/v0/postings/<company>/<id>\`, Ashby \`https://api.ashbyhq.com/posting-api/job-board/<board>\`). Save the posting's complete text to ${posting}, word for word, with its link on the first line: every section, requirement, benefit, the salary, location and work mode, and the application instructions. If you cannot find or open it at all, write research.md anyway, starting with "No posting found" and where you looked, and stop: the party waits for me to paste it.
2. **How to apply and who to.** Find out how this job is applied for (an email address, a form, a referral) and what it asks for (resume, cover letter, portfolio, questions, a deadline). Find the address to send the application to, looking in this order: the posting and its apply page; the company's careers or jobs page; its team, about and contact pages; the founders' or the hiring manager's own public pages, GitHub or posts; the Hacker News or Work at a Startup post it came from. Use only an address published on a page you read. Never build one from a pattern like first@company.com. Set \`contactEmail\` (and \`contactName\` if known) in \`${folder}/application.json\`, changing nothing else there but \`url\`, \`role\` (step 1) and \`fit\` (step 4). If no address is published, leave \`contactEmail\` empty: the party stops there and I will find one.
3. **The company.** Research with web searches and its own site, blog, GitHub and recent news: what it builds and for whom; stage, funding, investors and size; the team and who likely hires for this role; its stack and how it works; news from the last year; red flags such as layoffs, unclear funding or poor reviews.
4. Read ${posting}, \`${dir}/profile/master.md\` and \`${dir}/intake.json\`, then set \`fit\` in application.json to your 0 to 100 score.
5. Write \`${folder}/research.md\` with these sections: Snapshot (five lines), How to apply (the method, what to send, the deadline, the contact address and the page it is published on, or "No contact address found" and where you looked), Product, Stage and funding, Team and hiring, Stack, Recent news, Why I fit (the posting's main requirements, each matched to real experience from master.md, or marked as a gap), Red flags, Angles for the cover letter (two or three specific to this company), Sources (links).

Every fact about the company needs a source; mark a guess as a guess. ${NO_INVENTING} Write research.md last: it tells the party you are done.`;
}

export function scribe(dir, row) {
  const folder = appDir(dir, row.id);
  const missing = [!row.hasResume && "resume", !row.hasCoverLetter && "cover-letter"].filter(Boolean);
  const kind = missing.length === 1 ? missing[0] : "both";
  return `${intro(dir, "Scribe", `Your job: draft my documents for ${title(row)}. The Sage's research is in \`${folder}/research.md\`; use its angles.`, row.id)}

${draft(dir, row, kind)}${missing.length === 1 ? `

The other document already exists; leave it as it is.` : ""}`;
}

export function revise(dir, row) {
  const folder = appDir(dir, row.id);
  return `${intro(dir, "Scribe", `Your job: revise my resume and cover letter for ${title(row)} after the Inquisitor's review.`, row.id)}

Read \`${folder}/review.md\`, then \`${folder}/resume.md\`, \`${folder}/cover-letter.md\`, \`${folder}/posting.md\`, \`${folder}/research.md\`, \`${dir}/profile/master.md\` and the guides in \`${dir}/guides/\`.

Fix every "Must fix" item and every "Should fix" item you can fix truthfully, in both documents. An item that would need something master.md does not support stays unfixed: remove the claim instead of stretching it. ${NO_INVENTING}

Last, change the first line of \`${folder}/review.md\` to \`Verdict: revised\` and add a section "Scribe's changes" at its end listing what you changed and what you could not fix and why. Keep the rest of review.md as it is. That line tells the party you are done.`;
}

export function review(dir, row) {
  const folder = appDir(dir, row.id);
  const round = (row.round ?? 0) + 1;
  return `${intro(dir, "Inquisitor", `Your job: review my resume and cover letter for ${title(row)} as a hiring manager and as an applicant tracking system would. You judge; you do not rewrite them.`, row.id)}

Read \`${folder}/resume.md\`, \`${folder}/cover-letter.md\`, \`${folder}/posting.md\`, \`${folder}/research.md\`, \`${dir}/profile/master.md\`, \`${dir}/intake.json\` (its notes may limit what I can say), the included entries of \`${dir}/repos.json\`, and the guides in \`${dir}/guides/\`.${row.hasReview ? ` The last review is \`${folder}/review.md\`: check that its items were dealt with.` : ""}

Check:
1. Truth: every employer, title, date, number, technology and claim in both documents is backed by master.md, the profile folder or an included repository. Quote each one that is not. Any invented or stretched claim is a must-fix.
2. Fit: each of the posting's main requirements, marked covered, missing though master.md has it, or one I lack.
3. Format and ATS: what the resume guide sets (length, one column, headings, no tables or graphics), and the posting's own terms used where I really have the skill.
4. Writing: impact-first bullets with real numbers, no filler, a cover letter specific to this company and as long as its guide says.

Write \`${folder}/review.md\`. Its first two lines are exactly:

Verdict: pass
Round: ${round}

using \`revise\` in place of \`pass\` when anything must be fixed. Then the sections: Must fix, Should fix, Requirements coverage, Notes for me (what to know before I approve). Pass only when Must fix is empty.${round >= 2 ? " This is the last round: after it, the documents come to me whatever the verdict, so make the notes count." : ""} Write the file in one go, last.`;
}

export function packageUp(dir, row) {
  const folder = appDir(dir, row.id);
  return `${intro(dir, "Herald", `Your job: package my application for ${title(row)}, addressed to ${row.contactEmail}${row.contactName ? ` (${row.contactName})` : ""}, so all I do is press Send.`, row.id)}

1. PDFs: convert \`${folder}/resume.md\` and \`${folder}/cover-letter.md\` to PDF in \`${folder}\`, named \`Firstname-Lastname-Resume.pdf\` and \`Firstname-Lastname-Cover-Letter.pdf\` with my real name from the resume. Follow the Format section of \`${dir}/guides/resume-guide.md\`: one column, a common font, selectable text an applicant tracking system can read. Use a converter already on this machine (pandoc, a headless browser, LibreOffice); do not install one. Change no wording. Open the result to check it: if the resume runs over the guide's page count or anything is cut off, change nothing and note it in step 3.
2. Email: read \`${folder}/posting.md\`, \`${folder}/research.md\` (its How to apply section), \`${folder}/resume.md\`, \`${folder}/cover-letter.md\`, \`${folder}/application.json\`, \`${dir}/intake.json\` and \`${dir}/guides/email-guide.md\`. Follow any instructions the posting gives (a subject line, a reference, what to include). ${EMAIL_FORMAT(folder)} Attach both PDFs, plus anything else the posting asks for that exists in the folder. Do not create a Gmail draft.
3. Add a section "Herald" at the end of \`${folder}/review.md\`: who it goes to, the attachments, anything over length, and anything I must check first.

${NO_INVENTING} Never send the email or submit the application. Make the PDFs before email.md, and write email.md last: it tells the party you are done.`;
}

export function followup(dir, row) {
  const folder = appDir(dir, row.id);
  return `${intro(dir, "Herald", `Your job: draft a follow-up for my application to ${title(row)}, sent ${row.appliedAt || "a while ago"}.`, row.id)}

Read \`${folder}/application.json\`, \`${folder}/email.md\` and \`${folder}/posting.md\` if they exist, \`${folder}/research.md\` if it exists, and \`${dir}/guides/email-guide.md\`.

Write \`${folder}/followup.md\`: its first line \`Subject: ...\`, a blank line, then a short, polite plain-text note to ${row.contactEmail || "the contact in application.json, or the posting's address"} that names the role and when I applied, adds one specific, true reason I fit, and asks about next steps. If no address is known, say so at the top of the file. ${NO_INVENTING} Draft only; do not send.`;
}

export function prep(dir, row) {
  const folder = appDir(dir, row.id);
  return `${intro(dir, "Coach", `Your job: prepare me for interviews at ${title(row)}.`, row.id)}

Read \`${folder}/posting.md\`, \`${folder}/research.md\`, \`${folder}/resume.md\`, \`${folder}/cover-letter.md\`, \`${folder}/application.json\` (my notes may say which round is next) and \`${dir}/profile/master.md\`. Search the web for how this company interviews, if anything is public.

Write \`${folder}/prep.md\`: a one-paragraph company recap; the likely interview steps; ten likely questions, each with an answer outline built from a real story in master.md in situation, task, action, result form (mark a question with no story as a gap to prepare); the technical topics to brush up given the posting and stack; five sharp questions for me to ask them; and what to say about salary given my intake. ${NO_INVENTING} Write prep.md last.`;
}

// A worker started to act on the person's reply to an earlier worker that has finished.
export function followUp(dir, member, row, theirs, mine) {
  const name = member.charAt(0).toUpperCase() + member.slice(1);
  const folder = row ? appDir(dir, row.id) : dir;
  return `${intro(dir, name, `Your job: act on my reply in the party chat. An earlier ${name}${row ? `, working on ${title(row)},` : ""} posted: "${theirs}" I replied: "${mine}"`, row?.id ?? "")}

Read what you need in \`${folder}\`${row ? ` (\`application.json\`, \`posting.md\`, \`research.md\` and the other documents there)` : ""} and \`${dir}/AGENTS.md\`. Then do what my reply asks, within your role: for example set \`contactEmail\` in \`${row ? `${folder}/application.json` : "the application's application.json"}\`, correct a document, or record a decision in the application's notes. Change only what my reply covers; the party picks up the next step from the files by itself. ${NO_INVENTING}

Last, post one chat message saying what you changed.`;
}

// The first message for a party job: { member, kind, appId, report }.
export function forJob(dir, job, row, today) {
  switch (job.kind) {
    case "scout": return scout(dir, job.report, today);
    case "research": return research(dir, row);
    case "draft": return scribe(dir, row);
    case "revise": return revise(dir, row);
    case "review": return review(dir, row);
    case "package": return packageUp(dir, row);
    case "followup": return followup(dir, row);
    case "prep": return prep(dir, row);
    default: throw new Error(`no task for ${job.kind}`);
  }
}
