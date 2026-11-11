// Job Quest: a job-search workspace. One mod drawn as several parts, chosen by props.part:
//
//   bar      the top bar of the Job Quest layout: views, agent, refresh
//   board    applications as columns by stage
//   detail   the selected application: stage, fields, documents, actions
//   profile  source documents, word dump, master profile, GitHub projects
//   intake   what the person is looking for, the data folder, the agent
//   (none)   all of it in one tabbed panel, for use outside the layout
//
// layouts/job-quest.json places the parts. The parts are separate copies, so what they share
// goes through shared(): the selected application, and a revision that makes the others reload.
// This file holds the state and the actions; views.js draws.
import { View } from "gpui-kit";
import { InputState, TextareaState, EditorState } from "gpui-base";
import {
  run, exec, notify, knownAgents, agents, pickFolder, shared, setShared, watchFolder, window,
  layout, settings, props, nextCommand,
} from "herdr";
import {
  INTAKE_FIELDS, DOCS, parse, newApplication, withStage, parseRepo, mergeRepos, toggleRepo,
  addRepo, isLink, mailto, findNode,
} from "./model.js";
import {
  DIR_KEY, dataDir, ensureLayout, loadSnapshot, saveIntake, saveRepos, saveApplication,
  savePosting, saveDocument, readDocument, addNotes,
} from "./store.js";
import * as prompts from "./prompts.js";
import { draw } from "./views.js";

export const SELECTED_KEY = "job-quest.selected";
export const AGENT_KEY = "job-quest.agent";
const REVISION_KEY = "job-quest.revision";
export const PARTS = ["bar", "board", "detail", "profile", "intake", "panel"];
// The layout's node ids this mod drives.
export const VIEW_STACK = "jq-view";
export const AGENT_BLOCK = "jq-agent";
// The application fields the panel edits.
export const APP_FIELDS = ["url", "followUpAt", "notes", "contactName", "contactEmail"];

const remembered = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const remember = (key, value) => { try { localStorage.setItem(key, value); } catch { /* not kept */ } };
const message = (e) => String(e?.message ?? e);

// Opens a folder or an address with the system's own handler.
export function open(target) {
  const platform = window()?.platform;
  const [command, args] = platform === "macos" ? ["open", [target]]
    : platform === "windows" ? ["cmd", ["/c", "start", "", target]] : ["xdg-open", [target]];
  return exec(command, args);
}

export default class JobQuest extends View {
  init(_props, cx) {
    const part = props()?.part;
    this.part = PARTS.includes(part) ? part : "panel";
    this.tab = remembered("tab") ?? "pipeline";       // the standalone panel's tab
    this.docTab = remembered("doc") ?? "posting";     // the detail's document
    this.snap = null; this.error = null; this.busy = null; this.width = 0;
    this.doc = null;      // { id, file, text }: the shown document as last read (text null: no file)
    this.edit = null;     // { id, file, original, state }: a document being edited
    this.known = [];      // installed agents
    this.awaiting = null; // { before, tries }: an agent was started and is not on screen yet
    this.fields = new Map(); this.fieldsFor = undefined; this.watching = 0;
    this.revision = shared(REVISION_KEY);
    this.newApp = InputState.new({ placeholder: "Company, Role, then Enter" });
    this.newApp.on("submit", (_e, cx) => this.addApplication(cx));
    this.repoInput = InputState.new({ placeholder: "owner/name or its address, then Enter" });
    this.repoInput.on("submit", (_e, cx) => this.addRepository(cx));
    this.dump = TextareaState.new({ placeholder: "Paste anything about your experience: roles, projects, numbers", rows: 5 });
    this.posting = TextareaState.new({ placeholder: "Paste the job posting, or just its link", rows: 6 });
    this.start(cx);
    cx.spawn(async (cx) => {
      try { this.known = (await knownAgents()).filter((agent) => agent.installed); } catch { this.known = []; }
      cx.notify();
    });
    cx.timer.every(1000, (cx) => this.followAgent(cx));
    this.listen(cx);
  }

