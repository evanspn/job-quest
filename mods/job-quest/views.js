// What each part looks like. Every function takes the view `v` (main.js) and the theme `t`,
// reads its state and calls its actions; nothing here reads or writes files.
import { div } from "gpui-kit";
import { v_flex, h_flex, Editor, TextView } from "gpui-base";
import { theme, run } from "herdr";
import { STAGES, STAGE_LABEL, INTAKE_FIELDS, DOCS, columns, followUpsDue, nameOf, fitOf } from "./model.js";
import * as party from "./party.js";
import { rarity, jobLine, partySummary, partyStatus, rail, partyBody, terminalTabs } from "./party-views.js";
import { chatPanel } from "./chat-views.js";
import { button, chip, heading, note, row, input, area, labelled, card, scroller } from "./ui.js";

// From this width the board draws columns side by side; under it, groups one above another.
const WIDE = 700;
const PANEL_TABS = [["pipeline", "Pipeline"], ["application", "Application"], ["party", "Party"], ["chat", "Chat"], ["profile", "Profile"], ["intake", "Intake"]];
const LAYOUT_VIEWS = [["pipeline", "Pipeline"], ["party", "Party"], ["profile", "Profile"], ["intake", "Intake"], ["terminals", "Terminals"]];

const have = (yes) => (yes ? "saved" : "missing");

function errorLine(v, t) {
  return h_flex().flex_none().px(14).py(6).gap(8).items_center()
    .child(div().flex_1().min_w(0).text_size(11.5).text_color(t.ansi1).child(v.error ?? ""))
    .child(chip("jq-error-close", "Dismiss", false, (cx) => v.dismissError(cx), t));
}

// A part's frame: the error line when there is one, then the body.
function frame(v, t, id, body) {
  return v_flex().id(id).size_full().min_h(0).text_color(t.foreground).text_size(12.5)
    .on_size_change((size, cx) => v.setWidth(size, cx))
    .when(Boolean(v.error), (e) => e.child(errorLine(v, t)))
    .child(body);
}

const loading = (t) => div().p(14).child(note("Reading the data folder…", t));

// ---- bar: the layout's top bar

function bar(v, t) {
  const view = v.view(), agent = v.agent();
  return h_flex().id("jq-bar").size_full().px(12).gap(6).items_center().text_color(t.foreground).text_size(12.5)
    .child(div().pr(8).font_semibold().child("Job Quest"))
    .children(LAYOUT_VIEWS.map(([id, label]) => chip(`jq-view-${id}`, label, view === `jq-${id}`, (cx) => v.show(id, cx), t)))
    .child(div().flex_1())
    .child(partySummary(v, t))
    .child(chip("jq-autopilot", party.autopilot() ? "⚔ Autopilot on" : "Autopilot off", party.autopilot(), () => v.toggleAutopilot(), t))
    .when(v.starting(), (e) => e.child(note("Starting agent…", t, t.working)))
    .when(Boolean(agent), (e) => e.child(note(`Agent: ${agent.name}`, t)))
    .child(chip("jq-chat-toggle", "Chat", false, () => run("layout.toggle", { id: "jq-chat" }), t))
    .child(chip("jq-agent-toggle", "Agent pane", false, () => run("layout.toggle", { id: "jq-agent" }), t))
    .child(chip("jq-refresh", "Refresh", false, (cx) => { cx.spawn((cx) => v.reload(cx)); }, t))
    .child(chip("jq-leave", "Back to Herdr", false, () => run("layout.switch", { name: "main" }), t));
}

// ---- board: applications by stage

function appCard(v, t, a) {
  const selected = a.id === v.selected();
  const facts = [a.hasResume && "resume", a.hasCoverLetter && "letter", a.hasEmail && "email"].filter(Boolean).join(" · ");
  const due = a.stage === "applied" && a.followUpAt && a.followUpAt <= v.snap.today;
  const working = v.jobOn(a);
  return v_flex().id(`jq-app-${a.id}`).p(9).gap(3).rounded(8).cursor_pointer().border_1()
    .border_color(selected ? t.accent : t.border).bg(selected ? t.selected : t.background)
    .hover((s) => s.bg(t.hover)).on_click((_e, cx) => v.select(a.id, cx))
    .child(div().font_medium().truncate().child(a.company))
    .when(Boolean(a.role), (e) => e.child(div().text_size(11.5).text_color(t.muted).truncate().child(a.role)))
    .when(fitOf(a) !== null, (e) => e.child(div().text_size(11).text_color(rarity(fitOf(a), t).color).child(`${rarity(fitOf(a), t).name} · fit ${fitOf(a)}`)))
    .when(Boolean(working), (e) => e.child(jobLine(v, t, working, `jq-app-job-${a.id}`)))
    .when(Boolean(facts), (e) => e.child(div().text_size(11).text_color(t.dim).child(facts)))
    .when(Boolean(a.followUpAt), (e) => e.child(div().text_size(11).text_color(due ? t.blocked : t.dim).child(`Follow up ${a.followUpAt}`)));
}

