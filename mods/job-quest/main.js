// Job Quest: a job-search workspace in five tabs. Intake (what you want), Profile (your documents
// and GitHub projects), Pipeline (applications by stage), Drafts (tailored resume and cover
// letter), Submit (application email, PDFs, mark applied). Data is plain files in a local folder.
// Work that needs judgement is handed to a coding agent, started in a new tab with the task.
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, TextareaState, Textarea, TextView } from "gpui-base";
import { run, exec, theme, notify, knownAgents, pickFolder, shared, setShared, watchFolder, window } from "herdr";
import {
  STAGES, STAGE_LABEL, INTAKE_FIELDS, parse, newApplication, withStage, followUpsDue, parseRepo,
  mergeRepos, toggleRepo, addRepo, isLink, mailto, nameOf,
} from "./model.js";
import {
  DIR_KEY, dataDir, appDir, ensureLayout, loadSnapshot, saveIntake, saveRepos, saveApplication,
  savePosting, readDocument, addNotes,
} from "./store.js";
import * as prompts from "./prompts.js";

const AGENT_KEY = "job-quest.agent";
const TABS = [["intake", "Intake"], ["profile", "Profile"], ["pipeline", "Pipeline"], ["drafts", "Drafts"], ["submit", "Submit"]];
// The application fields the panel edits, with where each one's text field is drawn.
const APP_FIELDS = [
  { key: "url", label: "Posting link", hint: "https://" },
  { key: "followUpAt", label: "Follow up on", hint: "YYYY-MM-DD" },
  { key: "notes", label: "Notes", hint: "Referral, salary range, anything to remember" },
  { key: "contactName", label: "Contact name", hint: "Who reads the application" },
  { key: "contactEmail", label: "Contact email", hint: "jobs@company.com" },
];

const remembered = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
const remember = (key, value) => { try { localStorage.setItem(key, value); } catch { /* not kept */ } };
const message = (e) => String(e?.message ?? e);

// Opens a folder or an address with the system's own handler.
function open(target) {
  const platform = window()?.platform;
  const [command, args] = platform === "macos" ? ["open", [target]]
    : platform === "windows" ? ["cmd", ["/c", "start", "", target]] : ["xdg-open", [target]];
  return exec(command, args);
}

