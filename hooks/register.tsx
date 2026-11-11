import { atom, read, update } from 'claude-code'
import type { EngineInterface, PluginOptions, Register } from 'claude-code'

import type { ApplicationRow, Intake, Snapshot, Stage, Tab, View } from '../types'
import * as prompts from './prompts'
import {
  EMPTY_SNAPSHOT,
  STAGES,
  addDays,
  appDir,
  appendNotes,
  createApplication,
  ensureLayout,
  loadSnapshot,
  parseRepo,
  resolveDir,
  saveApplication,
  saveIntake,
  saveRepos,
} from './storage'

const PANE = 'job-quest'
const EMPTY_VIEW: View = { tab: 'pipeline', selectedId: '', preview: null }

// Change a tag when its value's fields change: it declines what an earlier
// version stored, which outlives a reload.
const snapshot = atom({ plugin: 'job-quest', key: 'snapshot' } as const, EMPTY_SNAPSHOT, {
  shape: 'snapshot-1',
})
const view = atom({ plugin: 'job-quest', key: 'view' } as const, EMPTY_VIEW, {
  shape: 'view-1',
})

const TABS: readonly { id: Tab; label: string; hotkey: string }[] = [
  { id: 'intake', label: 'Intake', hotkey: '1' },
  { id: 'profile', label: 'Profile', hotkey: '2' },
  { id: 'pipeline', label: 'Pipeline', hotkey: '3' },
  { id: 'drafts', label: 'Drafts', hotkey: '4' },
  { id: 'submit', label: 'Submit', hotkey: '5' },
]

const STAGE_LABEL: Record<Stage, string> = {
  lead: 'Leads',
  drafting: 'Drafting',
  ready: 'Ready to submit',
  applied: 'Applied',
  interview: 'Interviewing',
  offer: 'Offer',
  rejected: 'Rejected',
  closed: 'Closed',
}

const INTAKE_FIELDS: readonly { key: keyof Intake; label: string; hint: string; rows?: number }[] = [
  { key: 'roles', label: 'Roles', hint: 'Backend engineer, platform engineer' },
  { key: 'seniority', label: 'Level', hint: 'Mid, senior, staff' },
  { key: 'workMode', label: 'Work mode', hint: 'Remote, hybrid or on-site' },
  { key: 'locations', label: 'Locations', hint: 'Cities, regions or time zones' },
  { key: 'salaryMin', label: 'Salary floor', hint: '140k base' },
  { key: 'stack', label: 'Stack', hint: 'Languages and tools you want to work in' },
  { key: 'companyStage', label: 'Company stage', hint: 'Seed, growth, public' },
  { key: 'dealBreakers', label: 'Deal-breakers', hint: 'What rules a job out' },
  { key: 'notes', label: 'Anything else', hint: 'What should steer the search', rows: 3 },
]

type AppField = 'url' | 'notes' | 'followUpAt' | 'contactName' | 'contactEmail'

const APP_FIELDS: readonly AppField[] = ['url', 'notes', 'followUpAt', 'contactName', 'contactEmail']

const mark = (has: boolean): string => (has ? 'saved' : 'missing')

const nameOf = (row: ApplicationRow): string =>
  row.role === '' ? row.company : `${row.company} · ${row.role}`

// Text typed into a field and not yet saved, by the field's key. Kept here
// and not in `$.state`, so a keystroke redraws nothing; a reload drops it.
const typed = new Map<string, string>()

const said = (error: unknown): string =>
  `Job Quest: ${error instanceof Error ? error.message : String(error)}`

/** Reads the data folder again and hands the panel what it holds. */
async function refresh($: EngineInterface, options: PluginOptions): Promise<Snapshot> {
  const dir = await resolveDir($, options)
  const loaded = await loadSnapshot($, dir)
  await update($, snapshot, () => loaded)

  return loaded
}

/** Runs a handler's work; what fails is said in a toast, never thrown. */
function run($: EngineInterface, work: () => Promise<unknown>): void {
  void work().catch((error: unknown) => {
    $.ui.toast(said(error))
  })
}

/** Hands a prompt to Claude as a turn of its own. */
function ask($: EngineInterface, text: string, toast: string): void {
  void $.prompt.submit({ text }).catch((error: unknown) => {
    $.ui.toast(said(error))
  })
  $.ui.toast(toast)
}

