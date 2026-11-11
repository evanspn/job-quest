// What the party looks like: the rail of agents beside the agent block, the Party view, and the
// small pieces the board, the detail and the bar show. Reads the view `v` and the shared jobs;
// touches no files.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { MEMBERS, ROSTER, nameOf, nextStep, minFit, fitOf, isLive } from "./model.js";
import * as party from "./party.js";
import { button, chip, heading, note, row, card, scroller } from "./ui.js";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const STATE_WORDS = { starting: "setting out", working: "working", waiting: "needs you", stopped: "stopped early", listening: "listening", done: "done", failed: "gave up" };

// A fit score as a loot rarity, so the best leads stand out on the board.
export function rarity(fit, t) {
  if (fit >= 90) return { name: "Legendary", color: t.ansi3 ?? t.accent };
  if (fit >= 80) return { name: "Epic", color: t.ansi5 ?? t.accent };
  if (fit >= 65) return { name: "Rare", color: t.ansi4 ?? t.accent };
  return { name: "Common", color: t.dim };
}

const memberColor = (m, t) => t[m.color] ?? t.accent;

// A job's state as a mark: a spinner while it works, a pulse when it needs you.
function stateMark(t, job, id) {
  if (job.state === "working" || job.state === "starting") return div().id(id).text_color(t.working).frames(SPINNER, 90);
  if (job.state === "waiting") return div().id(id).text_color(t.blocked).loop("opacity", { from: 0.35, to: 1, period: 900 }).child("●");
  if (job.state === "stopped") return div().id(id).text_color(t.dim).child("■");
  if (job.state === "listening") return div().id(id).text_color(t.done).child("◦");
  if (job.state === "failed") return div().id(id).text_color(t.blocked).child("✕");
  return div().id(id).text_color(t.done).child("✓");
}

// One line for a job: glyph, state, what it is doing. Click: show its agent.
export function jobLine(v, t, job, id) {
  const { member, doing } = party.describe(job);
  return h_flex().id(id).gap(5).items_center().text_size(11).cursor_pointer().rounded(5).hover((s) => s.bg(t.hover))
    .on_click((_e, cx) => { cx.stop_propagation(); v.showJob(job); })
    .child(div().flex_none().child(member.glyph))
    .child(stateMark(t, job, `${id}-state`).flex_none())
    .child(div().flex_1().min_w(0).truncate().text_color(job.state === "waiting" ? t.blocked : t.muted)
      .child(`${member.name} ${STATE_WORDS[job.state]} · ${party.describe(job).doing}`));
}

// The bar's count of who is at work, who needs you and what waits for approval.
export function partySummary(v, t) {
  const live = party.jobs().filter(isLive);
  const waiting = live.filter((j) => j.state === "waiting").length;
  const ready = v.snap ? v.snap.applications.filter((a) => a.stage === "ready").length : 0;
  const bits = [live.length - waiting > 0 && `${live.length - waiting} questing`, waiting && `${waiting} need you`, ready && `${ready} to approve`].filter(Boolean);
  return h_flex().id("jq-party-summary").gap(6).items_center().cursor_pointer().on_click((_e, cx) => v.show("party", cx))
    .when(bits.length > 0, (e) => e.child(note(bits.join(" · "), t, waiting || ready ? t.blocked : t.muted)));
}