  // Reads the data folder and follows its changes. Called again when the folder is changed.
  start(cx) {
    const generation = (this.watching += 1);
    this.dir = dataDir();
    cx.spawn(async (cx) => {
      try { await ensureLayout(this.dir); } catch (e) { this.error = `Can't write ${this.dir}: ${message(e)}`; }
      await this.reload(cx);
      try {
        while (generation === this.watching) {
          await watchFolder(this.dir);
          if (generation === this.watching) await this.reload(cx);
        }
      } catch { /* the folder can't be watched: Refresh and the revision still work */ }
    });
  }

  // Key commands and test commands: `herdr-app do job-quest.<command>` reaches the shown copies.
  listen(cx) {
    cx.spawn(async (cx) => {
      for (;;) {
        const command = await nextCommand();
        if (command === "refresh") await this.reload(cx);
        else if (command.startsWith("open-")) this.select(command.slice(5), cx);
        else if (command.startsWith("tab-")) this.show(command.slice(4), cx);
        else if (command.startsWith("doc-")) this.showDoc(command.slice(4), cx);
        cx.notify();
      }
    });
  }

  async reload(cx) {
    try {
      this.snap = await loadSnapshot(this.dir);
      this.syncFields();
      await this.loadDoc();
    } catch (e) { this.error = `Can't read ${this.dir}: ${message(e)}`; }
    cx.notify();
  }

  // Called by render: another copy saved something, or chose another application.
  follow(cx) {
    const revision = shared(REVISION_KEY), selected = this.selected();
    if (revision === this.revision && selected === this.fieldsFor) return;
    const reload = revision !== this.revision;
    this.revision = revision; this.fieldsFor = selected;
    cx.spawn(async (cx) => {
      if (reload) await this.reload(cx);
      else { if (this.snap) this.syncFields(); await this.loadDoc(); cx.notify(); }
    });
  }

  selected() {
    const id = shared(SELECTED_KEY);
    return typeof id === "string" ? id : null;
  }

  application() {
    const id = this.selected();
    return this.snap?.applications.find((a) => a.id === id) ?? null;
  }

  // One text field per editable value, made once and kept. When the file changes underneath,
  // a field the person has not touched follows it; one they are typing in is left alone.
  syncFields() {
    const app = this.application();
    this.fieldsFor = this.selected();
    const wanted = [
      ...INTAKE_FIELDS.map((f) => [`intake:${f.key}`, this.snap.intake[f.key], f.hint]),
      ...(app ? APP_FIELDS.map((key) => [`app:${app.id}:${key}`, app[key], ""]) : []),
    ];
    for (const [key, value, placeholder] of wanted) {
      const field = this.fields.get(key);
      if (!field) {
        const state = InputState.new({ value, placeholder });
        state.on("submit", (_e, cx) => this.saveFields(cx));
        this.fields.set(key, { state, stored: value });
      } else if (field.stored !== value) {
        if (field.state.value() === field.stored) field.state.set_value(value);
        field.stored = value;
      }
    }
  }

  field(key) { return this.fields.get(key)?.state ?? null; }

  typed(key) {
    const state = this.field(key);
    return state ? state.value().trim() : null;
  }

  // The shown document's text, read again after every load so an agent's edit shows.
  async loadDoc() {
    const app = this.application(), doc = DOCS.find((d) => d.id === this.docTab) ?? DOCS[0];
    if (!app) { this.doc = null; return; }
    this.doc = { id: app.id, file: doc.file, text: await readDocument(this.dir, app.id, doc.file) };
  }

  // Edits run one at a time; then this copy reloads and the other copies are told to.
  mutate(cx, work) {
    const done = (this.queue ?? Promise.resolve()).then(async () => {
      try { await work(); this.error = null; } catch (e) { this.error = `Not saved: ${message(e)}`; }
    });
    this.queue = done;
    cx.spawn(async (cx) => {
      await done;
      this.revision = Date.now();
      setShared(REVISION_KEY, this.revision);
      await this.reload(cx);
    });
  }

  // Saves every text field at once, so Enter in one never drops what was typed in another.
  saveFields(cx) {
    if (!this.snap) return;
    const intake = Object.fromEntries(INTAKE_FIELDS.map((f) => [f.key, this.typed(`intake:${f.key}`) ?? this.snap.intake[f.key]]));
    const app = this.application();
    const edited = app && { ...app, ...Object.fromEntries(APP_FIELDS.map((key) => [key, this.typed(`app:${app.id}:${key}`) ?? app[key]])) };
    this.mutate(cx, async () => {
      if (INTAKE_FIELDS.some((f) => intake[f.key] !== this.snap.intake[f.key])) await saveIntake(this.dir, intake);
      if (edited && APP_FIELDS.some((key) => edited[key] !== app[key])) await saveApplication(this.dir, edited);
    });
  }

