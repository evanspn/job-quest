// Job Quest: a job-search workspace. One mod drawn as several parts, chosen by props.part:
//
//   bar      the top bar of the Job Quest layout: views, agent, refresh
//   board    applications as columns by stage
//   detail   the selected application: stage, fields, documents, actions
//   profile  source documents, word dump, master profile, GitHub projects
//   intake   what the person is looking for, the data folder, the agent
//   party    the party: who is doing what, what waits for approval, the adventure log
//   rail     a narrow strip of the party's agents: click one to show it in the agent block
//   tabs     the Terminals view's strip: a tab per terminal Job Quest started, one shown below
//   chat     the party chat: what the workers post, your replies, the party's events
//   beacon   a strip for your everyday layout: the party at a glance; it runs the party there
//   (none)   all of it in one tabbed panel, for use outside the layout
//
// The party (party.js) is run by one copy, the rail in the layout or the panel outside it.
//
// layouts/job-quest.json places the parts. The parts are separate copies, so what they share
// goes through shared(): the selected application, and a revision that makes the others reload.
// This file holds the state and the actions; views.js draws.
import { View } from "gpui-kit";
import { InputState, TextareaState, EditorState, ScrollHandle } from "gpui-base";
import {
  run, exec, notify, knownAgents, agents, terminals, pickFolder, shared, setShared, watchFolder, window,
  layout, settings, props, nextCommand,
} from "herdr";
import {
  INTAKE_FIELDS, DOCS, parse, newApplication, withStage, parseRepo, mergeRepos, toggleRepo,
  addRepo, isLink, mailto, findNode, nextStep, minFit, jobKey, nameOf, isLive, feed, MEMBERS,
  mentionsIn, typingMention, handlesFor,
} from "./model.js";
import * as party from "./party.js";
import {
  DIR_KEY, dataDir, ensureLayout, loadSnapshot, saveIntake, saveRepos, saveApplication,
  savePosting, saveDocument, readDocument, addNotes, folderFiles, appDir, saveMessage,
} from "./store.js";
import { composeArgs } from "./mail.js";
import * as prompts from "./prompts.js";
import { draw } from "./views.js";

