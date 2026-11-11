import type { EngineInterface, PluginOptions } from 'claude-code'

import type {
  Application,
  ApplicationRow,
  Intake,
  Repo,
  Snapshot,
  Stage,
} from '../types'
import { COVER_LETTER_GUIDE, EMAIL_GUIDE, PROFILE_README, RESUME_GUIDE } from './guides'

type Engine = EngineInterface

export const STAGES: readonly Stage[] = [
  'lead',
  'drafting',
  'ready',
  'applied',
  'interview',
  'offer',
  'rejected',
  'closed',
]

export const EMPTY_INTAKE: Intake = {
  roles: '',
  seniority: '',
  workMode: '',
  locations: '',
  salaryMin: '',
  stack: '',
  companyStage: '',
  dealBreakers: '',
  notes: '',
}

export const EMPTY_SNAPSHOT: Snapshot = {
  dir: '',
  today: '',
  intake: EMPTY_INTAKE,
  profileFiles: [],
  hasMaster: false,
  repos: [],
  applications: [],
}

const DEFAULT_DIR = '~/job-quest-data'

/** The data folder as an absolute path, `~` standing for the home folder. */
export async function resolveDir($: Engine, options: PluginOptions): Promise<string> {
  const chosen = options['dataDir']
  const raw = typeof chosen === 'string' && chosen.trim() !== '' ? chosen.trim() : DEFAULT_DIR
  const trimmed = raw.replace(/[\\/]+$/, '')

  if (!trimmed.startsWith('~')) {
    return trimmed
  }

  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE')) ?? ''

  return home.replace(/[\\/]+$/, '') + trimmed.slice(1)
}

export const appDir = (dir: string, id: string): string => `${dir}/applications/${id}`

export async function today($: Engine): Promise<string> {
  return new Date(await $.clock.now()).toISOString().slice(0, 10)
}