  // ---- what is shown

  // In the layout: which child of the view stack shows. In the panel: its own tab.
  view() {
    return this.part === "panel" ? this.tab : findNode(layout(), VIEW_STACK)?.active ?? null;
  }

  show(tab, cx) {
    if (this.part === "panel") { this.tab = tab; remember("tab", tab); cx.notify(); return; }
    run("layout.select", { stack: VIEW_STACK, child: `jq-${tab}` });
  }

  select(id, cx) {
    this.edit = null;
    setShared(SELECTED_KEY, id);
    if (this.part === "panel") { this.tab = "application"; remember("tab", "application"); }
    cx.spawn(async (cx) => { if (this.snap) this.syncFields(); await this.loadDoc(); cx.notify(); });
  }

  showDoc(id, cx) {
    if (!DOCS.some((d) => d.id === id)) return;
    this.docTab = id; this.edit = null; remember("doc", id);
    cx.spawn(async (cx) => { await this.loadDoc(); cx.notify(); });
  }

  // ---- applications

  addApplication(cx) {
    if (!this.snap) return;
    const created = newApplication(this.newApp.value(), this.snap.applications.map((a) => a.id), this.snap.today);
    if (!created) { this.error = "Write it as Company, Role"; cx.notify(); return; }
    this.newApp.set_value("");
    setShared(SELECTED_KEY, created.id);
    this.mutate(cx, () => saveApplication(this.dir, created));
  }

  setStage(app, stage, cx) {
    this.mutate(cx, () => saveApplication(this.dir, withStage(app, stage, this.snap.today)));
  }

  savePostingText(app, cx) {
    const pasted = this.posting.value().trim();
    if (!pasted) return;
    this.posting.set_value("");
    this.mutate(cx, () => (isLink(pasted) ? saveApplication(this.dir, { ...app, url: pasted }) : savePosting(this.dir, app.id, pasted)));
  }

  // ---- documents

  startEdit(cx) {
    const doc = this.doc;
    if (!doc || doc.text === null) return;
    const state = EditorState.new({
      language: "markdown", value: doc.text, soft_wrap: true, line_numbers: false, folding: false,
      font_family: settings()?.font_family, font_size: 13,
    });
    this.edit = { id: doc.id, file: doc.file, original: doc.text, state };
    cx.notify();
  }

  // Saved only if the file is still what was opened; an agent's newer text is never overwritten.
  saveEdit(cx) {
    const edit = this.edit;
    if (!edit) return;
    cx.spawn(async (cx) => {
      try {
        await saveDocument(this.dir, edit.id, edit.file, edit.state.value(), edit.original);
        this.edit = null; this.error = null;
        this.revision = Date.now(); setShared(REVISION_KEY, this.revision);
      } catch { this.error = `${edit.file} changed on disk while you were editing. Copy your text, cancel, and edit the new version.`; }
      await this.reload(cx);
    });
  }

  cancelEdit(cx) { this.edit = null; cx.notify(); }

  openEmail(app, cx) {
    cx.spawn(async (cx) => {
      try {
        const email = await readDocument(this.dir, app.id, "email.md");
        if (email === null) throw new Error("no email.md yet");
        await open(mailto(email, app.contactEmail));
      } catch (e) { this.error = `Can't open the mail app: ${message(e)}`; cx.notify(); }
    });
  }

  // ---- profile

  saveDump(cx) {
    const notes = this.dump.value().trim();
    if (!notes) return;
    this.dump.set_value("");
    this.mutate(cx, () => addNotes(this.dir, notes));
  }

  addRepository(cx) {
    const parsed = parseRepo(this.repoInput.value());
    if (!parsed) { this.error = "Write it as owner/name, or paste its address"; cx.notify(); return; }
    this.repoInput.set_value("");
    this.mutate(cx, () => saveRepos(this.dir, addRepo(this.snap.repos, parsed)));
  }

