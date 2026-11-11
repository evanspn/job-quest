import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const HOME = '/home/tester'
const DIR = `${HOME}/job-quest-data`

const PANE = {
  plugin: 'job-quest',
  component: 'Pane',
  requestId: 'job-quest',
  props: {
    title: 'Job Quest',
    isFocused: false,
    bodyColumns: 60,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
} as const

/** Stands for the engine beneath the mod: a file system in memory. */
function world(on: On): { files: Map<string, string>; prompts: string[]; toasts: string[] } {
  const files = new Map<string, string>()
  const prompts: string[] = []
  const toasts: string[] = []

  mock.env(on, { HOME })
  mock.clock(on, { now: Date.UTC(2026, 10, 11) })
  on('command.register', () => ({ value: { command: 'job-quest' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_, e) => {
    toasts.push(e.text)

    return { value: undefined }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('fs.exists', (_, e) => ({ value: files.has(e.path) }))
  on('fs.write', (_, e) => {
    files.set(e.path, e.text)

    return { value: undefined }
  })
  on('fs.read', (_, e) => {
    const text = files.get(e.path)

    return text === undefined ? { deny: 'ENOENT' } : { value: text }
  })
  on('fs.list', (_, e) => {
    const kinds = new Map<string, 'file' | 'dir'>()
    for (const path of files.keys()) {
      if (!path.startsWith(`${e.path}/`)) continue
      const [name = '', ...rest] = path.slice(e.path.length + 1).split('/')
      kinds.set(name, rest.length === 0 ? 'file' : 'dir')
    }

    return {
      value: [...kinds].map(([name, kind]) => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })),
    }
  })
  on('prompt.submit', (_, e) => {
    prompts.push(e.text)

    return { text: e.text }
  })

  return { files, prompts, toasts }
}

test('an application goes from a new row to a drafting prompt', async ($, on) => {
  const { files, prompts, toasts } = world(on)

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(files.has(`${DIR}/guides/resume-guide.md`)).toBe(true)

  for (const surface of ['terminal', 'desktop'] as const) {
    // One application per surface: the panel keeps what the last one added.
    const id = `acme-${surface}-backend-engineer`
    const APP = `${DIR}/applications/${id}`
    prompts.length = 0

    const ui = await $.ui.mount({ ...PANE, surface })

    await ui.press({ key: 'tab-pipeline' })
    await ui.input({ key: 'app-new', text: `Acme ${surface}, Backend Engineer` })
    expect(toasts.filter(toast => toast.startsWith('Job Quest:'))).toEqual([])
    const stored = JSON.parse(files.get(`${APP}/application.json`) ?? '{}')
    expect(stored.company).toBe(`Acme ${surface}`)
    expect(stored.role).toBe('Backend Engineer')
    expect(stored.stage).toBe('lead')
    expect(await ui.find({ key: `app-${id}` })).toBeDefined()

    await ui.press({ key: 'tab-drafts' })
    await ui.input({ key: `${id}-posting`, text: 'We need a Go engineer.' })
    expect(files.get(`${APP}/posting.md`)).toBe('We need a Go engineer.\n')

    await ui.press({ key: 'draft-both' })
    expect(prompts).toHaveLength(1)
    expect(prompts[0]).toContain(`${APP}/resume.md`)
    expect(prompts[0]).toContain(`${DIR}/guides/resume-guide.md`)
    expect(JSON.parse(files.get(`${APP}/application.json`) ?? '{}').stage).toBe('drafting')

    await ui.press({ key: 'tab-submit' })
    await ui.press({ key: 'mark-applied' })
    const applied = JSON.parse(files.get(`${APP}/application.json`) ?? '{}')
    expect(applied.stage).toBe('applied')
    expect(applied.appliedAt).toBe('2026-11-11')
    expect(applied.followUpAt).toBe('2026-11-18')

    await ui.unmount()
  }
})

test('intake fields save together, and a repository toggles', async ($, on) => {
  const { files } = world(on)
  files.set(
    `${DIR}/repos.json`,
    JSON.stringify([{ fullName: 'me/tool', url: 'https://github.com/me/tool', isPrivate: true, isIncluded: false, summary: '' }]),
  )

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop' })

  await ui.press({ key: 'tab-intake' })
  await ui.input({ key: 'intake-roles', text: 'Platform engineer', kind: 'change' })
  await ui.input({ key: 'intake-salaryMin', text: '150k' })
  const intake = JSON.parse(files.get(`${DIR}/intake.json`) ?? '{}')
  expect(intake.roles).toBe('Platform engineer')
  expect(intake.salaryMin).toBe('150k')

  await ui.press({ key: 'tab-profile' })
  await ui.press({ key: 'repo-me/tool' })
  expect(JSON.parse(files.get(`${DIR}/repos.json`) ?? '[]')[0].isIncluded).toBe(true)
  await ui.input({ key: 'repo-add', text: 'https://github.com/someone/thing' })
  expect(JSON.parse(files.get(`${DIR}/repos.json`) ?? '[]')).toHaveLength(2)

  await ui.unmount()
})