export const addDays = (date: string, days: number): string => {
  const at = new Date(`${date}T00:00:00Z`).getTime() + days * 86_400_000

  return new Date(at).toISOString().slice(0, 10)
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

async function readJson($: Engine, path: string): Promise<unknown> {
  try {
    return JSON.parse(await $.fs.read(path))
  } catch {
    return undefined
  }
}

function writeJson($: Engine, path: string, value: unknown): Promise<void> {
  return $.fs.write(path, JSON.stringify(value, null, 2) + '\n')
}

async function writeIfMissing($: Engine, path: string, content: string): Promise<void> {
  if (!(await $.fs.exists(path))) {
    await $.fs.write(path, content)
  }
}

/** Creates the folder's fixed files on first use; never overwrites one. */
export async function ensureLayout($: Engine, dir: string): Promise<void> {
  await writeIfMissing($, `${dir}/guides/resume-guide.md`, RESUME_GUIDE)
  await writeIfMissing($, `${dir}/guides/cover-letter-guide.md`, COVER_LETTER_GUIDE)
  await writeIfMissing($, `${dir}/guides/email-guide.md`, EMAIL_GUIDE)
  await writeIfMissing($, `${dir}/profile/README.md`, PROFILE_README)
}

function toIntake(value: unknown): Intake {
  const held = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>

  return {
    roles: text(held['roles']),
    seniority: text(held['seniority']),
    workMode: text(held['workMode']),
    locations: text(held['locations']),
    salaryMin: text(held['salaryMin']),
    stack: text(held['stack']),
    companyStage: text(held['companyStage']),
    dealBreakers: text(held['dealBreakers']),
    notes: text(held['notes']),
  }
}

function toRepos(value: unknown): Repo[] {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter((one): one is Record<string, unknown> => typeof one === 'object' && one !== null)
    .map(one => ({
      fullName: text(one['fullName']),
      url: text(one['url']),
      isPrivate: one['isPrivate'] === true,
      isIncluded: one['isIncluded'] === true,
      summary: text(one['summary']),
    }))
    .filter(repo => repo.fullName !== '')
}

function toApplication(id: string, value: unknown): Application {
  const held = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>
  const stage = STAGES.find(one => one === held['stage']) ?? 'lead'

  return {
    id,
    company: text(held['company']) || id,
    role: text(held['role']),
    url: text(held['url']),
    stage,
    contactName: text(held['contactName']),
    contactEmail: text(held['contactEmail']),
    appliedAt: text(held['appliedAt']),
    followUpAt: text(held['followUpAt']),
    notes: text(held['notes']),
    createdAt: text(held['createdAt']),
    updatedAt: text(held['updatedAt']),
  }
}

async function loadApplication($: Engine, dir: string, id: string): Promise<ApplicationRow> {
  const folder = appDir(dir, id)
  const [stored, entries] = await Promise.all([
    readJson($, `${folder}/application.json`),
    $.fs.list(folder).catch(() => []),
  ])
  const names = new Set(entries.map(entry => entry.name))

  return {
    ...toApplication(id, stored),
    hasPosting: names.has('posting.md'),
    hasResume: names.has('resume.md'),
    hasCoverLetter: names.has('cover-letter.md'),
    hasEmail: names.has('email.md'),
  }
}

/** Reads the whole data folder. A missing or broken file reads as empty. */
export async function loadSnapshot($: Engine, dir: string): Promise<Snapshot> {
  const [intake, repos, profile, folders, date] = await Promise.all([
    readJson($, `${dir}/intake.json`),
    readJson($, `${dir}/repos.json`),
    $.fs.list(`${dir}/profile`).catch(() => []),
    $.fs.list(`${dir}/applications`).catch(() => []),
    today($),
  ])
  const ids = folders.filter(entry => entry.kind === 'dir').map(entry => entry.name)
  const applications = await Promise.all(ids.map(id => loadApplication($, dir, id)))
  const files = profile.filter(entry => entry.kind === 'file').map(entry => entry.name)

  return {
    dir,
    today: date,
    intake: toIntake(intake),
    profileFiles: files.filter(name => name !== 'README.md' && name !== 'master.md').sort(),
    hasMaster: files.includes('master.md'),
    repos: toRepos(repos),
    applications: applications.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  }
}

export function saveIntake($: Engine, dir: string, intake: Intake): Promise<void> {
  return writeJson($, `${dir}/intake.json`, intake)
}

export function saveRepos($: Engine, dir: string, repos: readonly Repo[]): Promise<void> {
  return writeJson($, `${dir}/repos.json`, repos)
}

export async function saveApplication($: Engine, dir: string, row: Application): Promise<void> {
  const stored: Application = {
    id: row.id,
    company: row.company,
    role: row.role,
    url: row.url,
    stage: row.stage,
    contactName: row.contactName,
    contactEmail: row.contactEmail,
    appliedAt: row.appliedAt,
    followUpAt: row.followUpAt,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: await today($),
  }

  await writeJson($, `${appDir(dir, row.id)}/application.json`, stored)
}

const slug = (words: string): string =>
  words
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

/** Adds an application from "Company, Role" and answers its id. */
export async function createApplication(
  $: Engine,
  dir: string,
  line: string,
  taken: readonly string[],
): Promise<string | undefined> {
  const [company = '', ...rest] = line.split(',')
  const role = rest.join(',').trim()
  const base = slug(`${company} ${role}`)

  if (base === '') {
    return undefined
  }

  let id = base
  for (let n = 2; taken.includes(id); n += 1) {
    id = `${base}-${n}`
  }

  const date = await today($)
  await saveApplication($, dir, {
    id,
    company: company.trim(),
    role,
    url: '',
    stage: 'lead',
    contactName: '',
    contactEmail: '',
    appliedAt: '',
    followUpAt: '',
    notes: '',
    createdAt: date,
    updatedAt: date,
  })

  return id
}

/** Adds pasted notes to `profile/notes.md` under the day's heading. */
export async function appendNotes($: Engine, dir: string, notes: string): Promise<void> {
  const path = `${dir}/profile/notes.md`
  const held = await $.fs.read(path).catch(() => '# Notes\n')

  await $.fs.write(path, `${held.trimEnd()}\n\n## ${await today($)}\n\n${notes.trim()}\n`)
}

/** Reads `owner/name` off a repository URL or the pair itself. */
export function parseRepo(entry: string): { fullName: string; url: string } | undefined {
  const found = /^(?:https?:\/\/[^/\s]+\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/.exec(entry.trim())
  const [, owner, name] = found ?? []

  if (owner === undefined || name === undefined) {
    return undefined
  }

  const fullName = `${owner}/${name}`
  const url = /^https?:/.test(entry.trim())
    ? entry.trim().replace(/(\.git)?\/?$/, '')
    : `https://github.com/${fullName}`

  return { fullName, url }
}