  toggleRepository(fullName, cx) {
    this.mutate(cx, () => saveRepos(this.dir, toggleRepo(this.snap.repos, fullName)));
  }

  // The person's own repositories from the GitHub CLI: no forks, nothing archived. New ones
  // start left out, so nothing is described in a document until they choose it.
  importRepos(cx) {
    this.busy = "Asking GitHub…"; cx.notify();
    this.mutate(cx, async () => {
      try {
        const r = await exec("gh", ["repo", "list", "--limit", "300", "--source", "--no-archived", "--json", "nameWithOwner,url,isPrivate"]);
        if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().split("\n")[0] || "gh failed");
        await saveRepos(this.dir, mergeRepos(this.snap.repos, parse(r.stdout)));
      } catch (e) {
        throw new Error(`GitHub import needs the gh CLI, signed in (gh auth login): ${message(e)}`);
      } finally { this.busy = null; }
    });
  }

  chooseFolder(cx) {
    cx.spawn(async (cx) => {
      const picked = await pickFolder({ prompt: "Use this folder" });
      if (!picked) return;
      setShared(DIR_KEY, picked);
      this.fields = new Map(); this.snap = null;
      this.start(cx);
    });
  }

  openFolder(path, cx) {
    open(path).catch((e) => { this.error = message(e); cx.notify(); });
  }

  // ---- agents

  agent() {
    const chosen = shared(AGENT_KEY);
    return this.known.find((a) => a.key === chosen) ?? this.known.find((a) => a.key === "claude") ?? this.known[0] ?? null;
  }

  chooseAgent(key) { setShared(AGENT_KEY, key); }

  // Starts the chosen agent in a new tab, in the data folder, with the task as its first message.
  // In the Job Quest layout its terminal is then shown beside the board (followAgent).
  ask(name, task) {
    const agent = this.agent();
    if (!agent) { notify({ title: "No coding agent found", body: "Install one (Claude Code, Codex, ...) so Job Quest can hand it work.", level: "error" }); return; }
    this.awaiting = { before: agents().map((a) => a.address), tries: 0 };
    run("tab.new", { name, folder: this.dir, argv: agent.run, task });
  }

  // run() returns nothing, so the new agent is found by comparing agents() with before.
  followAgent(cx) {
    const waiting = this.awaiting;
    if (!waiting) return;
    const started = agents().find((a) => !waiting.before.includes(a.address));
    if (started && findNode(layout(), AGENT_BLOCK)) {
      run("agent.focus", { terminal: started.address });
      run("layout.show", { id: AGENT_BLOCK });
    }
    if (started || (waiting.tries += 1) > 30) { this.awaiting = null; cx.notify(); }
  }

  interview() { this.ask("Job Quest: intake", prompts.interview(this.dir)); }
  buildMaster() { this.ask("Job Quest: master profile", prompts.buildMaster(this.dir)); }
  summarizeRepos() { this.ask("Job Quest: projects", prompts.summarizeRepos(this.dir)); }

  draft(app, kind, cx) {
    if (app.stage === "lead") this.setStage(app, "drafting", cx);
    this.ask(`Draft: ${app.company}`, prompts.draft(this.dir, app, kind));
  }

  // Writing the email and exporting both start from the resume.
  needsResume(app, cx) {
    if (app.hasResume) return false;
    this.error = "Draft a resume first"; cx.notify();
    return true;
  }

  writeEmail(app, cx) {
    if (this.needsResume(app, cx)) return;
    const contact = Object.fromEntries(["contactName", "contactEmail"].map((key) => [key, this.typed(`app:${app.id}:${key}`) ?? app[key]]));
    this.saveFields(cx);
    this.ask(`Email: ${app.company}`, prompts.emailDraft(this.dir, { ...app, ...contact }));
  }

  exportFiles(app, cx) {
    if (this.needsResume(app, cx)) return;
    this.ask(`Export: ${app.company}`, prompts.exportFiles(this.dir, app));
  }

  dismissError(cx) { this.error = null; cx.notify(); }

  setWidth(size, cx) {
    const width = Math.round(size.width / (settings()?.zoom || 1));
    if (width !== this.width) { this.width = width; cx.notify(); }
  }

  render(cx) {
    this.follow(cx);
    return draw(this);
  }
}
