// Every read and write of the data folder. The folder is the source of truth: the panel shows
// a snapshot of it, and an agent or the person may change any file at any time.
import * as fs from "fs/promises";
import { home, shared, readTextFile, writeTextFile } from "herdr";
import { parse, format, toIntake, toRepos, toApplication, stored, isoDate, appendNotes, DOCS, readVerdict, parseEmail, toMessage, messageName } from "./model.js";
import { RESUME_GUIDE, COVER_LETTER_GUIDE, EMAIL_GUIDE, PROFILE_README } from "./guides.js";
import { agentsFile } from "./prompts.js";

export const DIR_KEY = "job-quest.dir";
const DEFAULT_DIR = "~/job-quest-data";

// The data folder: the person's choice (shared "job-quest.dir"), else ~/job-quest-data.
// fs.readdir reads only inside the home folder, so keep it there.
export function dataDir() {
  const chosen = shared(DIR_KEY);
  const raw = (typeof chosen === "string" && chosen.trim() ? chosen.trim() : DEFAULT_DIR).replace(/[\\/]+$/, "");
  return raw.startsWith("~") ? `${home()}${raw.slice(1)}` : raw;
}

export const appDir = (dir, id) => `${dir}/applications/${id}`;
export const today = () => isoDate(new Date());

const names = (path) => fs.readdir(path).catch(() => []);
const read = (path) => readTextFile(path).catch(() => null);

// writeTextFile replaces a file only when told what it holds now (null: a new file).
// Every block of the layout is its own copy of the mod, and they start together: two copies can
// read the same old text and race to write the same new one. A rejected write whose file now
// holds what this copy wanted is a lost race, not a conflict.
async function put(path, text) {
  const current = await read(path);
  if (current === text) return;
  try { await writeTextFile(path, text, current); }
  catch (e) { if ((await read(path)) !== text) throw e; }
}

async function putIfMissing(path, text) {
  if ((await read(path)) !== null) return;
  try { await writeTextFile(path, text, null); }
  catch (e) { if ((await read(path)) === null) throw e; }
}

// The folder's fixed files. Guides are the person's to edit, so one that exists is left alone;
// AGENTS.md and CLAUDE.md are the panel's and follow the folder's path.
export async function ensureLayout(dir) {
  await putIfMissing(`${dir}/guides/resume-guide.md`, RESUME_GUIDE);
  await putIfMissing(`${dir}/guides/cover-letter-guide.md`, COVER_LETTER_GUIDE);
  await putIfMissing(`${dir}/guides/email-guide.md`, EMAIL_GUIDE);
  await putIfMissing(`${dir}/profile/README.md`, PROFILE_README);
  await put(`${dir}/AGENTS.md`, agentsFile(dir));
  await putIfMissing(`${dir}/CLAUDE.md`, "@AGENTS.md\n");
  await putIfMissing(`${dir}/.claude/settings.json`, AGENT_SETTINGS);
}

// Claude Code's permissions for agents started in the data folder, so the party works without
// stopping to ask: auto mode (its classifier approves routine actions), edits in the folder, the
// web, curl for public job boards, and Gmail drafts.
// Sending mail is denied, so the final step stays the person's. Written once; theirs to edit.
export const AGENT_SETTINGS = format({
  permissions: {
    defaultMode: "auto",
    allow: [
      "Read", "Edit", "Write", "WebSearch", "WebFetch",
      "Bash(curl:*)", "Bash(gh:*)", "Bash(ls:*)", "Bash(mkdir:*)", "Bash(cat:*)", "Bash(date:*)",
      "Bash(pandoc:*)", "Bash(git clone:*)", "mcp__claude_ai_Gmail__create_draft",
    ],
    deny: [
      "mcp__claude_ai_Gmail__send_message", "mcp__claude_ai_Gmail__reply", "mcp__claude_ai_Gmail__forward",
      "mcp__claude_ai_Gmail__send_draft",
    ],
  },
});