function boardBody(v, t) {
  const s = v.snap, wide = v.width >= WIDE, cols = columns(s.applications), due = followUpsDue(s.applications, s.today);
  const column = (c) => v_flex().gap(6).when(wide, (e) => e.w(210).flex_none())
    .child(heading(c.label, t, String(c.rows.length)))
    .children(c.rows.map((a) => appCard(v, t, a)))
    .when(wide && c.rows.length === 0, (e) => e.child(div().h(36).rounded(8).border_1().border_color(t.border)));
  const shown = wide ? cols : cols.filter((c) => c.rows.length > 0);
  return v_flex().flex_1().min_h(0)
    .child(v_flex().flex_none().px(14).pt(12).gap(6)
      .child(input(v.newApp, t))
      .when(due.length > 0, (e) => e.child(note(`Follow up due: ${due.map((a) => a.company).join(", ")}`, t, t.blocked)))
      .when(s.applications.length === 0, (e) => e.child(note("No applications yet. Type a company and role above and press Enter.", t))))
    .child(wide
      ? h_flex().id("jq-columns").flex_1().min_h(0).overflow_x_scrollbar().px(14).py(10).gap(12).items_start().children(shown.map(column))
      : scroller("jq-columns").children(shown.map(column)));
}

// ---- detail: one application

function documentBox(v, t, app) {
  const doc = DOCS.find((d) => d.id === v.docTab) ?? DOCS[0];
  const editing = v.edit && v.edit.id === app.id && v.edit.file === doc.file;
  const text = v.doc && v.doc.id === app.id && v.doc.file === doc.file ? v.doc.text : null;
  const tabs = row().children(DOCS.map((d) => chip(`jq-doc-${d.id}`, app[d.has] ? d.label : `${d.label} ·`, d.id === doc.id, (cx) => v.showDoc(d.id, cx), t)));

  if (editing) {
    return card(t).child(tabs)
      .child(row()
        .child(button("jq-edit-save", "Save", (cx) => v.saveEdit(cx), t, true))
        .child(button("jq-edit-cancel", "Cancel", (cx) => v.cancelEdit(cx), t)))
      .child(div().h(420).rounded(7).border_1().border_color(t.input).bg(t.background).child(Editor.new(v.edit.state).size_full()));
  }
  if (text !== null) {
    return card(t).child(tabs)
      .child(row().child(button("jq-edit", "Edit", (cx) => v.startEdit(cx), t)))
      .child(TextView.markdown(`jq-md-${app.id}-${doc.id}`, text || "*This file is empty.*").w_full().text_size(12.5).text_color(t.foreground).selectable(true).scrollable(false));
  }
  // The document does not exist yet: say how to get it.
  const missing = card(t).child(tabs);
  if (doc.id === "posting") {
    return missing
      .child(note(app.url ? `No posting text saved. The agent will fetch it from ${app.url} when drafting, or paste it here.` : "Paste the job posting, or just its link.", t))
      .child(area(v.posting, 130, t))
      .child(row().child(button("jq-posting-save", "Save posting", (cx) => v.savePostingText(app, cx), t)));
  }
  if (doc.id === "email") return missing.child(note("No email yet. Write email has your agent draft one from the posting and your resume.", t));
  if (["research", "review", "followup", "prep"].includes(doc.id)) return missing.child(note(`No ${doc.label.toLowerCase()} yet. The party writes it when the application reaches that step.`, t));
  return missing.child(note(`No ${doc.label.toLowerCase()} yet. Use the Draft buttons above.`, t));
}

