export type Tab = 'intake' | 'profile' | 'pipeline' | 'drafts' | 'submit'

export type Stage =
  | 'lead'
  | 'drafting'
  | 'ready'
  | 'applied'
  | 'interview'
  | 'offer'
  | 'rejected'
  | 'closed'

/** What the person is looking for: `intake.json`. Every field is free text. */
export type Intake = {
  roles: string
  seniority: string
  workMode: string
  locations: string
  salaryMin: string
  stack: string
  companyStage: string
  dealBreakers: string
  notes: string
}

/** One GitHub repository offered as drafting context: an entry of `repos.json`. */
export type Repo = {
  fullName: string
  url: string
  isPrivate: boolean
  isIncluded: boolean
  summary: string
}

/** One application as `applications/<id>/application.json` holds it. */
export type Application = {
  id: string
  company: string
  role: string
  url: string
  stage: Stage
  contactName: string
  contactEmail: string
  appliedAt: string
  followUpAt: string
  notes: string
  createdAt: string
  updatedAt: string
}

/** An application and which of its documents exist on disk. */
export type ApplicationRow = Application & {
  hasPosting: boolean
  hasResume: boolean
  hasCoverLetter: boolean
  hasEmail: boolean
}

/** The data folder as last read from disk. */
export type Snapshot = {
  dir: string
  today: string
  intake: Intake
  profileFiles: string[]
  hasMaster: boolean
  repos: Repo[]
  applications: ApplicationRow[]
}

/** What the panel is showing. */
export type View = {
  tab: Tab
  selectedId: string
  preview: { title: string; text: string } | null
}

declare module 'claude-code' {
  interface PluginState {
    'job-quest': { snapshot: Shaped<Snapshot>; view: Shaped<View> }
  }
}