// What the party is doing for one application, on the detail.
export function partyStatus(v, t, app) {
  const job = v.jobOn(app), box = card(t).gap(6);
  if (job) {
    return box.child(jobLine(v, t, job, "jq-detail-job"))
      .child(row()
        .child(button("jq-detail-watch", "Watch", () => v.showJob(job), t))
        .when(!isLive(job), (e) => e.child(button("jq-detail-dismiss", "Close its tab", () => v.dismissJob(job), t))));
  }
  if (app.stage === "lead") {
    return box.child(note("The party works on applications in “Party at work”.", t))
      .child(row().child(button("jq-send-party", "⚔ Send the party", (cx) => v.sendParty(app, cx), t, true)));
  }
  if (app.stage === "ready") return box.child(note("🏁 Ready for your approval. Read the Review tab, then open the email and send it yourself.", t, t.done));
  const step = nextStep(app, v.snap.today, minFit(v.snap.intake));
  if (step?.stuck) return box.child(note(`Stopped: it ${step.stuck}.`, t, t.blocked));
  if (step?.member) {
    const m = MEMBERS[step.member];
    return box.child(note(`Next: ${m.glyph} ${m.name}${party.autopilot() ? ", when there is room in the party" : " (autopilot is off)"}`, t))
      .child(row().child(button("jq-run-next", `Start the ${m.name} now`, () => v.runNext(app), t)));
  }
  return box.child(note("Nothing for the party to do here.", t));
}

// The rail: one tile per agent the party has on screen. Click a tile to show that agent beside
// the board; click the one shown to hide it.
export function rail(v, t) {
  const shown = party.shownAddress(), list = party.onScreen();
  const tile = (job) => {
    const { member, doing } = party.describe(job), agent = party.agentFor(job);
    const on = Boolean(agent) && agent.address === shown, waiting = job.state === "waiting";
    return v_flex().id(`jq-rail-${job.key}`).w_full().items_center().gap(3).cursor_pointer()
      .tooltip(`${member.name}: ${doing} (${STATE_WORDS[job.state]})`)
      .on_click(() => v.showJob(job))
      .child(h_flex().w_full().items_center()
        .child(div().w(3).h(on ? 30 : waiting ? 12 : 0).rounded(2).bg(t.foreground).transition("height", 160))
        .child(div().flex_1().flex().justify_center()
          .child(div().size(44).flex().items_center().justify_center().rounded(on ? 14 : 22).border_2()
            .border_color(waiting ? t.blocked : on ? t.accent : memberColor(member, t))
            .bg(on ? t.selected : t.raised).text_size(21).opacity(isLive(job) ? 1 : 0.5)
            .hover((s) => s.bg(t.hover))
            .child(member.glyph))))
      .child(h_flex().gap(3).items_center().text_size(10)
        .child(stateMark(t, job, `jq-rail-${job.key}-state`))
        .child(div().text_color(t.muted).child(member.name)))
      .when(Boolean(job.title), (e) => e.child(div().w(66).text_size(9.5).text_color(t.dim).truncate().text_center().child(job.title.split(" · ")[0])));
  };
  return v_flex().id("jq-rail").size_full().py(10).gap(8).items_center().text_color(t.foreground)
    .child(div().id("jq-rail-crest").text_size(20).cursor_pointer().tooltip("The party").on_click((_e, cx) => v.show("party", cx)).child("⚔"))
    .child(div().id("jq-rail-autopilot").text_size(9.5).font_semibold().cursor_pointer().text_color(party.autopilot() ? t.done : t.dim)
      .tooltip("Autopilot: the party starts work by itself. Click to switch.").on_click(() => v.toggleAutopilot())
      .child(party.autopilot() ? "AUTO" : "PAUSED"))
    .child(div().w(36).h(1).bg(t.border))
    .child(v_flex().id("jq-rail-list").flex_1().min_h(0).w_full().overflow_y_scrollbar().gap(12).children(list.map(tile))
      .when(list.length === 0, (e) => e.child(div().px(6).text_size(10).text_color(t.dim).text_center().child("The party is resting"))))
    .child(div().id("jq-rail-scout").size(36).flex().items_center().justify_center().rounded(18).border_1().border_color(t.border)
      .cursor_pointer().hover((s) => s.bg(t.hover)).tooltip("Send the Scout to look for openings now")
      .on_click(() => v.sendScout()).child("🏹"));
}

const clock = (iso) => (typeof iso === "string" && iso.length >= 16 ? new Date(iso).toTimeString().slice(0, 5) : "");

