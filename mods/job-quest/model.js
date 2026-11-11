// The data's shapes and every rule about them. No Herdr imports, so Node can test this file.

export const STAGES = ["lead", "drafting", "ready", "applied", "interview", "offer", "rejected", "closed"];

export const STAGE_LABEL = {
  lead: "Leads", drafting: "Drafting", ready: "Ready to submit", applied: "Applied",
  interview: "Interviewing", offer: "Offer", rejected: "Rejected", closed: "Closed",
};

// An application's documents: the file, the snapshot flag that says it exists, its name.
export const DOCS = [
  { id: "posting", file: "posting.md", has: "hasPosting", label: "Posting" },
  { id: "resume", file: "resume.md", has: "hasResume", label: "Resume" },
  { id: "letter", file: "cover-letter.md", has: "hasCoverLetter", label: "Cover letter" },
  { id: "email", file: "email.md", has: "hasEmail", label: "Email" },
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
];

// The fields of applications/<id>/application.json, in the order they are written.
export const APPLICATION_KEYS = [
  "id", "company", "role", "url", "stage", "contactName", "contactEmail",
  "appliedAt", "followUpAt", "notes", "createdAt", "updatedAt",
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

// email.md ("Subject: ..." first, then the body) to a mailto: address the mail app opens as a draft.
export function mailto(emailMd, to) {
  const lines = (emailMd ?? "").split("\n");
  const at = lines.findIndex((line) => /^subject:/i.test(line.trim()));
  const subject = at < 0 ? "" : lines[at].trim().replace(/^subject:\s*/i, "");
  const body = (at < 0 ? lines : lines.slice(at + 1)).join("\n").trim();
  return `mailto:${encodeURIComponent(to ?? "")}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export const nameOf = (application) =>
  application.role ? `${application.company} · ${application.role}` : application.company;
