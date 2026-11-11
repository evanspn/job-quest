// The first message each button gives the agent it starts. Every prompt names the files to
// read and write by absolute path, so the agent needs nothing else. No Herdr imports.

const NO_INVENTING =
  "Never invent an employer, title, date, technology, number or contact. Use only what these files and I have said. Where something a document needs is missing, leave it out of the document and ask me about it in your reply.";

const INTAKE_KEYS =
  "`roles`, `seniority`, `workMode`, `locations`, `salaryMin`, `stack`, `companyStage`, `dealBreakers`, `notes`";

const appDir = (dir, id) => `${dir}/applications/${id}`;

const title = (row) => (row.role ? `${row.role} at ${row.company}` : row.company);

// Written to <data folder>/AGENTS.md: agents start in that folder and read it.
export const agentsFile = (dir) => `# Job Quest data folder

This folder holds one person's job search. The Job Quest panel in the Herdr app reads and writes it, and re-reads it whenever a file changes. You are usually started here by one of the panel's buttons, with the task as your first message.

- \`intake.json\`: what they are looking for. String fields: ${INTAKE_KEYS}.
- \`profile/\`: their source documents (old resumes, cover letters, notes). \`profile/notes.md\` holds pasted notes and \`profile/master.md\` the master profile that drafts are tailored from.
- \`repos.json\`: GitHub repositories offered as context, an array of \`{ fullName, url, isPrivate, isIncluded, summary }\`. Only entries with \`isIncluded: true\` may be described in a document.
- \`guides/\`: \`resume-guide.md\`, \`cover-letter-guide.md\` and \`email-guide.md\`. Follow them when writing those documents.
- \`applications/<id>/\`: one folder per application, holding \`application.json\` (\`id\`, \`company\`, \`role\`, \`url\`, \`stage\`, \`contactName\`, \`contactEmail\`, \`appliedAt\`, \`followUpAt\`, \`notes\`, \`createdAt\`, \`updatedAt\`; dates as YYYY-MM-DD; \`stage\` one of lead, drafting, ready, applied, interview, offer, rejected, closed), plus \`posting.md\`, \`resume.md\`, \`cover-letter.md\` and \`email.md\` when they exist.

Rules:

- Keep each JSON file's fields exactly as listed, and change only the fields the task names.
- Never invent experience, employers, dates, numbers or contacts. Report what is missing instead.
- Never send an email or submit an application. Prepare drafts only; the person sends.
- When the person gives you a document about themselves, save a copy under \`profile/\`.
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

Then read \`${dir}/profile/master.md\` (if it does not exist, read the files in \`${dir}/profile/\` instead), \`${dir}/intake.json\`, the included entries of \`${dir}/repos.json\`, and \`${folder}/application.json\` for my notes and the contact.

Write:${resume}${letter}

Tailor to the posting's main requirements: lead with my most relevant work, use the posting's own terms for skills I really have, and cut what does not serve this job. ${NO_INVENTING}

When both \`resume.md\` and \`cover-letter.md\` exist in the folder, set \`"stage": "ready"\` in \`${folder}/application.json\`, leaving its other fields as they are. In your reply, give me the posting's requirements I do not meet and any questions, briefly. Do not paste the documents into the chat.`;
}

export function emailDraft(dir, row) {
  const folder = appDir(dir, row.id);
  const to = row.contactEmail
    ? `Address it to ${row.contactEmail}${row.contactName ? ` (${row.contactName})` : ""}.`
    : `No contact address is saved: look for one in the posting. If you find one, set \`contactEmail\` in \`${folder}/application.json\`; if not, ask me.`;

  return `Write the email for my application: ${title(row)}. Write a draft only. Do not send anything.

Read \`${folder}/posting.md\`, \`${folder}/resume.md\` and \`${folder}/cover-letter.md\` (whichever exist), \`${folder}/application.json\`, and \`${dir}/guides/email-guide.md\`. ${to}

1. Write the email to \`${folder}/email.md\`, its first line \`Subject: ...\`, then a blank line, then the plain-text body, following the guide and any instructions the posting gives for applying.
2. If you have a Gmail tool, also create a Gmail draft with that subject and body, and attach the resume PDF from the folder when there is one. If you have no such tool, stop after step 1: the panel's "Open in mail app" button opens \`email.md\` as a draft.
3. Tell me exactly which files to attach before I send.

${NO_INVENTING}`;
}

export function exportFiles(dir, row) {
  const folder = appDir(dir, row.id);

  return `Export the documents for my application (${title(row)}) as files I can upload or attach.

Convert \`${folder}/resume.md\` and, if it exists, \`${folder}/cover-letter.md\` to PDF in the same folder, named \`Firstname-Lastname-Resume.pdf\` and \`Firstname-Lastname-Cover-Letter.pdf\` with my real name from the resume. Follow the Format section of \`${dir}/guides/resume-guide.md\`: one column, a common font, selectable text an applicant tracking system can read. Use a converter already on this machine (pandoc, a headless browser, LibreOffice); ask before installing one.

Change no wording. Check the result by opening it: the resume must fit the page count the guide sets, with nothing cut off. If it runs over, tell me what you would trim and wait for my answer. Tell me the files' full paths when done.`;
}