export const SELECTED_KEY = "job-quest.selected";
export const AGENT_KEY = "job-quest.agent";
const REVISION_KEY = "job-quest.revision";
// When a copy started an agent it is still waiting for (0: none), so the bar can say so.
const STARTING_KEY = "job-quest.starting";
export const PARTS = ["bar", "board", "detail", "profile", "intake", "party", "rail", "tabs", "chat", "beacon", "panel"];
// The parts that may run the party; a lease picks one. The beacon goes in your everyday layout,
// so the party runs (and tidies up) while Job Quest is not on screen.
const LEADERS = ["rail", "panel", "beacon"];
// The layout the beacon lives in: where "Back" in Job Quest's bar returns to.
export const HOME_KEY = "job-quest.home";
const PARTY_EVERY = 3000;
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
    this.chatInput = InputState.new({ placeholder: "Message the party, then Enter" });
    this.chatInput.on("submit", (_e, cx) => this.sendChat(cx));
    this.chatInput.on("change", (_e, cx) => cx.notify());
    this.chatScroll = ScrollHandle.new();
    this.chatShown = 0;   // how many chat items were drawn, to scroll to a new one
    this.token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    this.warned = new Set(); // applications the party has said it is stuck on
    this.start(cx);
    if (LEADERS.includes(this.part)) cx.timer.every(PARTY_EVERY, (cx) => this.partyRound(cx));
    if (this.part === "beacon" && typeof shared("layout") === "string") setShared(HOME_KEY, shared("layout"));
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
        // Swapping between the party's agents: one copy acts, or each would move it on.
        else if (["party-next", "party-prev"].includes(command) && LEADERS.includes(this.part)) party.cycle(command === "party-next" ? 1 : -1);
        else if (command === "autopilot" && LEADERS.includes(this.part)) this.toggleAutopilot();
        else if (command === "scout" && LEADERS.includes(this.part)) this.sendScout();
        // The application view's agent buttons, for keys.json or a script. Every shown copy gets
        // the command; only the one that draws the application acts, so one agent starts.
        else if (["draft-both", "draft-resume", "draft-letter", "write-email"].includes(command) && ["detail", "panel"].includes(this.part)) {
          const app = this.application();
          if (!app) { this.error = "Pick an application first."; }
          else if (command === "write-email") this.writeEmail(app, cx);
          else this.draft(app, { "draft-both": "both", "draft-resume": "resume", "draft-letter": "cover-letter" }[command], cx);
        }
        cx.notify();
      }
    });
  }

  async reload(cx) {
    try {
      this.snap = await loadSnapshot(this.dir);
      this.syncFields();
      const items = this.chatItems().length;
      if (items !== this.chatShown) { this.chatShown = items; if (items) this.chatScroll.scroll_to_item(items - 1); }
      await this.loadDoc();
    } catch (e) { this.error = `Can't read ${this.dir}: ${message(e)}`; }
    cx.notify();
  }

  // After the party wrote to the folder: the others reload too.
  async saved(cx) {
    this.revision = Date.now();
    setShared(REVISION_KEY, this.revision);
    await this.reload(cx);
  }

  // One round of the party, when this copy holds the lease.
  partyRound(cx) {
    if (this.inRound || !this.snap || !party.lead(this.token)) return;
    this.inRound = true;
    cx.spawn(async (cx) => {
      try { if (await party.round(this)) await this.saved(cx); }
      catch (e) { this.error = `The party tripped: ${message(e)}`; cx.notify(); }
      finally { this.inRound = false; }
    });
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
    // Terminals shows the agent itself, full size: the agent pane beside it would draw the same
    // terminal at a second size.
    if (tab === "terminals") run("layout.hide", { id: AGENT_BLOCK });
    run("layout.select", { stack: VIEW_STACK, child: `jq-${tab}` });
    // Open on one of Job Quest's own agents, not whatever agent was focused elsewhere.
    if (tab === "terminals") {
      const mine = party.folderTerminals(this.dir).filter((e) => e.agent);
      if (mine.length && !mine.some((e) => e.address === party.shownAddress())) party.focusAddress(mine.at(-1).address);
    }
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

  // On a Mac: a new message in Mail, addressed, with the subject, body and attachments, waiting
  // for Send. Elsewhere: a mailto: draft, without attachments (mailto cannot carry them).
  openEmail(app, cx) {
    cx.spawn(async (cx) => {
      try {
        const email = await readDocument(this.dir, app.id, "email.md");
        if (email === null) throw new Error("no email.md yet");
        if (window()?.platform === "macos") {
          const args = composeArgs(email, appDir(this.dir, app.id), await folderFiles(this.dir, app.id), app.contactEmail);
          const r = await exec("osascript", args);
          if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().split("\n").pop() || "Mail refused");
        } else {
          await open(mailto(email, app.contactEmail));
          if (app.attachments.length) notify({ title: "Attach these yourself", body: app.attachments.join(", "), level: "info" });
        }
      } catch (e) { this.error = `Can't open the email: ${message(e)}`; cx.notify(); }
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

  // Starts a party member on a job the person asked for, in a new tab in the Job Quest space, in
  // the data folder, with the task as its first message. In the Job Quest layout its terminal is
  // then shown beside the board (followAgent), and the rail lists it.
  // `extra`: more of the job's fields (a Scout's report, a step's round).
  ask(member, kind, app, task, extra = {}) {
    const job = party.newJob({ key: jobKey(member, kind, app?.id, Date.now()), member, kind, appId: app?.id ?? null, title: app ? nameOf(app) : "", ...extra });
    this.awaiting = { before: terminals().map((t) => t.address), tries: 0, revealed: false };
    if (!party.launch(this, job, task)) { this.awaiting = null; return; }
    setShared(STARTING_KEY, Date.now());
  }

  // run() returns nothing, so the new terminal is found by comparing terminals() with before.
  // A program counts as an agent (agents()) only once it reports a status; before that it may be
  // showing a first-run question (Claude Code asks whether to trust the folder). After three
  // seconds it is peeked over the window so the person can answer; once it is an agent it is
  // shown: in the Terminals view if that is open, else in the agent pane.
  followAgent(cx) {
    const waiting = this.awaiting;
    if (!waiting) return;
    const started = terminals().find((t) => !waiting.before.includes(t.address) && t.state === "live");
    const agent = started && agents().find((a) => a.address === started.address);
    const inLayout = Boolean(findNode(layout(), AGENT_BLOCK));
    if (agent) {
      if (inLayout) party.focusAddress(agent.address);
      this.stopWaiting(cx); return;
    }
    waiting.tries += 1;
    if (started && inLayout && !waiting.revealed && waiting.tries >= 3) {
      waiting.revealed = true;
      run("terminal.peek", { terminal: started.address });
    }
    // Give a person time to answer a first-run question; give up on a program that never starts.
    if (waiting.tries > (started ? 300 : 30)) this.stopWaiting(cx);
  }

  stopWaiting(cx) { this.awaiting = null; setShared(STARTING_KEY, 0); cx.notify(); }
  // A time, not a flag, so a wait cut short by quitting does not say "Starting agent…" forever.
  starting() {
    const since = shared(STARTING_KEY);
    return Boolean(this.awaiting) || (typeof since === "number" && since > 0 && Date.now() - since < 310000);
  }

  interview() { this.ask("archivist", "interview", null, prompts.interview(this.dir)); }
  buildMaster() { this.ask("archivist", "master", null, prompts.buildMaster(this.dir)); }
  summarizeRepos() { this.ask("archivist", "repos", null, prompts.summarizeRepos(this.dir)); }

  draft(app, kind, cx) {
    if (app.stage === "lead") this.setStage(app, "drafting", cx);
    const job = { both: "draft", resume: "draft-resume", "cover-letter": "draft-letter" }[kind];
    this.ask("scribe", job, app, prompts.draft(this.dir, app, kind));
  }

  // ---- the party

  toggleAutopilot() { party.setAutopilot(!party.autopilot()); }

  // Job Quest's way back to where the beacon lives (else Herdr's main layout), and the way in.
  goHome() {
    const home = shared(HOME_KEY);
    run("layout.switch", { name: typeof home === "string" && home !== "job-quest" ? home : "main" });
  }
  openQuest() { run("layout.switch", { name: "job-quest" }); }

  // Hands a lead to the party: drafting is the party's stage.
  sendParty(app, cx) { this.setStage(app, "drafting", cx); }

  // A search now, whether or not today's has run.
  sendScout() {
    const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
    const report = `scout-${this.snap?.today ?? "today"}-${stamp.slice(8)}.md`;
    this.ask("scout", "scout", null, prompts.scout(this.dir, report, this.snap?.today ?? ""), { report });
  }

  // The application's next step, started now: after a member stopped without finishing, or
  // to run a step again. The party does not retry a step by itself.
  runNext(app) {
    const step = nextStep(app, this.snap.today, minFit(this.snap.intake));
    if (!step?.member) return;
    // The party may have started it a moment ago, before this copy redrew: never start a second.
    if (party.jobs().some((j) => j.appId === app.id && isLive(j))) {
      notify({ title: "Already on it", body: `The party is already working on ${nameOf(app)}.`, level: "info" });
      return;
    }
    this.ask(step.member, step.kind, app, prompts.forJob(this.dir, { ...step, appId: app.id }, app, this.snap.today), { round: app.round ?? 0 });
  }

  // The job working on an application now, if any.
  jobOn(app) { return party.jobs().find((j) => j.appId === app.id && party.onScreen().includes(j)) ?? null; }

  showJob(job) { party.show(job); }

  // ---- the party chat

  chatItems() { return this.snap ? feed(this.snap.chat, this.snap.log).slice(-120) : []; }

  // The running workers you can @mention, with their handles.
  chatHandles() { return handlesFor(party.listeners()); }

  // Who a message goes to, from its @mentions (party.resolve): no mention is the Guildmaster.
  chatTarget(text = this.chatInput.value()) {
    return party.resolve(text, this.snap?.chat ?? [], this.snap?.applications ?? []);
  }

  // The @ list: running workers whose handle starts with what is typed, and everyone.
  mentionChoices() {
    const typed = typingMention(this.chatInput.value());
    if (typed === null) return null;
    const handles = this.chatHandles().map((h) => ({ handle: h.handle, job: h.job }));
    return [{ handle: "guildmaster", job: party.listeners().find((j) => j.kind === "lead") ?? null }, { handle: "everyone", job: null },
      ...handles.filter((h) => h.job.kind !== "lead")].filter((c) => c.handle.startsWith(typed));
  }

  // Puts the picked handle in place of the @ being typed.
  pickMention(handle, cx) {
    const text = this.chatInput.value().replace(/@[\w/-]*$/, `@${handle} `);
    this.chatInput.set_value(text);
    this.chatInput.focus();
    cx.notify();
  }

  // Reply on a worker's message: its handle goes at the front of the message.
  replyTo(message, cx) {
    const live = this.chatHandles().find((h) => party.senderOf(message, [h.job]));
    const handle = live?.handle ?? (message.appId ? `${message.from}/${message.appId.split("-")[0]}` : message.from);
    const rest = this.chatInput.value().replace(/^(@[\w/-]+\s+)+/, "");
    this.chatInput.set_value(`@${handle} ${rest}`);
    this.chatInput.focus();
    cx.notify();
  }

  // Saves the message to the chat, then delivers it as its @mentions say (party.route).
  sendChat(cx) {
    const text = this.chatInput.value().trim();
    if (!text || !this.snap) return;
    const target = this.chatTarget(text);
    if (target.unknown.length) {
      notify({ title: `Nobody is called @${target.unknown.join(", @")}`, body: "Type @ to see who you can reach.", level: "warning" });
      return;
    }
    this.chatInput.set_value("");
    const job = target.jobs.length === 1 && !target.lead ? target.jobs[0] : null;
    const to = party.recipients(target);
    this.mutate(cx, async () => {
      await saveMessage(this.dir, { from: "you", to: to || "nobody", appId: job?.appId ?? target.revive[0]?.app?.id ?? "", text });
      if (target.everyone && !target.jobs.length) notify({ title: "Saved, but nobody heard it", body: "No worker is running. Leave out the @ to reach the Guildmaster.", level: "info" });
      const failed = await party.route(this, target, text, "me");
      if (failed.length) throw new Error(`could not reach ${failed.join(", ")}`);
    });
  }


  // A tab in the Terminals view: an agent is shown below; a program not yet an agent (asking a
  // first-run question) is peeked over the window so it can be answered.
  showTerminal(entry) {
    if (entry.agent) party.focusAddress(entry.address);
    else run("terminal.peek", { terminal: entry.address });
  }

  closeTab(id) { run("tab.close", { id }); }
  dismissJob(job) { party.dismiss(job); }

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
    this.ask("herald", "email", app, prompts.emailDraft(this.dir, { ...app, ...contact }));
  }

  exportFiles(app, cx) {
    if (this.needsResume(app, cx)) return;
    this.ask("herald", "export", app, prompts.exportFiles(this.dir, app));
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