// The Party view: what waits for your approval, the roster, the adventure log.
export function partyBody(v, t) {
  const s = v.snap, all = party.jobs(), visible = party.onScreen(all);
  const ready = s.applications.filter((a) => a.stage === "ready");
  const doneToday = (key) => all.filter((j) => j.member === key && j.state === "done" && j.endedAt && new Date(j.endedAt).toISOString().slice(0, 10) === s.today).length;

  const memberCard = (key) => {
    const m = MEMBERS[key], color = memberColor(m, t);
    const mine = visible.filter((j) => j.member === key), live = mine.filter(isLive);
    return v_flex().id(`jq-member-${key}`).w(236).flex_none().p(10).gap(6).rounded(10).border_1()
      .border_color(live.some((j) => j.state === "waiting") ? t.blocked : live.length ? color : t.border).bg(t.background)
      .child(h_flex().gap(10).items_center()
        .child(div().size(42).flex().flex_none().items_center().justify_center().rounded(21).border_2().border_color(color).bg(t.raised).text_size(21)
          .when(live.some((j) => j.state === "working"), (e) => e.loop("opacity", { from: 0.55, to: 1, period: 1400 }))
          .child(m.glyph))
        .child(v_flex().min_w(0).flex_1()
          .child(div().font_semibold().child(m.name))
          .child(div().text_size(11).text_color(t.muted).truncate().child(m.role))))
      .children(mine.slice(0, 3).map((j, i) => jobLine(v, t, j, `jq-member-${key}-job-${i}`)))
      .when(mine.length === 0, (e) => e.child(note("Resting", t)))
      .child(note(`${doneToday(key)} done today`, t));
  };

  const readyCard = (a) => v_flex().id(`jq-ready-${a.id}`).w(260).flex_none().p(10).gap(5).rounded(10).border_1().border_color(t.done).bg(t.background)
    .child(div().font_semibold().truncate().child(nameOf(a)))
    .child(note([fitOf(a) !== null && `fit ${fitOf(a)}`, a.verdict && `review: ${a.verdict}`, a.hasEmail && "email ready"].filter(Boolean).join(" · ") || "drafts ready", t))
    .child(row()
      .child(button(`jq-ready-open-${a.id}`, "Review", (cx) => { v.select(a.id, cx); v.show("pipeline", cx); }, t, true))
      .when(a.hasEmail, (e) => e.child(button(`jq-ready-mail-${a.id}`, "Open email", (cx) => v.openEmail(a, cx), t))));

  const logLine = (entry, i) => h_flex().id(`jq-log-${i}`).gap(8).items_start().text_size(11.5)
    .child(div().w(38).flex_none().text_color(t.dim).child(clock(entry.at)))
    .child(div().flex_1().min_w(0).child(entry.text));

  const threshold = minFit(s.intake);
  return scroller("jq-party-body")
    .child(h_flex().gap(10).items_center()
      .child(div().text_size(17).font_semibold().child("⚔ The Party"))
      .child(div().flex_1())
      .child(chip("jq-party-autopilot", party.autopilot() ? "Autopilot on" : "Autopilot off", party.autopilot(), () => v.toggleAutopilot(), t))
      .child(button("jq-party-scout", "🏹 Send the Scout", () => v.sendScout(), t)))
    .child(note(`They work by themselves, three at a time, in the “${party.PARTY_SPACE}” space. ${threshold === null ? "Scouted leads wait for you." : `Scouted leads that score ${threshold} or more are taken on.`} You approve and send. Click a job, or a tile on the rail, to watch that agent.`, t))
    .child(heading("Awaiting your approval", t, String(ready.length)))
    .when(ready.length === 0, (e) => e.child(note("Nothing yet. Finished applications land here.", t)))
    .child(h_flex().gap(10).flex_wrap().children(ready.map(readyCard)))
    .child(heading("The roster", t, `${all.filter(isLive).length} at work`))
    .child(h_flex().gap(10).flex_wrap().children(ROSTER.map(memberCard)))
    .child(heading("Adventure log", t, "newest first"))
    .when(s.log.length === 0, (e) => e.child(note("Nothing has happened yet.", t)))
    .children([...s.log].reverse().slice(0, 40).map(logLine));
}

