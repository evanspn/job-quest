// The guides written to <data folder>/guides/ on first use. They are the
// person's to edit afterwards: a guide that exists is never overwritten.

export const RESUME_GUIDE = `# Resume guide: software engineering

Follow this when drafting or reviewing a resume. Edit it to taste; drafts follow whatever this file says.

## Hard rules

- Never invent an employer, title, date, degree, technology or number. Every claim must trace to the profile, a repository summary or something the candidate said.
- If the posting asks for something the candidate lacks, leave it out of the resume. Report it to the candidate as a gap instead.
- One page under about 10 years of experience. Two pages at most beyond that.
- A single column of plain text. No tables, text boxes, columns, icons, photos, skill bars or ratings: applicant tracking systems misread them.
- No objective statement, no "References available on request", no full street address.

## Section order

1. **Header**: name, email, phone, city and region (or "Remote"), then GitHub and LinkedIn or portfolio links. One or two lines.
2. **Summary** (optional, 2 lines at most): only when it says something specific, such as years, domain and the kind of systems built. Leave it out for a new graduate.
3. **Experience**, newest first. New graduates and career changers put **Projects** or **Education** above it when those are stronger.
4. **Projects**: 2 to 4 that match the posting, each with a link.
5. **Skills**: grouped on labelled lines, for example Languages, Frameworks, Infrastructure, Data, Tools.
6. **Education**: degree, school, year. Add GPA only when strong and recent.

## Experience entries

- First line: title, company, location or Remote, and dates as "Mon YYYY to Mon YYYY".
- 3 to 5 bullets for recent roles, 1 to 2 for older ones.
- Each bullet: a strong past-tense verb, what was built or changed, the technology used, and the result. A useful template is "Did X using Y, which led to Z".
- Put a number in most bullets: latency, throughput, cost, error rate, users, revenue, team size, time saved. If no measurement exists, state scope instead (requests per day, services owned, engineers supported). Never estimate a number the candidate did not give.
- Lead with ownership and impact, not duties. "Owned", "designed", "led", "shipped", "cut" and "migrated" read better than "responsible for", "worked on" or "helped with".
- Name technologies inside the bullet where they were used, not only in the skills list.
- Show level: design decisions, cross-team work, mentoring, on-call and incident work, and trade-offs made.
- One or two lines per bullet. No first person, no full stop needed, consistent tense.

## Project entries

- Name, a one-line description of what it does, the stack, and a link to the repository or live site.
- 1 to 3 bullets on what was hard and what resulted: users, stars, performance, or what it demonstrates.
- Prefer projects with real users, tests, deployment or an interesting technical problem over tutorial work.

## Tailoring to a posting

- Read the posting for its top 5 to 8 requirements. Reorder bullets and projects so the most relevant sit first.
- Use the posting's own terms for technologies the candidate really has ("Postgres" if it says Postgres). Do not stuff keywords.
- Cut what does not serve this posting. A shorter, sharper resume beats a complete one.
- Order the skills line so the posting's stack comes first.

## Format

- Write Markdown: \`#\` for the name, \`##\` for sections, \`###\` for each role or project, \`-\` for bullets.
- Dates and locations sit on the same line as the role, after the company.
- Link text should be the bare address (github.com/name), so it survives printing.
- Export to PDF with a common font at 10 to 11 point, margins of at least half an inch, and a file named Firstname-Lastname-Resume.pdf.

## Before it goes out

- Reads in six seconds: is the top third the strongest material for this job?
- Every bullet answers "so what?".
- No typos, consistent dates, working links, and the same tense throughout.
`

export const COVER_LETTER_GUIDE = `# Cover letter guide

Follow this when drafting a cover letter. Edit it to taste; drafts follow whatever this file says.

## Hard rules

- Never invent experience, enthusiasm for a product the candidate has not used, or facts about the company. Only say what the posting, the company's own pages or the candidate's profile supports.
- 200 to 300 words, three or four short paragraphs. Shorter for a startup.
- Do not restate the resume. Pick one or two things and tell the part the resume cannot.

## Structure

1. **Opening**: the role, and one specific reason this company or problem interests the candidate. Not "I am writing to apply for".
2. **Evidence**: one or two concrete things the candidate built that match what the posting needs most, with the result. Link a repository when it is the proof.
3. **Fit**: what the candidate would do in the first months, or how they work, tied to something the posting says about the team.
4. **Close**: one line. Availability, and thanks. No "I look forward to hearing from you at your earliest convenience".

## Tone

- Plain, direct, first person. Sounds like the candidate talking to a future colleague.
- No cliches: "passionate", "fast-paced", "team player", "synergy", "hit the ground running", "I believe I would be a great fit".
- Address a named person when the posting or the candidate gives one. Otherwise "Hi <Company> team,".
- Match the company's register: a startup's posting written casually gets a casual letter.

## Format

- Write Markdown with no headings: greeting, paragraphs, sign-off, name.
- Under the name, the same email and links as the resume header.
`

export const EMAIL_GUIDE = `# Application email guide

For companies that take applications by email, which many startups do.

## Hard rules

- The email is a draft for the candidate to review and send. Never send it.
- Never invent a contact, a referral or a prior conversation.

## Structure

- First line of the file: \`Subject: <Role> application: <Full name>\`. If the posting names a subject format, use theirs exactly.
- Greeting to the named contact, or "Hi <Company> team,".
- 80 to 150 words in the body. The email is the cover letter's short form, not a pointer to it:
  1. The role and where the candidate saw it.
  2. Two sentences on the most relevant thing they built, with a link.
  3. What is attached (resume, and cover letter if there is one) and links to GitHub or portfolio.
  4. A one-line close and the candidate's name, phone and links.
- If the posting asks specific questions or for specific material, answer each in the order asked.

## Attachments

- Resume as PDF, named Firstname-Lastname-Resume.pdf.
- Cover letter as PDF only when the posting asks for one; otherwise the email body does its job.
`

export const PROFILE_README = `# Profile folder

Put anything about you in this folder: old resumes, cover letters, a LinkedIn export, performance reviews, or rough notes. PDF, Word, Markdown and plain text all work.

- \`notes.md\` collects what you paste into the panel's word dump box.
- \`master.md\` is the master profile Claude builds from everything here plus your chosen GitHub repositories. Drafts are tailored from it. You can edit it by hand.
`
