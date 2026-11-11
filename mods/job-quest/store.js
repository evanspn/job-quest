// Every read and write of the data folder. The folder is the source of truth: the panel shows
// a snapshot of it, and an agent or the person may change any file at any time.
import * as fs from "fs/promises";
import { home, shared, readTextFile, writeTextFile } from "herdr";
import { parse, format, toIntake, toRepos, toApplication, stored, isoDate, appendNotes } from "./model.js";
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
async function put(path, text) {
  const current = await read(path);
  if (current !== text) await writeTextFile(path, text, current);
}

async function putIfMissing(path, text) {
  if ((await read(path)) === null) await writeTextFile(path, text, null);
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
}

async function loadApplication(dir, id) {
  const folder = appDir(dir, id);
  const [json, files] = await Promise.all([read(`${folder}/application.json`), names(folder)]);
  if (json === null) return null;
  return {
    ...toApplication(id, parse(json)),
    hasPosting: files.includes("posting.md"), hasResume: files.includes("resume.md"),
    hasCoverLetter: files.includes("cover-letter.md"), hasEmail: files.includes("email.md"),
  };
}

// The whole folder. A missing or broken file reads as empty.
export async function loadSnapshot(dir) {
  const [intake, repos, profile, ids] = await Promise.all([
    read(`${dir}/intake.json`), read(`${dir}/repos.json`), names(`${dir}/profile`), names(`${dir}/applications`),
  ]);
  const applications = (await Promise.all(ids.map((id) => loadApplication(dir, id)))).filter(Boolean);
  return {
    dir, today: today(),
    intake: toIntake(parse(intake)),
    repos: toRepos(parse(repos)),
    profileFiles: profile.filter((name) => !name.startsWith(".") && name !== "README.md" && name !== "master.md").sort(),
    hasMaster: profile.includes("master.md"),
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

export async function addNotes(dir, notes) {
  const path = `${dir}/profile/notes.md`;
  await put(path, appendNotes(await read(path), notes, today()));
}
