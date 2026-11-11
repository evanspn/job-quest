// The data's shapes and every rule about them. No Herdr imports, so Node can test this file.

export const STAGES = ["lead", "drafting", "ready", "applied", "interview", "offer", "rejected", "closed"];

export const STAGE_LABEL = {
  lead: "Leads", drafting: "Party at work", ready: "Ready to submit", applied: "Applied",
  interview: "Interviewing", offer: "Offer", rejected: "Rejected", closed: "Closed",
};

// An application's documents: the file, the snapshot flag that says it exists, its name.
export const DOCS = [
  { id: "posting", file: "posting.md", has: "hasPosting", label: "Posting" },
  { id: "research", file: "research.md", has: "hasResearch", label: "Research" },
  { id: "resume", file: "resume.md", has: "hasResume", label: "Resume" },
  { id: "letter", file: "cover-letter.md", has: "hasCoverLetter", label: "Cover letter" },
  { id: "review", file: "review.md", has: "hasReview", label: "Review" },
  { id: "email", file: "email.md", has: "hasEmail", label: "Email" },
  { id: "followup", file: "followup.md", has: "hasFollowup", label: "Follow-up" },
  { id: "prep", file: "prep.md", has: "hasPrep", label: "Interview prep" },
];

// The board's columns: every open stage always, the two closed ones only when used.
export function columns(applications) {
  return STAGES.filter((stage) => !["rejected", "closed"].includes(stage) || applications.some((a) => a.stage === stage))
    .map((stage) => ({ stage, label: STAGE_LABEL[stage], rows: applications.filter((a) => a.stage === stage) }));
}

// A node of a layout tree by id (layout() gives the shown tree), or null.
export function findNode(node, id) {
  if (!node || typeof node !== "object") return null;
  if (node.id === id) return node;
  for (const child of [...(node.children ?? []), ...(node.floating ?? [])]) {
    const found = findNode(child, id);
    if (found) return found;
  }
  return null;
}

// What the person is looking for: intake.json. Every field is free text.
export const INTAKE_FIELDS = [
  { key: "roles", label: "Roles", hint: "Backend engineer, platform engineer" },
  { key: "seniority", label: "Level", hint: "Mid, senior, staff" },
  { key: "workMode", label: "Work mode", hint: "Remote, hybrid or on-site" },
  { key: "locations", label: "Locations", hint: "Cities, regions or time zones" },
  { key: "salaryMin", label: "Salary floor", hint: "140k base" },
  { key: "stack", label: "Stack", hint: "Languages and tools you want to work in" },
  { key: "companyStage", label: "Company stage", hint: "Seed, growth, public" },
  { key: "dealBreakers", label: "Deal-breakers", hint: "What rules a job out" },
  { key: "notes", label: "Anything else", hint: "What should steer the search" },
  { key: "autoFit", label: "The party takes on leads that score at least", hint: "70 (0 to 100), or off" },
];

// The fields of applications/<id>/application.json, in the order they are written.
export const APPLICATION_KEYS = [
  "id", "company", "role", "url", "stage", "contactName", "contactEmail",
  "appliedAt", "followUpAt", "notes", "fit", "source", "createdAt", "updatedAt",
];

const text = (value) => (typeof value === "string" ? value : "");
const record = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});

// JSON text to a value; anything unreadable is undefined, never a throw.
export function parse(json) {
  try { return JSON.parse(json ?? ""); } catch { return undefined; }
}

export const format = (value) => JSON.stringify(value, null, 2) + "\n";

export function toIntake(value) {
  const held = record(value);
  return Object.fromEntries(INTAKE_FIELDS.map(({ key }) => [key, text(held[key])]));
}

export function toRepos(value) {
  if (!Array.isArray(value)) return [];
  return value.map(record).map((one) => ({
    fullName: text(one.fullName), url: text(one.url), isPrivate: one.isPrivate === true,
    isIncluded: one.isIncluded === true, summary: text(one.summary),
  })).filter((repo) => repo.fullName);
}