export default class JobQuest extends View {
  init(_props, cx) {
    this.tab = remembered("tab") ?? "pipeline";
    this.selected = remembered("selected");
    this.snap = null; this.preview = null; this.error = null; this.agents = []; this.watching = 0;
    this.fields = new Map();
    this.newApp = InputState.new({ placeholder: "Company, Role, then Enter" });
    this.newApp.on("submit", (_e, cx) => this.addApplication(cx));
    this.repoInput = InputState.new({ placeholder: "owner/name or its address, then Enter" });
    this.repoInput.on("submit", (_e, cx) => this.addRepository(cx));
    this.dump = TextareaState.new({ placeholder: "Paste anything about your experience: roles, projects, numbers", rows: 5 });
    this.posting = TextareaState.new({ placeholder: "Paste the job posting, or just its link", rows: 6 });
    this.start(cx);
    cx.spawn(async (cx) => {
      try { this.agents = (await knownAgents()).filter((agent) => agent.installed); } catch { this.agents = []; }
      cx.notify();
    });
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
      } catch { /* the folder can't be watched: Refresh still works */ }
    });
  }

  async reload(cx) {
    try {
      this.snap = await loadSnapshot(this.dir);
      this.syncFields();
    } catch (e) { this.error = `Can't read ${this.dir}: ${message(e)}`; }
    cx.notify();
  }

  application() {
    return this.snap?.applications.find((a) => a.id === this.selected) ?? null;
  }

  // One text field per editable value, made once and kept. When the file changes underneath,
  // a field the person has not touched follows it; one they are typing in is left alone.
  syncFields() {
    const app = this.application();
    const wanted = [
      ...INTAKE_FIELDS.map((f) => [`intake:${f.key}`, this.snap.intake[f.key], f.hint]),
      ...(app ? APP_FIELDS.map((f) => [`app:${app.id}:${f.key}`, app[f.key], f.hint]) : []),
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

  typed(key) {
    const field = this.fields.get(key);
    return field ? field.state.value().trim() : null;
  }

  // Edits run one at a time, then the folder is read again.
  mutate(cx, work) {
    const done = (this.queue ?? Promise.resolve()).then(async () => {
      try { await work(); this.error = null; } catch (e) { this.error = `Not saved: ${message(e)}`; }
    });
    this.queue = done;
    cx.spawn(async (cx) => { await done; await this.reload(cx); });
  }

  // Saves every text field at once, so Enter in one never drops what was typed in another.
  saveFields(cx) {
    const intake = Object.fromEntries(INTAKE_FIELDS.map((f) => [f.key, this.typed(`intake:${f.key}`) ?? this.snap.intake[f.key]]));
    const app = this.application();
    const edited = app && { ...app, ...Object.fromEntries(APP_FIELDS.map((f) => [f.key, this.typed(`app:${app.id}:${f.key}`) ?? app[f.key]])) };
    this.mutate(cx, async () => {
      if (INTAKE_FIELDS.some((f) => intake[f.key] !== this.snap.intake[f.key])) await saveIntake(this.dir, intake);
      if (edited && APP_FIELDS.some((f) => edited[f.key] !== app[f.key])) await saveApplication(this.dir, edited);
    });
  }

  show(tab, cx) {
    this.tab = tab; this.preview = null; remember("tab", tab); cx.notify();
  }

  select(id, cx) {
    this.selected = id; this.preview = null; remember("selected", id);
    if (this.snap) this.syncFields();
    cx.notify();
  }

  addApplication(cx) {
    if (!this.snap) return;
    const created = newApplication(this.newApp.value(), this.snap.applications.map((a) => a.id), this.snap.today);
    if (!created) { this.error = "Write it as Company, Role"; cx.notify(); return; }
    this.newApp.set_value("");
    this.selected = created.id; remember("selected", created.id);
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

  // The person's own repositories from the GitHub CLI: no forks, nothing archived. New ones
  // start left out, so nothing is described in a document until they choose it.
  importRepos(cx) {
    this.busy = "Asking GitHub…"; cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await exec("gh", ["repo", "list", "--limit", "300", "--source", "--no-archived", "--json", "nameWithOwner,url,isPrivate"]);
        if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim().split("\n")[0] || "gh failed");
        await saveRepos(this.dir, mergeRepos(this.snap.repos, parse(r.stdout)));
        this.error = null;
      } catch (e) { this.error = `GitHub import needs the gh CLI, signed in (gh auth login): ${message(e)}`; }
      this.busy = null;
      await this.reload(cx);
    });
  }

  agent() {
    const chosen = shared(AGENT_KEY);
    return this.agents.find((a) => a.key === chosen) ?? this.agents.find((a) => a.key === "claude") ?? this.agents[0] ?? null;
  }

  // Starts the chosen agent in a new tab, in the data folder, with the task as its first message.
  ask(name, task) {
    const agent = this.agent();
    if (!agent) { notify({ title: "No coding agent found", body: "Install one (Claude Code, Codex, ...) so Job Quest can hand it work.", level: "error" }); return; }
    run("tab.new", { name, folder: this.dir, argv: agent.run, task });
  }

  view(app, file, title, cx) {
    cx.spawn(async (cx) => {
      const text = await readDocument(this.dir, app.id, file);
      this.preview = text === null ? null : { title, text };
      cx.notify();
    });
  }

  openEmail(app, cx) {
    cx.spawn(async (cx) => {
      try {
        const email = await readDocument(this.dir, app.id, "email.md");
        if (email === null) throw new Error("no email.md yet");
        await open(mailto(email, app.contactEmail));
      } catch (e) { this.error = `Can't open the mail app: ${message(e)}`; cx.notify(); }
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

  // ---- pieces

  button(id, text, onClick, t, primary = false) {
    return h_flex().id(id).h(28).px(11).flex_none().items_center().rounded(7).cursor_pointer().text_size(12).font_medium()
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground)
      .hover((s) => s.opacity(0.88)).on_click((_e, cx) => onClick(cx)).child(text);
  }

  chip(id, text, active, onClick, t) {
    return h_flex().id(id).h(24).px(9).flex_none().items_center().rounded(6).cursor_pointer().text_size(11.5)
      .bg(active ? t.selected : t.raised).text_color(active ? t.foreground : t.muted)
      .hover((s) => s.bg(t.hover)).on_click((_e, cx) => onClick(cx)).child(text);
  }

  heading(text, t, aside = "") {
    return h_flex().pt(6).gap(8).items_center()
      .child(div().font_semibold().text_color(t.foreground).child(text))
      .when(Boolean(aside), (e) => e.child(div().text_size(11).text_color(t.dim).child(aside)));
  }

  note(text, t, color = t.dim) {
    return div().text_size(11.5).text_color(color).child(text);
  }

  input(state, t) {
    return div().h(30).px(9).flex().items_center().rounded(7).border_1().border_color(t.input).bg(t.background)
      .child(Input.new(state).h_full().text_size(12.5).text_color(t.foreground));
  }

  area(state, height, t) {
    return div().h(height).px(9).py(6).rounded(7).border_1().border_color(t.input).bg(t.background)
      .text_size(12.5).text_color(t.foreground).child(Textarea.new(state));
  }

  labelled(label, key, t) {
    const field = this.fields.get(key);
    return v_flex().gap(3)
      .child(div().text_size(11).text_color(t.muted).child(label))
      .when(Boolean(field), (e) => e.child(this.input(field.state, t)));
  }

  row(t) { return h_flex().gap(6).flex_wrap().items_center(); }

  previewBox(t) {
    const p = this.preview;
    return v_flex().p(10).gap(8).rounded(8).border_1().border_color(t.border).bg(t.background)
      .child(h_flex().items_center().justify_between()
        .child(div().font_semibold().child(p.title))
        .child(this.chip("jq-preview-close", "Close", false, (cx) => { this.preview = null; cx.notify(); }, t)))
      .child(TextView.markdown(`jq-md-${p.title}`, p.text || "*This file is empty.*").w_full().text_size(12.5).text_color(t.foreground).selectable(true).scrollable(false));
  }

  pickFirst(t) {
    return v_flex().gap(8)
      .child(this.note("Pick an application in Pipeline first.", t))
      .child(this.row(t).child(this.button("jq-to-pipeline", "Go to Pipeline", (cx) => this.show("pipeline", cx), t)));
  }

  // ---- tabs

  intakeTab(t) {
    return v_flex().gap(8)
      .child(this.heading("What you are looking for", t))
      .child(this.note("Steers which jobs fit and how your documents are written. Enter in any field saves all of them.", t))
      .children(INTAKE_FIELDS.map((f) => this.labelled(f.label, `intake:${f.key}`, t)))
      .child(this.row(t)
        .child(this.button("jq-intake-save", "Save", (cx) => this.saveFields(cx), t, true))
        .child(this.button("jq-intake-interview", "Interview me", () => this.ask("Job Quest: intake", prompts.interview(this.dir)), t)))
      .child(this.heading("Data folder", t))
      .child(this.note(this.dir, t))
      .child(this.row(t)
        .child(this.button("jq-dir-open", "Open folder", (cx) => { open(this.dir).catch((e) => { this.error = message(e); cx.notify(); }); }, t))
        .child(this.button("jq-dir-change", "Change…", (cx) => this.chooseFolder(cx), t)))
      .when(this.agents.length > 0, (e) => e
        .child(this.heading("Agent", t, "who the buttons hand work to"))
        .child(this.row(t).children(this.agents.map((a) =>
          this.chip(`jq-agent-${a.key}`, a.name, this.agent()?.key === a.key, () => setShared(AGENT_KEY, a.key), t)))))
      .when(this.agents.length === 0, (e) => e.child(this.note("No coding agent is installed, so the buttons that draft and summarize can't run yet.", t, t.blocked)));
  }

  profileTab(t) {
    const s = this.snap, included = s.repos.filter((r) => r.isIncluded), waiting = included.filter((r) => !r.summary);
    return v_flex().gap(8)
      .child(this.heading("Your documents", t, `${s.profileFiles.length} in profile/`))
      .child(this.note(`Put old resumes, cover letters and notes in ${s.dir}/profile. PDF, Word, Markdown and text all work.`, t))
      .children(s.profileFiles.map((name) => div().text_size(12).text_color(t.muted).child(`• ${name}`)))
      .child(this.row(t).child(this.button("jq-profile-open", "Open profile folder", (cx) => { open(`${s.dir}/profile`).catch((e) => { this.error = message(e); cx.notify(); }); }, t)))
      .child(this.heading("Word dump", t, "added to profile/notes.md"))
      .child(this.area(this.dump, 110, t))
      .child(this.row(t).child(this.button("jq-dump-save", "Add to notes", (cx) => this.saveDump(cx), t)))
      .child(this.heading("Master profile", t, s.hasMaster ? "profile/master.md exists" : "not built yet"))
      .child(this.note("One document built from everything above and your included projects. Every draft is tailored from it.", t))
      .child(this.row(t).child(this.button("jq-master", s.hasMaster ? "Update master profile" : "Build master profile",
        () => this.ask("Job Quest: master profile", prompts.buildMaster(s.dir)), t, true)))
      .child(this.heading("GitHub projects", t, `${included.length} of ${s.repos.length} included`))
      .child(this.note("Only included projects are described in your documents. Click one to include it or leave it out.", t))
      .child(this.row(t)
        .child(this.button("jq-repos-import", this.busy ?? "Import from GitHub", (cx) => this.importRepos(cx), t))
        .when(waiting.length > 0, (e) => e.child(this.button("jq-repos-summarize", `Summarize included (${waiting.length})`,
          () => this.ask("Job Quest: projects", prompts.summarizeRepos(s.dir)), t))))
      .child(this.input(this.repoInput, t))
      .children(s.repos.map((r) => h_flex().id(`jq-repo-${r.fullName}`).px(6).py(4).gap(8).items_center().rounded(6).cursor_pointer()
        .hover((st) => st.bg(t.hover))
        .on_click((_e, cx) => this.mutate(cx, () => saveRepos(s.dir, toggleRepo(s.repos, r.fullName))))
        .child(div().size(14).flex().flex_none().items_center().justify_center().rounded(4).border_1()
          .border_color(r.isIncluded ? t.accent : t.input).bg(r.isIncluded ? t.accent : t.background)
          .text_size(10).text_color(t.accent_foreground).child(r.isIncluded ? "✓" : ""))
        .child(div().flex_1().min_w(0).truncate().text_color(r.isIncluded ? t.foreground : t.muted).child(r.fullName))
        .child(div().flex_none().text_size(11).text_color(t.dim).child([r.isPrivate && "private", r.summary && "summarized"].filter(Boolean).join(" · ")))));
  }

  pipelineTab(t) {
    const s = this.snap, app = this.application(), due = followUpsDue(s.applications, s.today);
    return v_flex().gap(8)
      .child(this.heading("New application", t))
      .child(this.input(this.newApp, t))
      .when(due.length > 0, (e) => e.child(this.note(`Follow up due: ${due.map((a) => a.company).join(", ")}`, t, t.blocked)))
      .when(s.applications.length === 0, (e) => e.child(this.note("No applications yet. Add one above.", t)))
      .children(STAGES.filter((stage) => s.applications.some((a) => a.stage === stage)).map((stage) => {
        const rows = s.applications.filter((a) => a.stage === stage);
        return v_flex().gap(1)
          .child(this.heading(STAGE_LABEL[stage], t, String(rows.length)))
          .children(rows.map((a) => h_flex().id(`jq-app-${a.id}`).px(8).py(5).gap(8).items_center().rounded(6).cursor_pointer()
            .bg(a.id === this.selected ? t.selected : t.surface).hover((st) => st.bg(t.hover))
            .on_click((_e, cx) => this.select(a.id, cx))
            .child(div().flex_1().min_w(0).truncate().child(nameOf(a)))
            .child(div().flex_none().text_size(11).text_color(t.dim)
              .child([a.hasResume && "resume", a.hasCoverLetter && "letter", a.followUpAt && `follow up ${a.followUpAt}`].filter(Boolean).join(" · ")))));
      }))
      .when(Boolean(app), (e) => e.child(v_flex().mt(6).p(10).gap(8).rounded(8).border_1().border_color(t.border).bg(t.background)
        .child(div().font_semibold().child(nameOf(app)))
        .child(this.row(t).children(STAGES.map((stage) =>
          this.chip(`jq-stage-${stage}`, STAGE_LABEL[stage], app.stage === stage, (cx) => this.setStage(app, stage, cx), t))))
        .child(this.labelled("Posting link", `app:${app.id}:url`, t))
        .child(this.labelled("Follow up on", `app:${app.id}:followUpAt`, t))
        .child(this.labelled("Notes", `app:${app.id}:notes`, t))
        .child(this.row(t)
          .child(this.button("jq-app-save", "Save", (cx) => this.saveFields(cx), t))
          .child(this.button("jq-to-drafts", "Drafts", (cx) => this.show("drafts", cx), t, true))
          .child(this.button("jq-to-submit", "Submit", (cx) => this.show("submit", cx), t)))));
  }

  draftsTab(t) {
    const s = this.snap, app = this.application();
    if (!app) return this.pickFirst(t);
    const have = (yes) => (yes ? "saved" : "missing");
    const draft = (kind) => (cx) => {
      if (app.stage === "lead") this.setStage(app, "drafting", cx);
      this.ask(`Draft: ${app.company}`, prompts.draft(s.dir, app, kind));
    };
    return v_flex().gap(8)
      .child(this.heading(nameOf(app), t))
      .child(this.note(`Posting: ${have(app.hasPosting)} · Resume: ${have(app.hasResume)} · Cover letter: ${have(app.hasCoverLetter)}`, t, t.muted))
      .child(this.area(this.posting, 130, t))
      .child(this.row(t).child(this.button("jq-posting-save", "Save posting", (cx) => this.savePostingText(app, cx), t)))
      .when(!s.hasMaster, (e) => e.child(this.note("No master profile yet. Build one in Profile for better drafts.", t, t.blocked)))
      .child(this.row(t)
        .child(this.button("jq-draft-both", "Draft both", draft("both"), t, true))
        .child(this.button("jq-draft-resume", "Resume only", draft("resume"), t))
        .child(this.button("jq-draft-letter", "Cover letter only", draft("cover-letter"), t)))
      .child(this.row(t)
        .when(app.hasPosting, (e) => e.child(this.chip("jq-view-posting", "View posting", false, (cx) => this.view(app, "posting.md", "Posting", cx), t)))
        .when(app.hasResume, (e) => e.child(this.chip("jq-view-resume", "View resume", false, (cx) => this.view(app, "resume.md", "Resume", cx), t)))
        .when(app.hasCoverLetter, (e) => e.child(this.chip("jq-view-letter", "View cover letter", false, (cx) => this.view(app, "cover-letter.md", "Cover letter", cx), t))))
      .when(Boolean(this.preview), (e) => e.child(this.previewBox(t)))
      .child(this.note(`To change a draft, tell the agent what to revise, or edit the files in ${appDir(s.dir, app.id)}`, t));
  }

  submitTab(t) {
    const s = this.snap, app = this.application();
    if (!app) return this.pickFirst(t);
    const have = (yes) => (yes ? "saved" : "missing");
    const needsResume = (then) => (cx) => {
      if (!app.hasResume) { this.error = "Draft a resume first, in Drafts"; cx.notify(); return; }
      then(cx);
    };
    return v_flex().gap(8)
      .child(this.heading(nameOf(app), t))
      .child(this.note(`Resume: ${have(app.hasResume)} · Cover letter: ${have(app.hasCoverLetter)} · Email: ${have(app.hasEmail)}`, t, t.muted))
      .child(this.labelled("Contact name", `app:${app.id}:contactName`, t))
      .child(this.labelled("Contact email", `app:${app.id}:contactEmail`, t))
      .child(this.row(t)
        .child(this.button("jq-contact-save", "Save", (cx) => this.saveFields(cx), t))
        .child(this.button("jq-email-write", "Write email", needsResume((cx) => {
          const contact = { contactName: this.typed(`app:${app.id}:contactName`) ?? app.contactName, contactEmail: this.typed(`app:${app.id}:contactEmail`) ?? app.contactEmail };
          this.saveFields(cx);
          this.ask(`Email: ${app.company}`, prompts.emailDraft(s.dir, { ...app, ...contact }));
        }), t, true))
        .child(this.button("jq-export", "Export PDFs", needsResume(() => this.ask(`Export: ${app.company}`, prompts.exportFiles(s.dir, app))), t)))
      .when(app.hasEmail, (e) => e.child(this.row(t)
        .child(this.button("jq-email-open", "Open in mail app", (cx) => this.openEmail(app, cx), t))
        .child(this.chip("jq-view-email", "View email", false, (cx) => this.view(app, "email.md", "Email", cx), t))))
      .when(Boolean(this.preview), (e) => e.child(this.previewBox(t)))
      .when(!app.appliedAt, (e) => e.child(this.row(t).child(this.button("jq-applied", "Mark as applied", (cx) => this.setStage(app, "applied", cx), t))))
      .when(Boolean(app.appliedAt), (e) => e.child(this.note(`Applied ${app.appliedAt}${app.followUpAt ? ` · follow up ${app.followUpAt}` : ""}`, t, t.done)))
      .child(this.note("Nothing is ever sent for you. The email opens as a draft in your mail app; you attach the files and send.", t));
  }

  body(t) {
    if (!this.snap) return this.note("Reading the data folder…", t);
    if (this.tab === "intake") return this.intakeTab(t);
    if (this.tab === "profile") return this.profileTab(t);
    if (this.tab === "drafts") return this.draftsTab(t);
    if (this.tab === "submit") return this.submitTab(t);
    return this.pipelineTab(t);
  }

  render() {
    const t = theme();
    return v_flex().id("job-quest").size_full().min_h(0).bg(t.surface).text_color(t.foreground).text_size(12.5)
      .child(h_flex().flex_none().px(10).py(8).gap(5).flex_wrap().items_center().border_b(1).border_color(t.border)
        .children(TABS.map(([id, label]) => this.chip(`jq-tab-${id}`, label, this.tab === id, (cx) => this.show(id, cx), t)))
        .child(div().flex_1())
        .child(this.chip("jq-refresh", "Refresh", false, (cx) => { cx.spawn((cx) => this.reload(cx)); }, t)))
      .when(Boolean(this.error), (e) => e.child(h_flex().flex_none().px(12).py(6).gap(8).items_center()
        .child(div().flex_1().min_w(0).text_size(11.5).text_color(t.ansi1).child(this.error ?? ""))
        .child(this.chip("jq-error-close", "Dismiss", false, (cx) => { this.error = null; cx.notify(); }, t))))
      .child(v_flex().id("jq-body").flex_1().min_h(0).overflow_y_scrollbar().px(12).py(10).child(this.body(t)));
  }
}