async function loadApplication(dir, id) {
  const folder = appDir(dir, id);
  const [json, files] = await Promise.all([read(`${folder}/application.json`), names(folder)]);
  if (json === null) return null;
  const has = Object.fromEntries(DOCS.map((d) => [d.has, files.includes(d.file)]));
  const review = has.hasReview ? readVerdict(await read(`${folder}/review.md`)) : { verdict: "", round: 0 };
  const email = has.hasEmail ? parseEmail(await read(`${folder}/email.md`)) : null;
  const mail = {
    emailTo: email?.to ?? "", emailFrom: email?.from ?? "", attachments: email?.attachments ?? [],
    missingAttachments: (email?.attachments ?? []).filter((name) => !files.includes(name)),
  };
  return { ...toApplication(id, parse(json)), ...has, ...review, ...mail, hasPdfs: files.some((name) => name.toLowerCase().endsWith(".pdf")), hasContactSearch: files.includes("contact-search.md") };
}

// The whole folder. A missing or broken file reads as empty.
export async function loadSnapshot(dir) {
  const [intake, repos, profile, ids, reports, log, chat] = await Promise.all([
    read(`${dir}/intake.json`), read(`${dir}/repos.json`), names(`${dir}/profile`), names(`${dir}/applications`),
    names(`${dir}/reports`), read(`${dir}/${LOG}`), loadChat(dir),
  ]);
  const applications = (await Promise.all(ids.map((id) => loadApplication(dir, id)))).filter(Boolean);
  return {
    dir, today: today(),
    intake: toIntake(parse(intake)),
    repos: toRepos(parse(repos)),
    profileFiles: profile.filter((name) => !name.startsWith(".") && name !== "README.md" && name !== "master.md").sort(),
    hasMaster: profile.includes("master.md"),
    reports: reports.filter((name) => name.endsWith(".md")).sort(),
    log: readLog(log).slice(-LOG_SHOWN),
    chat,
    applications: applications.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id)),
  };
}

export const saveIntake = (dir, intake) => put(`${dir}/intake.json`, format(toIntake(intake)));
export const saveRepos = (dir, repos) => put(`${dir}/repos.json`, format(toRepos(repos)));
export const saveApplication = (dir, application) =>
  put(`${appDir(dir, application.id)}/application.json`, format(stored(application, today())));
export const savePosting = (dir, id, posting) => put(`${appDir(dir, id)}/posting.md`, posting.trim() + "\n");
// A document edited in the panel: saved only if the file still holds `original`, so an
// agent's newer text is never overwritten. Rejects on a conflict.
export const saveDocument = (dir, id, file, text, original) => writeTextFile(`${appDir(dir, id)}/${file}`, text, original);
export const readDocument = (dir, id, file) => read(`${appDir(dir, id)}/${file}`);
export const folderFiles = (dir, id) => names(appDir(dir, id));

export async function addNotes(dir, notes) {
  const path = `${dir}/profile/notes.md`;
  await put(path, appendNotes(await read(path), notes, today()));
}

// The party's adventure log: one JSON object a line, { at, member, appId, text }. Only the copy
// running the party writes it.
const LOG = "log.jsonl";
const LOG_KEPT = 400, LOG_SHOWN = 60;

export function readLog(text) {
  return (text ?? "").split("\n").map((line) => parse(line)).filter((e) => e && typeof e.text === "string");
}

export async function appendLog(dir, entries) {
  if (!entries.length) return;
  const path = `${dir}/${LOG}`;
  const held = ((await read(path)) ?? "").split("\n").filter(Boolean);
  const lines = [...held, ...entries.map((e) => JSON.stringify(e))].slice(-LOG_KEPT);
  await put(path, lines.join("\n") + "\n");
}

// The chat's newest messages, oldest first. A file an agent got wrong is skipped.
const CHAT_SHOWN = 150;
export async function loadChat(dir) {
  const files = (await names(`${dir}/chat`)).filter((name) => name.endsWith(".json")).sort().slice(-CHAT_SHOWN);
  const messages = await Promise.all(files.map(async (name) => toMessage(parse(await read(`${dir}/chat/${name}`)), name)));
  return messages.filter(Boolean).sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}

export async function saveMessage(dir, message, now = new Date()) {
  const full = { at: now.toISOString(), appId: "", to: "", ...message };
  await put(`${dir}/chat/${messageName(now, full.from)}`, format(full));
}