// Who the email goes to and what it carries, from email.md's headers.
function emailLine(app, t) {
  const missing = app.missingAttachments ?? [];
  const parts = [
    app.emailTo ? `To ${app.emailTo}` : "No To: line",
    app.attachments?.length ? `attached: ${app.attachments.map((f) => (missing.includes(f) ? `${f} (missing)` : f)).join(", ")}` : "no attachments named",
  ];
  return note(parts.join(" · "), t, !app.emailTo || missing.length || !app.attachments?.length ? t.blocked : t.done);
}

function detailBody(v, t) {
  const app = v.application();
  if (!app) return div().p(14).child(note("Pick an application on the board to see it here.", t));
  const field = (label, key) => labelled(label, v.field(`app:${app.id}:${key}`), t);
  return scroller("jq-detail-body")
    .child(div().text_size(15).font_semibold().child(nameOf(app)))
    .child(row().children(STAGES.map((stage) => chip(`jq-stage-${stage}`, STAGE_LABEL[stage], app.stage === stage, (cx) => v.setStage(app, stage, cx), t))))
    .child(partyStatus(v, t, app))
    .when(Boolean(app.appliedAt), (e) => e.child(note(`Applied ${app.appliedAt}${app.followUpAt ? ` · follow up ${app.followUpAt}` : ""}`, t, t.done)))
    .child(field("Posting link", "url"))
    .child(h_flex().gap(8)
      .child(div().flex_1().min_w(0).child(field("Contact name", "contactName")))
      .child(div().flex_1().min_w(0).child(field("Contact email", "contactEmail"))))
    .child(field("Follow up on (YYYY-MM-DD)", "followUpAt"))
    .child(field("Notes", "notes"))
    .child(row().child(button("jq-app-save", "Save", (cx) => v.saveFields(cx), t)))
    .child(heading("Draft", t, `Posting ${have(app.hasPosting)} · Resume ${have(app.hasResume)} · Cover letter ${have(app.hasCoverLetter)}`))
    .when(!v.snap.hasMaster, (e) => e.child(note("No master profile yet. Build one in Profile for better drafts.", t, t.blocked)))
    .child(row()
      .child(button("jq-draft-both", "Draft both", (cx) => v.draft(app, "both", cx), t, true))
      .child(button("jq-draft-resume", "Resume only", (cx) => v.draft(app, "resume", cx), t))
      .child(button("jq-draft-letter", "Cover letter only", (cx) => v.draft(app, "cover-letter", cx), t)))
    .child(heading("Submit", t, "nothing is ever sent for you"))
    .child(row()
      .child(button("jq-email-write", "Write email", (cx) => v.writeEmail(app, cx), t))
      .when(app.hasEmail, (e) => e.child(button("jq-email-open", "Open email, attachments in", (cx) => v.openEmail(app, cx), t, app.stage === "ready"))))
    .when(app.hasEmail, (e) => e.child(emailLine(app, t)))
    .child(row()
      .child(button("jq-export", "Export PDFs", (cx) => v.exportFiles(app, cx), t))
      .when(!app.appliedAt, (e) => e.child(button("jq-applied", "Mark as applied", (cx) => v.setStage(app, "applied", cx), t))))
    .child(heading("Documents", t, "· means not written yet"))
    .child(documentBox(v, t, app));
}

// ---- profile