export const register: Register = (on, options) => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'job-quest',
      description: 'Open the Job Quest panel: intake, profile, pipeline, drafts, submit',
    })

    try {
      await ensureLayout($, await resolveDir($, options))
      await refresh($, options)
    } catch (error) {
      $.ui.log(said(error))
    }

    void $.ui.open({ id: PANE, title: 'Job Quest' })

    return next(e)
  })

  on('command.run', { command: 'job-quest' }, async $ => {
    await refresh($, options)
    await $.ui.open({ id: PANE, title: 'Job Quest' })

    return { text: 'Job Quest panel opened.' }
  })

  // Claude writes the folder's files during a turn: read them again after it.
  on('turn.complete', async ($, e, next) => {
    await refresh($, options).catch(() => undefined)

    return next(e)
  })

  on('prompt.compose', async ($, e, next) => {
    const composed = await next(e)
    const dir = await resolveDir($, options)

    return {
      sections: [
        ...composed.sections,
        { id: 'job-quest:data', text: prompts.dataSection(dir), scope: 'session' as const },
      ],
    }
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Button, Input, Markdown, Select, Text } = $.ui.resolve(e)
    const data = await read($, snapshot)
    const shown = await read($, view)
    const { dir } = data
    const selected = data.applications.find(row => row.id === shown.selectedId)

    const show = (next: Partial<View>) => (): void =>
      run($, () => update($, view, held => ({ ...held, preview: null, ...next })))

    const saveIntakeNow = async (): Promise<void> => {
      const merged: Intake = { ...data.intake }
      for (const { key } of INTAKE_FIELDS) {
        merged[key] = (typed.get(`intake-${key}`) ?? merged[key]).trim()
        typed.delete(`intake-${key}`)
      }
      await saveIntake($, dir, merged)
      await refresh($, options)
      $.ui.toast('Intake saved')
    }

    const saveApp = async (row: ApplicationRow, changes: Partial<ApplicationRow> = {}): Promise<void> => {
      const merged: ApplicationRow = { ...row, ...changes }
      for (const key of APP_FIELDS) {
        merged[key] = (typed.get(`${row.id}-${key}`) ?? merged[key]).trim()
        typed.delete(`${row.id}-${key}`)
      }
      await saveApplication($, dir, merged)
      await refresh($, options)
    }

    const setStage = (row: ApplicationRow, stage: Stage): Promise<void> => {
      const isNewlyApplied = stage === 'applied' && row.appliedAt === ''

      return saveApp(
        row,
        isNewlyApplied
          ? { stage, appliedAt: data.today, followUpAt: row.followUpAt || addDays(data.today, 7) }
          : { stage },
      )
    }

    const preview = (row: ApplicationRow, file: string, title: string) => (): void =>
      run($, async () => {
        const text = await $.fs.read(`${appDir(dir, row.id)}/${file}`)
        await update($, view, held => ({ ...held, preview: { title, text: text.slice(0, 40_000) } }))
      })

    const appField = (row: ApplicationRow, key: AppField, label: string, hint: string, rows?: number) => (
      <Input
        key={`${row.id}-${key}`}
        label={label}
        placeholder={hint}
        submitLabel="save"
        value={typed.get(`${row.id}-${key}`) ?? row[key]}
        {...(rows === undefined ? {} : { rows })}
        onInput={value => {
          typed.set(`${row.id}-${key}`, value)
        }}
        onSubmit={value => {
          typed.set(`${row.id}-${key}`, value)
          run($, () => saveApp(row).then(() => $.ui.toast('Saved')))
        }}
      />
    )

    const tabs = (
      <Box flexDirection="row" flexWrap="wrap" gap={1}>
        {TABS.map(tab => (
          <Button
            key={`tab-${tab.id}`}
            label={tab.label}
            hotkey={tab.hotkey}
            variant={shown.tab === tab.id ? 'primary' : 'secondary'}
            onPress={show({ tab: tab.id })}
          />
        ))}
        <Button key="refresh" label="Refresh" dimColor onPress={() => run($, () => refresh($, options))} />
      </Box>
    )

    if (dir === '') {
      return (
        <Box flexDirection="column" gap={1}>
          {tabs}
          <Text dimColor>Reading the data folder. Press Refresh if this stays.</Text>
        </Box>
      )
    }

    const needsPick = (
      <Box flexDirection="column" gap={1}>
        <Text dimColor>Pick an application in Pipeline first.</Text>
        <Button key="to-pipeline" label="Go to Pipeline" onPress={show({ tab: 'pipeline' })} />
      </Box>
    )

    const previewBox = shown.preview !== null && (
      <Box flexDirection="column" borderStyle="round" paddingX={1} gap={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text weight="semibold">{shown.preview.title}</Text>
          <Button key="close-preview" label="Close" onPress={show({})} />
        </Box>
        <Markdown text={shown.preview.text} />
      </Box>
    )

    const intakeTab = (): JSX.Element => (
      <Box flexDirection="column" gap={1}>
        <Text weight="semibold">What you are looking for</Text>
        <Text dimColor>Steers which jobs fit and how your documents are written. Enter in any field saves all of them.</Text>
        {INTAKE_FIELDS.map(field => (
          <Input
            key={`intake-${field.key}`}
            label={field.label}
            placeholder={field.hint}
            submitLabel="save"
            value={typed.get(`intake-${field.key}`) ?? data.intake[field.key]}
            {...(field.rows === undefined ? {} : { rows: field.rows })}
            onInput={value => {
              typed.set(`intake-${field.key}`, value)
            }}
            onSubmit={value => {
              typed.set(`intake-${field.key}`, value)
              run($, saveIntakeNow)
            }}
          />
        ))}
        <Box flexDirection="row" gap={1}>
          <Button key="intake-save" label="Save" variant="primary" onPress={() => run($, saveIntakeNow)} />
          <Button
            key="intake-interview"
            label="Interview me in chat"
            onPress={() => ask($, prompts.interview(dir), 'Claude will interview you in the chat')}
          />
        </Box>
      </Box>
    )

    const profileTab = (): JSX.Element => {
      const included = data.repos.filter(repo => repo.isIncluded)
      const waiting = included.filter(repo => repo.summary === '')

      return (
        <Box flexDirection="column" gap={1}>
          <Text weight="semibold">Your documents</Text>
          <Text dimColor>Put resumes, cover letters and notes in {dir}/profile, or attach one in chat and ask Claude to save it.</Text>
          {data.profileFiles.length === 0 && <Text dimColor>No documents yet.</Text>}
          {data.profileFiles.map(name => (
            <Text>• {name}</Text>
          ))}
          <Input
            key="word-dump"
            label="Word dump"
            placeholder="Paste anything about your experience. Enter adds it to notes.md"
            submitLabel="add"
            rows={4}
            value=""
            onSubmit={value =>
              run($, async () => {
                if (value.trim() === '') return
                await appendNotes($, dir, value)
                await refresh($, options)
                $.ui.toast('Added to profile/notes.md')
              })
            }
          />
          <Box flexDirection="row" gap={1} alignItems="center">
            <Button
              key="build-master"
              label={data.hasMaster ? 'Update master profile' : 'Build master profile'}
              variant="primary"
              onPress={() => ask($, prompts.buildMaster(dir), 'Claude is building your master profile')}
            />
            <Text dimColor>{data.hasMaster ? 'master.md exists' : 'No master profile yet'}</Text>
          </Box>

          <Text weight="semibold">
            GitHub projects <Text dimColor>{included.length} of {data.repos.length} included</Text>
          </Text>
          <Text dimColor>Only included projects are described in your documents. Press one to include or leave it out.</Text>
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            <Button
              key="repos-import"
              label="Import from GitHub"
              onPress={() => ask($, prompts.importRepos(dir), 'Claude is listing your repositories')}
            />
            <Button
              key="repos-summarize"
              label={`Summarize included (${waiting.length})`}
              onPress={() =>
                waiting.length === 0
                  ? $.ui.toast('Every included project has a summary')
                  : ask($, prompts.summarizeRepos(dir), 'Claude is reading your included projects')
              }
            />
          </Box>
          <Input
            key="repo-add"
            label="Add a repository"
            placeholder="owner/name or its address"
            submitLabel="add"
            value=""
            onSubmit={value =>
              run($, async () => {
                const parsed = parseRepo(value)
                if (parsed === undefined) {
                  $.ui.toast('Write it as owner/name or paste its address')
                  return
                }
                const others = data.repos.filter(repo => repo.fullName !== parsed.fullName)
                await saveRepos($, dir, [
                  ...others,
                  { ...parsed, isPrivate: false, isIncluded: true, summary: '' },
                ])
                await refresh($, options)
              })
            }
          />
          {data.repos.map(repo => (
            <Button
              key={`repo-${repo.fullName}`}
              plain
              onPress={() =>
                run($, async () => {
                  await saveRepos(
                    $,
                    dir,
                    data.repos.map(one =>
                      one.fullName === repo.fullName ? { ...one, isIncluded: !one.isIncluded } : one,
                    ),
                  )
                  await refresh($, options)
                })
              }
            >
              {repo.isIncluded ? '[x] ' : '[ ] '}
              {repo.fullName}
              <Text dimColor>
                {repo.isPrivate ? ' private' : ''}
                {repo.summary === '' ? '' : ' · summarized'}
              </Text>
            </Button>
          ))}
        </Box>
      )
    }

    const pipelineTab = (): JSX.Element => {
      const due = data.applications.filter(
        row => row.stage === 'applied' && row.followUpAt !== '' && row.followUpAt <= data.today,
      )

      return (
        <Box flexDirection="column" gap={1}>
          <Input
            key="app-new"
            label="New application"
            placeholder="Company, Role"
            submitLabel="add"
            value=""
            onSubmit={value =>
              run($, async () => {
                const id = await createApplication($, dir, value, data.applications.map(row => row.id))
                if (id === undefined) {
                  $.ui.toast('Write it as Company, Role')
                  return
                }
                await refresh($, options)
                await update($, view, held => ({ ...held, selectedId: id, preview: null }))
              })
            }
          />
          {due.length > 0 && (
            <Text color="warning">Follow up due: {due.map(row => row.company).join(', ')}</Text>
          )}
          {data.applications.length === 0 && (
            <Text dimColor>No applications yet. Add one above, or ask Claude in chat to add a posting.</Text>
          )}
          {STAGES.filter(stage => data.applications.some(row => row.stage === stage)).map(stage => (
            <Box flexDirection="column">
              <Text weight="semibold">
                {STAGE_LABEL[stage]}{' '}
                <Text dimColor>{data.applications.filter(row => row.stage === stage).length}</Text>
              </Text>
              {data.applications
                .filter(row => row.stage === stage)
                .map(row => (
                  <Button key={`app-${row.id}`} plain onPress={show({ selectedId: row.id })}>
                    {row.id === shown.selectedId ? '▸ ' : '  '}
                    {nameOf(row)}
                    <Text dimColor>
                      {row.hasResume ? ' · resume' : ''}
                      {row.hasCoverLetter ? ' · letter' : ''}
                      {row.followUpAt === '' ? '' : ` · follow up ${row.followUpAt}`}
                    </Text>
                  </Button>
                ))}
            </Box>
          ))}
          {selected !== undefined && (
            <Box flexDirection="column" borderStyle="round" paddingX={1} gap={1}>
              <Text weight="semibold">{nameOf(selected)}</Text>
              <Select
                key={`${selected.id}-stage`}
                label="Stage"
                value={selected.stage}
                options={STAGES.map(stage => ({ value: stage, label: STAGE_LABEL[stage] }))}
                onSelect={value =>
                  run($, async () => {
                    const stage = STAGES.find(one => one === value)
                    if (stage !== undefined) await setStage(selected, stage)
                  })
                }
              />
              {appField(selected, 'url', 'Posting link', 'https://')}
              {appField(selected, 'followUpAt', 'Follow up on', 'YYYY-MM-DD')}
              {appField(selected, 'notes', 'Notes', 'Referral, salary range, anything to remember', 3)}
              <Box flexDirection="row" gap={1}>
                <Button key="to-drafts" label="Drafts" variant="primary" onPress={show({ tab: 'drafts' })} />
                <Button key="to-submit" label="Submit" onPress={show({ tab: 'submit' })} />
              </Box>
            </Box>
          )}
        </Box>
      )
    }

    const draftsTab = (row: ApplicationRow): JSX.Element => {
      const drafting = (kind: 'resume' | 'cover-letter' | 'both', said: string) => (): void =>
        run($, async () => {
          if (row.stage === 'lead') await saveApp(row, { stage: 'drafting' })
          ask($, prompts.draft(dir, row, kind), said)
        })

      return (
        <Box flexDirection="column" gap={1}>
          <Text weight="semibold">{nameOf(row)}</Text>
          <Text>
            Posting: {mark(row.hasPosting)} · Resume: {mark(row.hasResume)} · Cover letter:{' '}
            {mark(row.hasCoverLetter)}
          </Text>
          <Input
            key={`${row.id}-posting`}
            label="Posting"
            placeholder="Paste the job posting, or its link. Enter saves it"
            submitLabel="save"
            rows={4}
            value=""
            onSubmit={value =>
              run($, async () => {
                const pasted = value.trim()
                if (pasted === '') return
                if (/^https?:\/\/\S+$/.test(pasted)) {
                  await saveApp(row, { url: pasted })
                  $.ui.toast('Link saved. Claude fetches the posting when drafting')
                  return
                }
                await $.fs.write(`${appDir(dir, row.id)}/posting.md`, pasted + '\n')
                await refresh($, options)
                $.ui.toast('Posting saved')
              })
            }
          />
          {!data.hasMaster && (
            <Text color="warning">No master profile yet. Build one in Profile for better drafts.</Text>
          )}
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            <Button
              key="draft-both"
              label="Draft both"
              variant="primary"
              onPress={drafting('both', 'Claude is drafting your resume and cover letter')}
            />
            <Button key="draft-resume" label="Resume only" onPress={drafting('resume', 'Claude is drafting your resume')} />
            <Button
              key="draft-letter"
              label="Cover letter only"
              onPress={drafting('cover-letter', 'Claude is drafting your cover letter')}
            />
          </Box>
          <Box flexDirection="row" flexWrap="wrap" gap={1}>
            {row.hasPosting && <Button key="view-posting" label="View posting" onPress={preview(row, 'posting.md', 'Posting')} />}
            {row.hasResume && <Button key="view-resume" label="View resume" onPress={preview(row, 'resume.md', 'Resume')} />}
            {row.hasCoverLetter && (
              <Button key="view-letter" label="View cover letter" onPress={preview(row, 'cover-letter.md', 'Cover letter')} />
            )}
          </Box>
          {previewBox}
          <Text dimColor>To change a draft, tell Claude in chat what to revise. Files are in {appDir(dir, row.id)}</Text>
        </Box>
      )
    }

    const submitTab = (row: ApplicationRow): JSX.Element => (
      <Box flexDirection="column" gap={1}>
        <Text weight="semibold">{nameOf(row)}</Text>
        <Text>
          Resume: {mark(row.hasResume)} · Cover letter: {mark(row.hasCoverLetter)} · Email: {mark(row.hasEmail)}
        </Text>
        {appField(row, 'contactName', 'Contact name', 'Who reads the application')}
        {appField(row, 'contactEmail', 'Contact email', 'jobs@company.com')}
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          <Button
            key="email-draft"
            label="Draft email in Gmail"
            variant="primary"
            onPress={() =>
              run($, async () => {
                if (!row.hasResume) {
                  $.ui.toast('Draft a resume first, in Drafts')
                  return
                }
                const saved: ApplicationRow = {
                  ...row,
                  contactName: (typed.get(`${row.id}-contactName`) ?? row.contactName).trim(),
                  contactEmail: (typed.get(`${row.id}-contactEmail`) ?? row.contactEmail).trim(),
                }
                await saveApp(row)
                ask($, prompts.emailDraft(dir, saved), 'Claude is preparing a Gmail draft. Nothing is sent')
              })
            }
          />
          <Button
            key="export"
            label="Export PDFs"
            onPress={() =>
              row.hasResume
                ? ask($, prompts.exportFiles(dir, row), 'Claude is exporting your documents')
                : $.ui.toast('Draft a resume first, in Drafts')
            }
          />
          {row.hasEmail && <Button key="view-email" label="View email" onPress={preview(row, 'email.md', 'Email')} />}
        </Box>
        {previewBox}
        {row.appliedAt === '' ? (
          <Button
            key="mark-applied"
            label="Mark as applied"
            onPress={() => run($, () => setStage(row, 'applied').then(() => $.ui.toast('Marked as applied. Follow-up set for a week out')))}
          />
        ) : (
          <Text color="success">
            Applied {row.appliedAt}
            {row.followUpAt === '' ? '' : ` · follow up ${row.followUpAt}`}
          </Text>
        )}
        <Text dimColor>Emails are created as Gmail drafts for you to review and send yourself.</Text>
      </Box>
    )

    const body = (): JSX.Element => {
      if (shown.tab === 'intake') return intakeTab()
      if (shown.tab === 'profile') return profileTab()
      if (shown.tab === 'pipeline') return pipelineTab()
      if (selected === undefined) return needsPick

      return shown.tab === 'drafts' ? draftsTab(selected) : submitTab(selected)
    }

    return (
      <Box flexDirection="column" gap={1}>
        {tabs}
        {body()}
      </Box>
    )
  })
}