// The Terminals view's strip: a tab per terminal Job Quest started, named for who and what for
// ("🔮 sage/hooli-ai-engineer"). The agent block under it shows the chosen one full size.
const AGENT_STATE = { working: "working", blocked: "waiting", done: "done", idle: "done" };

export function terminalTabs(v, t) {
  const list = party.folderTerminals(v.dir), shown = party.shownAddress();
  const tab = (entry, i) => {
    const on = entry.address === shown;
    const state = entry.job?.state ?? (entry.agent ? AGENT_STATE[entry.agent.status] ?? "waiting" : "starting");
    const close = entry.agent && h_flex().id(`jq-term-close-${i}`).size(16).flex_none().items_center().justify_center().rounded(4)
      .text_size(11).text_color(t.dim).hover((s) => s.bg(t.hover).text_color(t.foreground)).tooltip("Close this tab")
      .on_click((_e, cx) => { cx.stop_propagation(); entry.job ? v.dismissJob(entry.job) : v.closeTab(entry.agent.tab); });
    return h_flex().id(`jq-term-${i}`).h(28).px(9).gap(6).flex_none().items_center().rounded(7).cursor_pointer().text_size(11.5)
      .border_1().border_color(on ? t.accent : state === "waiting" ? t.blocked : t.border)
      .bg(on ? t.selected : t.raised).text_color(on ? t.foreground : t.muted).hover((s) => s.bg(t.hover))
      .tooltip(entry.agent ? entry.name : `${entry.name}: not started yet, maybe asking a first-run question`)
      .on_click(() => v.showTerminal(entry))
      .child(stateMark(t, { state }, `jq-term-${i}-state`).flex_none())
      .child(div().max_w(260).truncate().child(entry.name))
      .when(Boolean(close), (e) => e.child(close));
  };
  return h_flex().id("jq-term-tabs").size_full().px(8).gap(6).items_center().overflow_x_scrollbar().text_color(t.foreground)
    .children(list.map(tab))
    .when(list.length === 0, (e) => e.child(note("No Job Quest terminals are running. The party's and the buttons' agents show up here, one tab each.", t)));
}

// The beacon: one line for your everyday layout's status row. The party at a glance; click it
// to open Job Quest. Its copy also runs the party, so nothing waits for Job Quest to be open.
export function beacon(v, t) {
  const live = party.jobs().filter(isLive);
  const working = live.filter((j) => ["working", "starting"].includes(j.state)).length;
  const waiting = live.filter((j) => j.state === "waiting").length;
  const ready = v.snap ? v.snap.applications.filter((a) => a.stage === "ready").length : 0;
  const bits = [working && `${working} questing`, waiting && `${waiting} need you`, ready && `${ready} to approve`].filter(Boolean);
  const on = party.autopilot();
  return h_flex().id("jq-beacon").size_full().px(10).gap(8).items_center().text_size(11.5).text_color(t.muted)
    .child(h_flex().id("jq-beacon-open").flex_1().min_w(0).gap(6).items_center().cursor_pointer().rounded(5).px(4)
      .hover((s) => s.bg(t.hover)).tooltip("Open Job Quest").on_click(() => v.openQuest())
      .child(div().flex_none().text_color(t.foreground).child("⚔"))
      .when(working > 0, (e) => e.child(div().flex_none().text_color(t.working).frames(SPINNER, 90)))
      .child(div().min_w(0).truncate().text_color(waiting || ready ? t.blocked : t.muted)
        .child(bits.length ? bits.join(" · ") : "Job Quest: the party is resting")))
    .child(div().id("jq-beacon-auto").flex_none().px(5).rounded(4).cursor_pointer().text_size(10).font_semibold()
      .text_color(on ? t.done : t.dim).hover((s) => s.bg(t.hover)).tooltip("Autopilot: click to switch")
      .on_click(() => v.toggleAutopilot()).child(on ? "AUTO" : "PAUSED"));
}