function profileBody(v, t) {
  const s = v.snap, included = s.repos.filter((r) => r.isIncluded), waiting = included.filter((r) => !r.summary);
  return scroller("jq-profile-body")
    .child(heading("Your documents", t, `${s.profileFiles.length} in profile/`))
    .child(note(`Put old resumes, cover letters and notes in ${s.dir}/profile. PDF, Word, Markdown and text all work.`, t))
    .children(s.profileFiles.map((name) => div().text_size(12).text_color(t.muted).child(`• ${name}`)))
    .child(row().child(button("jq-profile-open", "Open profile folder", (cx) => v.openFolder(`${s.dir}/profile`, cx), t)))
    .child(heading("Word dump", t, "added to profile/notes.md"))
    .child(area(v.dump, 110, t))
    .child(row().child(button("jq-dump-save", "Add to notes", (cx) => v.saveDump(cx), t)))
    .child(heading("Master profile", t, s.hasMaster ? "profile/master.md exists" : "not built yet"))
    .child(note("One document built from everything above and your included projects. Every draft is tailored from it.", t))
    .child(row().child(button("jq-master", s.hasMaster ? "Update master profile" : "Build master profile", () => v.buildMaster(), t, true)))
    .child(heading("GitHub projects", t, `${included.length} of ${s.repos.length} included`))
    .child(note("Only included projects are described in your documents. Click one to include it or leave it out.", t))
    .child(row()
      .child(button("jq-repos-import", v.busy ?? "Import from GitHub", (cx) => v.importRepos(cx), t))
      .when(waiting.length > 0, (e) => e.child(button("jq-repos-summarize", `Summarize included (${waiting.length})`, () => v.summarizeRepos(), t))))
    .child(input(v.repoInput, t))
    .children(s.repos.map((r) => h_flex().id(`jq-repo-${r.fullName}`).px(6).py(4).gap(8).items_center().rounded(6).cursor_pointer()
      .hover((st) => st.bg(t.hover)).on_click((_e, cx) => v.toggleRepository(r.fullName, cx))
      .child(div().size(14).flex().flex_none().items_center().justify_center().rounded(4).border_1()
        .border_color(r.isIncluded ? t.accent : t.input).bg(r.isIncluded ? t.accent : t.background)
        .text_size(10).text_color(t.accent_foreground).child(r.isIncluded ? "✓" : ""))
      .child(div().flex_1().min_w(0).truncate().text_color(r.isIncluded ? t.foreground : t.muted).child(r.fullName))
      .child(div().flex_none().text_size(11).text_color(t.dim).child([r.isPrivate && "private", r.summary && "summarized"].filter(Boolean).join(" · ")))));
}

// ---- intake

function intakeBody(v, t) {
  const chosen = v.agent();
  return scroller("jq-intake-body")
    .child(heading("What you are looking for", t))
    .child(note("Steers which jobs fit and how your documents are written. Enter in any field saves all of them.", t))
    .children(INTAKE_FIELDS.map((f) => labelled(f.label, v.field(`intake:${f.key}`), t)))
    .child(row()
      .child(button("jq-intake-save", "Save", (cx) => v.saveFields(cx), t, true))
      .child(button("jq-intake-interview", "Interview me", () => v.interview(), t)))
    .child(heading("Data folder", t))
    .child(note(v.dir, t))
    .child(row()
      .child(button("jq-dir-open", "Open folder", (cx) => v.openFolder(v.dir, cx), t))
      .child(button("jq-dir-change", "Change…", (cx) => v.chooseFolder(cx), t)))
    .child(heading("Agent", t, "who the buttons hand work to"))
    .when(v.known.length > 0, (e) => e.child(row().children(v.known.map((a) =>
      chip(`jq-agent-${a.key}`, a.name, chosen?.key === a.key, () => v.chooseAgent(a.key), t)))))
    .when(v.known.length === 0, (e) => e.child(note("No coding agent is installed, so the buttons that draft and summarize can't run yet.", t, t.blocked)));
}

// ---- panel: everything in one block, for use outside the layout

function panel(v, t) {
  const body = !v.snap ? loading(t)
    : v.tab === "application" ? detailBody(v, t)
    : v.tab === "profile" ? profileBody(v, t)
    : v.tab === "intake" ? intakeBody(v, t)
    : v.tab === "party" ? partyBody(v, t)
    : v.tab === "chat" ? chatPanel(v, t)
    : boardBody(v, t);
  return v_flex().flex_1().min_h(0).bg(t.surface)
    .child(h_flex().flex_none().px(10).py(8).gap(5).flex_wrap().items_center().border_b(1).border_color(t.border)
      .children(PANEL_TABS.map(([id, label]) => chip(`jq-tab-${id}`, label, v.tab === id, (cx) => v.show(id, cx), t)))
      .child(div().flex_1())
      .child(chip("jq-refresh", "Refresh", false, (cx) => { cx.spawn((cx) => v.reload(cx)); }, t)))
    .child(body);
}

const BODIES = { board: boardBody, detail: detailBody, profile: profileBody, intake: intakeBody, party: partyBody };

export function draw(v) {
  const t = theme();
  if (v.part === "bar") return bar(v, t);
  if (v.part === "rail") return rail(v, t);
  if (v.part === "tabs") return terminalTabs(v, t);
  if (v.part === "chat") return frame(v, t, "job-quest-chat", v.snap ? chatPanel(v, t) : loading(t));
  if (v.part === "panel") return frame(v, t, "job-quest", panel(v, t));
  return frame(v, t, `job-quest-${v.part}`, v.snap ? BODIES[v.part](v, t) : loading(t));
}