export function toApplication(id, value) {
  const held = record(value);
  return {
    id, company: text(held.company) || id, role: text(held.role), url: text(held.url),
    stage: STAGES.includes(held.stage) ? held.stage : "lead",
    contactName: text(held.contactName), contactEmail: text(held.contactEmail),
    appliedAt: text(held.appliedAt), followUpAt: text(held.followUpAt), notes: text(held.notes),
    fit: typeof held.fit === "number" ? String(held.fit) : text(held.fit), source: text(held.source),
    createdAt: text(held.createdAt), updatedAt: text(held.updatedAt),
  };
}

// Only the stored fields, in order: what the panel knows beside them (which documents exist) stays out.
export function stored(application, today) {
  const out = Object.fromEntries(APPLICATION_KEYS.map((key) => [key, application[key] ?? ""]));
  return { ...out, updatedAt: today };
}

export function isoDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(date, days) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

export const slug = (words) =>
  words.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);

// "Company, Role" to a new application, or null when there is no company. `taken`: ids in use.
export function newApplication(line, taken, today) {
  const [company = "", ...rest] = line.split(",");
  const role = rest.join(",").trim(), base = slug(`${company} ${role}`);
  if (!base) return null;
  let id = base;
  for (let n = 2; taken.includes(id); n += 1) id = `${base}-${n}`;
  return { ...toApplication(id, { company: company.trim(), role, createdAt: today }), updatedAt: today };
}

// A stage change. Moving to applied the first time stamps the date and a follow-up a week out.
export function withStage(application, stage, today) {
  if (stage !== "applied" || application.appliedAt) return { ...application, stage };
  return { ...application, stage, appliedAt: today, followUpAt: application.followUpAt || addDays(today, 7) };
}

export const followUpsDue = (applications, today) =>
  applications.filter((a) => a.stage === "applied" && a.followUpAt && a.followUpAt <= today);

// "owner/name" or a repository address to { fullName, url }, else null.
export function parseRepo(entry) {
  const trimmed = entry.trim();
  const found = /^(?:https?:\/\/[^/\s]+\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(trimmed);
  if (!found) return null;
  const fullName = `${found[1]}/${found[2]}`;
  const url = /^https?:/.test(trimmed) ? trimmed.replace(/(\.git)?\/?$/, "") : `https://github.com/${fullName}`;
  return { fullName, url };
}

// Adds repositories `gh repo list --json nameWithOwner,url,isPrivate` found. Entries already
// listed keep their choice and summary; a new one starts left out, so nothing is described unasked.
export function mergeRepos(existing, listed) {
  const known = new Set(existing.map((repo) => repo.fullName));
  const added = (Array.isArray(listed) ? listed : []).map(record)
    .filter((one) => text(one.nameWithOwner) && !known.has(one.nameWithOwner))
    .map((one) => ({ fullName: one.nameWithOwner, url: text(one.url), isPrivate: one.isPrivate === true, isIncluded: false, summary: "" }));
  return [...existing, ...added];
}

export const toggleRepo = (repos, fullName) =>
  repos.map((repo) => (repo.fullName === fullName ? { ...repo, isIncluded: !repo.isIncluded } : repo));

export function addRepo(repos, parsed) {
  return [...repos.filter((repo) => repo.fullName !== parsed.fullName), { ...parsed, isPrivate: false, isIncluded: true, summary: "" }];
}

// Pasted notes go under the day's heading in profile/notes.md.
export function appendNotes(held, notes, today) {
  return `${(held || "# Notes").trimEnd()}\n\n## ${today}\n\n${notes.trim()}\n`;
}

export const isLink = (pasted) => /^https?:\/\/\S+$/.test(pasted.trim());

// email.md: a header block, a blank line, then the plain-text body.
//   To: Jane Doe <jane@acme.com>
//   From: Me <me@example.com>
//   Subject: ...
//   Attachments: Me-Resume.pdf, Me-Cover-Letter.pdf     (files in the application's folder)
const HEADERS = ["to", "from", "cc", "subject", "attachments"];

export function parseEmail(text) {
  const lines = (text ?? "").replace(/\r/g, "").split("\n");
  const out = { to: "", from: "", cc: "", subject: "", attachments: [], body: "" };
  let at = 0;
  while (at < lines.length && !lines[at].trim()) at += 1;
  for (; at < lines.length; at += 1) {
    const found = /^\s*([A-Za-z]+):\s*(.*)$/.exec(lines[at]);
    if (!found || !HEADERS.includes(found[1].toLowerCase())) break;
    const key = found[1].toLowerCase(), value = found[2].trim();
    if (key === "attachments") out.attachments = value.split(",").map((f) => f.trim()).filter(Boolean);
    else out[key] = value;
  }
  out.body = lines.slice(at).join("\n").trim();
  return out;
}

// "Jane Doe <jane@acme.com>" or "jane@acme.com" to { name, address }; address "" when none.
export function splitAddress(value) {
  const angled = /^(.*?)<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/.exec(value ?? "");
  if (angled) return { name: angled[1].trim().replace(/^"|"$/g, ""), address: angled[2] };
  const bare = /([^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+)/.exec(value ?? "");
  return { name: "", address: bare ? bare[1] : "" };
}

export const isEmail = (value) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test((value ?? "").trim());

// email.md to a mailto: address (no attachments: mailto cannot carry them).
export function mailto(emailMd, fallbackTo) {
  const email = parseEmail(emailMd);
  const to = splitAddress(email.to).address || fallbackTo || "";
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(email.subject)}&body=${encodeURIComponent(email.body)}`;
}

export const nameOf = (application) =>
  application.role ? `${application.company} · ${application.role}` : application.company;

// ---- the party: coding agents the mod starts, each with one job, handing over through files

// Who is in the party. `color` names a theme color.
export const MEMBERS = {
  scout: { name: "Scout", glyph: "🏹", color: "ansi2", role: "Finds openings that fit you" },
  sage: { name: "Sage", glyph: "🔮", color: "ansi5", role: "Researches the company" },
  scribe: { name: "Scribe", glyph: "🪶", color: "ansi4", role: "Drafts resume and cover letter" },
  inquisitor: { name: "Inquisitor", glyph: "🔍", color: "ansi1", role: "Checks every claim and keyword" },
  herald: { name: "Herald", glyph: "📯", color: "ansi3", role: "Email, PDFs and follow-ups" },
  coach: { name: "Coach", glyph: "🥊", color: "ansi6", role: "Interview prep" },
  archivist: { name: "Archivist", glyph: "📜", color: "accent", role: "Your profile and intake" },
};
export const ROSTER = Object.keys(MEMBERS);

// What each kind of job is called while it runs.
export const DOING = {
  scout: "Scouting for openings", research: "Researching", draft: "Drafting", revise: "Revising",
  review: "Reviewing", package: "Packaging", followup: "Writing a follow-up", prep: "Preparing interview notes",
  "draft-resume": "Drafting the resume", "draft-letter": "Drafting the cover letter", email: "Writing the email",
  export: "Exporting PDFs", reply: "Acting on your reply", interview: "Interviewing you", master: "Building your master profile", repos: "Summarizing projects",
};

export const MAX_PARTY = 3;        // agents the party runs at once
export const REVIEW_ROUNDS = 2;    // reviews before the drafts go to you whatever the verdict
export const START_TIMEOUT = 5 * 60 * 1000;
// States of a job that still has an agent on it. waiting: it needs the person (a permission
// prompt, or a question it posted in the chat). stopped: it went quiet without its file and
// without asking anything.
export const LIVE = ["starting", "working", "waiting", "stopped"];
// Jobs that are a conversation in the terminal: quiet means it is waiting for the person.
const CONVERSATIONS = ["interview"];
export const isLive = (job) => LIVE.includes(job.state);

// intake.autoFit: the score a Scout's lead needs for the party to take it on. Blank: 70. "off": never.
export function minFit(intake) {
  const raw = String(intake?.autoFit ?? "").trim().toLowerCase();
  if (["off", "no", "never", "none"].includes(raw)) return null;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 70;
}

export function fitOf(application) {
  const n = Number.parseInt(application.fit, 10);
  return Number.isFinite(n) ? n : null;
}

// review.md starts with "Verdict: pass | revise | revised" and "Round: n".
export function readVerdict(review) {
  const verdict = /^\s*verdict:\s*(pass|revised|revise)\b/im.exec(review ?? "");
  const round = /^\s*round:\s*(\d+)/im.exec(review ?? "");
  return { verdict: verdict ? verdict[1].toLowerCase() : "", round: round ? Number(round[1]) : 0 };
}

// What an application needs next, read from its stage and files: a member's job, a stage to move
// to, a reason it can't go on, or null.
export function nextStep(app, today, threshold) {
  if (app.stage === "lead") {
    const fit = fitOf(app);
    return threshold !== null && fit !== null && fit >= threshold ? { advance: "drafting" } : null;
  }
  if (app.stage === "drafting") {
    // The Sage finds the posting itself when there is no link; only if it could not is it stuck.
    if (!app.hasResearch) return { member: "sage", kind: "research" };
    if (!app.hasPosting) return { stuck: "has no posting: the Sage could not find it. Paste the posting or its link" };
    // Full stop: nothing is drafted for an application with nobody to send it to.
    if (!isEmail(app.contactEmail)) return { stuck: "has no contact email, so nothing is drafted. Add the address to send it to and the party carries on" };
    if (!app.hasResume || !app.hasCoverLetter) return { member: "scribe", kind: "draft" };
    if (!["pass", "revise"].includes(app.verdict)) return { member: "inquisitor", kind: "review" };
    if (app.verdict === "revise" && app.round < REVIEW_ROUNDS) return { member: "scribe", kind: "revise" };
    if (!emailReady(app)) return { member: "herald", kind: "package" };
    return { advance: "ready" };
  }
  if (app.stage === "applied" && app.followUpAt && app.followUpAt <= today && !app.hasFollowup) return { member: "herald", kind: "followup" };
  if (app.stage === "interview" && !app.hasPrep) return { member: "coach", kind: "prep" };
  return null;
}

// Whether a job's work is on disk. A job without a check (an interview, an export) is done when
// its agent is gone.
export function jobDone(job, app, reports = []) {
  if (job.kind === "scout") return reports.includes(job.report);
  if (job.kind === "reply") return true;
  // Profile and intake jobs have no application and no file to check.
  if (["interview", "master", "repos"].includes(job.kind)) return null;
  if (!app) return false;
  switch (job.kind) {
    case "research": return app.hasResearch;
    case "draft": return app.hasResume && app.hasCoverLetter;
    case "draft-resume": return app.hasResume;
    case "draft-letter": return app.hasCoverLetter;
    case "review": return ["pass", "revise"].includes(app.verdict) && app.round > (job.round ?? 0);
    case "revise": return app.verdict === "revised";
    case "package": return emailReady(app);
    case "email": return app.hasEmail;
    case "followup": return app.hasFollowup;
    case "prep": return app.hasPrep;
    case "export": return app.hasPdfs;
    case "reply": return true; // done once its agent goes quiet
    default: return null;
  }
}

// The email is written, addressed, and every attachment it names is in the folder.
export const emailReady = (app) =>
  Boolean(app.hasEmail && isEmail(splitAddress(app.emailTo).address) && app.attachments?.length && !app.missingAttachments?.length);

export const jobKey = (member, kind, appId, round = 0) => [member, kind, appId ?? "", round].join(":");

// What the party starts and moves now. `jobs`: every job it remembers; a job tried once is not
// tried again by itself, so a step that fails waits for the person instead of looping.
export function plan(snapshot, jobs, { threshold, scoutDue, room = MAX_PARTY }) {
  const live = jobs.filter(isLive), tried = new Set(jobs.map((j) => j.key));
  const busy = new Set(live.map((j) => j.appId).filter(Boolean));
  let free = room - live.length;
  const starts = [], advances = [], stuck = [];
  if (scoutDue && free > 0 && !live.some((j) => j.member === "scout") && !tried.has(scoutDue.key)) {
    starts.push({ key: scoutDue.key, member: "scout", kind: "scout", appId: null, report: scoutDue.report, round: 0 });
    free -= 1;
  }
  // Closest to your approval first: drafting before follow-ups and prep, leads last.
  const order = ["drafting", "interview", "applied", "lead"];
  const apps = snapshot.applications.filter((a) => order.includes(a.stage))
    .sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage));
  for (const app of apps) {
    if (busy.has(app.id)) continue;
    const step = nextStep(app, snapshot.today, threshold);
    if (!step) continue;
    if (step.advance) { advances.push({ app, stage: step.advance }); continue; }
    if (step.stuck) { stuck.push({ app, reason: step.stuck }); continue; }
    const key = jobKey(step.member, step.kind, app.id, app.round ?? 0);
    if (tried.has(key) || free <= 0) continue;
    starts.push({ key, member: step.member, kind: step.kind, appId: app.id, round: app.round ?? 0 });
    busy.add(app.id); free -= 1;
  }
  return { starts, advances, stuck };
}

// A job's state from its agent (agents(): status working | blocked | done | idle, or absent),
// whether its file is on disk (`done`: true, false, or null for a job with no file to check),
// and whether it has posted in the chat since it started (`asked`).
export function jobState(job, agent, done, now, asked = false) {
  if (agent) {
    if (agent.status === "working") return "working";
    if (agent.status === "blocked") return "waiting";
    if (done === true) return "done";
    if (done === null) return CONVERSATIONS.includes(job.kind) ? "waiting" : "done";
    return asked ? "waiting" : "stopped";
  }
  if (job.address) return done === false ? "failed" : "done";
  return now - job.startedAt > START_TIMEOUT ? "failed" : "starting";
}

// ---- the party chat: one JSON file a message in chat/, { at, from, to, appId, text }.
// `from` is "you", a member's key, or another agent's name; `to` says who it was meant for.

export function toMessage(value, name) {
  const held = record(value);
  const textOf = text(held.text).trim();
  if (!textOf) return null;
  return { id: name, at: text(held.at), from: text(held.from).toLowerCase() || "party", to: text(held.to), appId: text(held.appId), text: textOf };
}

// A file name that sorts by time: 20261111-173501-123-sage.json.
export function messageName(date, from) {
  const pad = (n, w = 2) => String(n).padStart(w, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${pad(date.getMilliseconds(), 3)}`;
  return `${stamp}-${slug(from) || "you"}.json`;
}

// @mentions in a chat message: "@sage", "@sage/northwind", "@everyone". Lowercase, in order.
export function mentionsIn(text) {
  return [...(text ?? "").matchAll(/(?:^|\s)@([a-z0-9][\w/-]*)/gi)].map((m) => m[1].toLowerCase().replace(/[/-]+$/, ""));
}

// The mention being typed at the end of the text ("" right after "@"), else null.
export function typingMention(text) {
  const found = /(?:^|\s)@([\w/-]*)$/.exec(text ?? "");
  return found ? found[1].toLowerCase() : null;
}

// Short handles for running workers: "sage/northwind", or the whole application id when two
// workers in one role would share the short one; "scout" for a job with no application.
export function handlesFor(jobs) {
  const short = (job) => (job.appId ? `${job.member}/${job.appId.split("-")[0]}` : job.member);
  const counts = new Map();
  for (const job of jobs) counts.set(short(job), (counts.get(short(job)) ?? 0) + 1);
  return jobs.map((job) => ({ job, handle: counts.get(short(job)) > 1 && job.appId ? `${job.member}/${job.appId}` : short(job) }));
}

// The chat with the party's log woven in: messages and events in time order.
export function feed(messages, log) {
  const events = log.map((e, i) => ({ id: `log-${i}-${e.at}`, at: e.at, from: "party", to: "", appId: e.appId ?? "", text: e.text, event: true }));
  return [...messages, ...events].sort((a, b) => (a.at || "").localeCompare(b.at || "") || a.id.localeCompare(b.id));
}
