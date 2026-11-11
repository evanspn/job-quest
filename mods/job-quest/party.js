// The party: the agents Job Quest starts, one job each, handing over through the data folder.
//
// One copy runs it (the leader, chosen with a lease in shared state, so a layout and a panel
// open at once never start the same job twice). Every few seconds the leader matches each job to
// its agent in agents(), decides from the files whether the job is done, moves applications on
// (a good lead to drafting, finished drafts to ready) and starts the next jobs, at most
// MAX_PARTY at once, in a space of their own. Every copy reads the jobs from shared state to
// draw them, and any copy can show a job's agent in the layout's agent block.
import { run, hc, notify, playSound, agents, terminals, spaces, shared, setShared, layout, focused } from "herdr";
import {
  MEMBERS, DOING, plan, jobState, jobDone, jobKey, minFit, isLive, withStage, nameOf, fitOf, findNode,
  mentionsIn, handlesFor,
} from "./model.js";
import { saveApplication, appendLog } from "./store.js";
import * as prompts from "./prompts.js";

export const PARTY_KEY = "job-quest.party";         // { jobs: Job[] }
export const LEADER_KEY = "job-quest.leader";       // { token, at }
export const AUTOPILOT_KEY = "job-quest.autopilot"; // false: no new jobs start by themselves
export const SHOWN_KEY = "job-quest.shown";         // the address the agent block was last given
export const OUTBOX_KEY = "job-quest.outbox";       // [{ address, text, at }]: held until you leave that terminal
// Every agent Job Quest starts lives in this space. Earlier versions named it "Job Quest party".
export const PARTY_SPACE = "Job Quest";
const OLD_SPACES = ["Job Quest party"];
export const partySpace = () => spaces().find((s) => !s.machine && (s.name === PARTY_SPACE || OLD_SPACES.includes(s.name))) ?? null;
const AGENT_BLOCK = "jq-agent";
// In the Terminals view the agent is shown there, full size; the agent pane stays shut so one
// terminal is never drawn in two blocks of different sizes (it resizes back and forth: flashing).
export const TERMINALS_VIEW = "jq-terminals";
export const inTerminals = () => findNode(layout(), "jq-view")?.active === TERMINALS_VIEW;
const LEASE = 15000;           // a leader that has not renewed for this long is replaced
const CLOSE_AFTER = 90 * 1000; // a finished job's tab closes this long after, unless on screen
const STALE = 20 * 60 * 1000;  // a job waiting this long, or stopped unfinished, is closed
const STRAY = 10 * 60 * 1000;  // an untracked Job Quest agent quiet this long is closed
const KEPT = 40;               // finished jobs remembered

// A job: { key, member, kind, appId, title, tab, round, report, auto, state, startedAt,
//          endedAt, address, closed }. state: starting | working | waiting | done | failed.
export function jobs() {
  const held = shared(PARTY_KEY);
  return Array.isArray(held?.jobs) ? held.jobs : [];
}

export const autopilot = () => shared(AUTOPILOT_KEY) !== false;
export const setAutopilot = (on) => setShared(AUTOPILOT_KEY, on);

// Merged by key into what is shared now, so two copies writing at once lose nothing.
export function saveJobs(changed) {
  const byKey = new Map(jobs().map((job) => [job.key, job]));
  for (const job of changed) byKey.set(job.key, job);
  const all = [...byKey.values()];
  const live = all.filter(isLive), ended = all.filter((job) => !isLive(job)).slice(-KEPT);
  setShared(PARTY_KEY, { jobs: [...ended, ...live].sort((a, b) => a.startedAt - b.startedAt) });
}

// A job's agent: by its address once known; before that, by its tab name, never one another
// job has already claimed.
export function agentFor(job, list = agents()) {
  if (job.address) return list.find((a) => a.address === job.address) ?? null;
  const claimed = new Set(jobs().map((j) => j.address).filter(Boolean));
  return list.find((a) => a.tab_name === job.tab && !claimed.has(a.address)) ?? null;
}

// The address the agent block shows: the one this mod last chose, if it is still running.
export function shownAddress() {
  const chosen = shared(SHOWN_KEY);
  return agents().some((a) => a.address === chosen) ? chosen : null;
}

// Jobs worth drawing: running ones, then finished ones whose agent is still open.
export function onScreen(list = jobs(), running = agents()) {
  const open = (job) => !job.closed && agentFor(job, running);
  return [...list.filter(isLive), ...list.filter((job) => !isLive(job) && open(job)).reverse()];
}

export function describe(job) {
  const member = MEMBERS[job.member] ?? MEMBERS.archivist;
  return { member, doing: `${DOING[job.kind] ?? job.kind}${job.title ? `: ${job.title}` : ""}` };
}

// A tab's name says who and what for: "🔮 sage/hooli-ai-engineer", "🏹 scout/2026-11-11".
export function slugOf(fields) {
  if (fields.appId) return fields.appId;
  if (fields.kind === "scout") return (fields.report || "").replace(/^scout-|\.md$/g, "") || "search";
  return fields.kind;
}

function tabName(member, slug, taken) {
  const m = MEMBERS[member] ? member : "archivist";
  const base = `${MEMBERS[m].glyph} ${m}/${slug}`;
  let name = base;
  for (let n = 2; taken.includes(name); n += 1) name = `${base} ${n}`;
  return name;
}

// A new job, not yet started.
export function newJob(fields, now = Date.now()) {
  // Unique among every tab still open, so a new job never answers to an old job's agent.
  const taken = [...jobs().filter((job) => !job.closed).map((job) => job.tab), ...agents().map((a) => a.tab_name)];
  return {
    round: 0, report: "", appId: null, title: "", auto: false, address: null, endedAt: 0, closed: false,
    ...fields, tab: tabName(fields.member, slugOf(fields), taken), state: "starting", startedAt: now,
  };
}

// The leader is whoever holds a fresh lease; it renews it every third of the lease.
export function lead(token, now = Date.now()) {
  const held = shared(LEADER_KEY), mine = held?.token === token;
  if (!mine && held && now - held.at < LEASE) return false;
  if (!mine || now - held.at > LEASE / 3) setShared(LEADER_KEY, { token, at: now });
  return true;
}

// ---- showing a job's agent

export function show(job) {
  const agent = agentFor(job);
  if (!agent) {
    notify({ title: `${describe(job).member.name} has gone home`, body: "Its agent is no longer running.", level: "info" });
    return;
  }
  focusAddress(agent.address, true);
}

// Shows an agent: in the Terminals view there, else in the agent pane. `toggle`: on the one
// already in the open pane, hide the pane.
export function focusAddress(address, toggle = false) {
  const block = findNode(layout(), AGENT_BLOCK), terminalsView = inTerminals();
  if (toggle && !terminalsView && block && !block.hidden && shownAddress() === address) { run("layout.hide", { id: AGENT_BLOCK }); return; }
  setShared(SHOWN_KEY, address);
  run("agent.focus", { terminal: address });
  if (block && !terminalsView) run("layout.show", { id: AGENT_BLOCK });
}

// The next (or previous) agent on screen after the one shown: a key for swapping between them.
export function cycle(step) {
  const list = onScreen().filter((job) => agentFor(job));
  if (list.length === 0) return;
  const at = list.findIndex((job) => agentFor(job)?.address === shownAddress());
  const next = list[(at + step + list.length) % list.length];
  focusAddress(agentFor(next).address);
}

// Every terminal Job Quest started (those in the data folder), oldest first, each with its
// job when the party knows it: what the Terminals view's tabs list.
export function folderTerminals(dir, list = jobs()) {
  const running = agents();
  return terminals().filter((t) => t.state === "live" && t.cwd === dir).map((t) => {
    const agent = running.find((a) => a.address === t.address) ?? null;
    const job = list.find((j) => j.address === t.address) ?? (agent && list.find((j) => !j.address && j.tab === agent.tab_name)) ?? null;
    return { address: t.address, agent, job, name: job?.tab ?? agent?.tab_name ?? t.name ?? t.address };
  });
}

// Closes a finished job's tab.
export function dismiss(job) {
  const agent = agentFor(job);
  if (agent) run("tab.close", { id: agent.tab, confirmed: true });
  saveJobs([{ ...job, closed: true, state: isLive(job) ? "done" : job.state, endedAt: job.endedAt || Date.now() }]);
}

// ---- the chat

// The jobs whose agents are running and can hear a message, newest first.
export function listeners(list = jobs(), running = agents()) {
  return list.filter((job) => isLive(job) && agentFor(job, running)).reverse();
}

// The running job a chat message came from: its member, on its application.
export function senderOf(message, list = listeners()) {
  return list.find((job) => job.member === message.from && (!message.appId || job.appId === message.appId)) ?? null;
}

// Who is running, for the Guildmaster: "@sage/northwind (researching), @scout (scouting for openings)".
export function roster(list = listeners()) {
  return handlesFor(list.filter((j) => j.kind !== "lead")).map((h) => `@${h.handle} (${(DOING[h.job.kind] ?? h.job.kind).toLowerCase()})`).join(", ");
}

const leadJob = (list = listeners()) => list.find((j) => j.kind === "lead") ?? null;

// Who a chat message reaches, from its @mentions (`to` for a worker's message, the text for
// yours). No mention, or @guildmaster: the Guildmaster. @everyone / @all: every running worker.
// A handle or role that is running: those workers. A role (and application) that is not: a new
// worker in that role, started to act on it. Anything else is unknown, and nothing is sent.
// { lead, everyone, jobs, revive: [{ member, app, earlier }], unknown }
export function resolve(text, chat = [], applications = []) {
  const live = listeners(), handles = handlesFor(live), named = mentionsIn(text);
  const out = { lead: false, everyone: false, jobs: [], revive: [], unknown: [] };
  if (!named.length) { out.lead = true; return out; }
  for (const name of named) {
    if (["everyone", "all"].includes(name)) { out.everyone = true; out.jobs = [...live]; continue; }
    if (name === "guildmaster") { out.lead = true; continue; }
    const hits = handles.filter((h) => h.handle === name || h.job.member === name || (name.includes("/") && h.handle.startsWith(name)));
    if (hits.length) { for (const h of hits) if (!out.jobs.includes(h.job)) out.jobs.push(h.job); continue; }
    const [member, part = ""] = name.split("/");
    const app = part ? applications.find((a) => a.id === part || a.id.startsWith(`${part}-`) || a.id.startsWith(part)) ?? null : null;
    if (!MEMBERS[member] || member === "guildmaster" || (part && !app)) { out.unknown.push(name); continue; }
    const earlier = [...chat].reverse().find((m) => m.from === member && (!app || m.appId === app.id)) ?? null;
    out.revive.push({ member, app, earlier });
  }
  return out;
}

// What a resolved message is called in the chat: "the Guildmaster", "everyone", "@sage/northwind",
// "a new sage".
export function recipients(target) {
  const parts = [];
  if (target.lead) parts.push("the Guildmaster");
  if (target.everyone) parts.push("everyone");
  else parts.push(...handlesFor(target.jobs).map((h) => `@${h.handle}`));
  parts.push(...target.revive.map((r) => `a new ${r.member}${r.app ? `/${r.app.id.split("-")[0]}` : ""}`));
  return parts.join(", ");
}

// Delivers a message as resolved: typed into running workers' terminals, the Guildmaster told
// (or started, for your message), new workers started for roles that are not running. `from`:
// "me" or a member's key. Returns the addresses it could not reach.
export async function route(v, target, text, from = "me") {
  const tag = from === "me" ? "[Chat]" : `[Chat from the ${MEMBERS[from]?.name ?? from}]`;
  const failed = [], reached = new Set();
  const send = async (job, line) => {
    const address = agentFor(job)?.address;
    if (!address || reached.has(address)) return;
    reached.add(address);
    try {
      if ((await deliverOrHold(address, line)) === "held") {
        notify({ title: `Held for ${describe(job).member.name}`, body: "You are typing in its terminal; it gets the message when you leave.", level: "info" });
      }
    } catch { failed.push(address); }
  };
  for (const job of target.jobs) await send(job, `${tag} ${text}`);
  if (target.lead) {
    const lead = leadJob();
    if (lead) await send(lead, `${tag} ${text} (running now: ${roster() || "nobody"})`);
    else if (from === "me") {
      const job = newJob({ key: jobKey("guildmaster", "lead", null, Date.now()), member: "guildmaster", kind: "lead" });
      launch(v, job, prompts.guildmaster(v.dir, text, roster()));
    }
  }
  for (const { member, app, earlier } of target.revive) {
    if (app && jobs().some((j) => j.appId === app.id && isLive(j) && j.kind !== "lead")) continue; // someone is on it
    const job = newJob({ key: jobKey(member, "reply", app?.id, Date.now()), member, kind: "reply", appId: app?.id ?? null, title: app ? nameOf(app) : "" });
    launch(v, job, prompts.followUp(v.dir, member, app, earlier?.text ?? "", text, from === "me" ? "me" : `the ${MEMBERS[from]?.name ?? from}`));
  }
  return failed;
}

// ---- hands off where the person is

// The terminal that has the person's keyboard (a pane, the agent block, the Terminals view).
export const typingIn = (address) => Boolean(address) && focused()?.terminal === address;

// The space the person is in, and the tab they are on there.
function whereYouAre() {
  const at = focused(), space = spaces().find((s) => (at?.space ? s.id === at.space : s.active));
  return { space: space ?? null, tab: at?.tab ?? space?.tabs?.find((t) => t.active)?.id ?? null };
}

export const outbox = () => (Array.isArray(shared(OUTBOX_KEY)) ? shared(OUTBOX_KEY) : []);

// Delivers now, unless the person is typing in that terminal: then it waits in the outbox (the
// leader delivers it once they leave), so nothing lands on top of what they are writing.
// Returns "sent" or "held".
export async function deliverOrHold(address, text) {
  if (typingIn(address)) {
    setShared(OUTBOX_KEY, [...outbox(), { address, text, at: Date.now() }]);
    return "held";
  }
  await deliver(address, text);
  return "sent";
}

// The leader's part: deliver what waited, in order, once the person has left the terminal;
// drop what was for a terminal that is gone.
export async function flushOutbox(running = agents()) {
  const held = outbox();
  if (!held.length) return;
  const keep = [];
  for (const item of held) {
    if (!running.some((a) => a.address === item.address)) continue;
    if (typingIn(item.address)) { keep.push(item); continue; }
    try { await deliver(item.address, item.text); } catch { keep.push(item); }
  }
  setShared(OUTBOX_KEY, keep);
}

// Types a message into an agent's terminal and presses Enter.
export async function deliver(address, text) {
  const r = await hc(["send", address, text]);
  if (r.code !== 0) throw new Error((r.stderr || r.stdout || "hc send failed").trim().split("\n")[0]);
}

// ---- starting a job

// Starts the chosen coding agent on a job, in the Job Quest space, so the person's own tabs are
// left alone. Claude Code starts in auto mode: its classifier approves routine actions, and the
// deny rules in the data folder's .claude/settings.json (no sending mail) still hold.
export function launch(v, job, task) {
  const agent = v.agent();
  if (!agent) {
    notify({ title: "No coding agent found", body: "Install one (Claude Code, Codex, ...) so the party can work.", level: "error" });
    return false;
  }
  const argv = agent.key === "claude" ? [...agent.run, "--permission-mode", "auto"] : agent.run;
  const args = { folder: v.dir, argv, task };
  const space = partySpace(), here = whereYouAre();
  if (space) {
    run("tab.new", { name: job.tab, space: space.id, ...args });
    // A new tab may become the shown one: if you were in that space, put your tab back.
    if (here.space?.id === space.id && here.tab) run("tab.select", { id: here.tab });
  } else {
    // space.new shows the new space: name its tab, then go back to where the person was.
    const back = spaces().find((s) => s.active);
    run("space.new", { name: PARTY_SPACE, tab: job.tab, ...args });
    run("tab.rename", { name: job.tab });
    if (back) run("space.select", { id: back.id });
  }
  saveJobs([job]);
  return true;
}

// ---- keeping the space tidy

// Most urgent first: needs you, working, setting out, then the finished; ties oldest first.
const RANK = { listening: -1, waiting: 0, stopped: 1, working: 2, starting: 3, done: 4, failed: 4 };

// The one tab.move that brings the space closest to that order, or null when it is in order.
// One move a round: the space settles over a few rounds without ever thrashing.
export function nextMove(tabs, jobOfTab) {
  const ranked = tabs.map((tab, i) => {
    const job = jobOfTab(tab.id);
    return { tab, rank: job ? RANK[job.state] ?? 4 : 4, started: job?.startedAt ?? Infinity, i };
  });
  const wanted = [...ranked].sort((a, b) => a.rank - b.rank || a.started - b.started || a.i - b.i);
  const at = wanted.findIndex((entry, i) => entry.tab.id !== tabs[i].id);
  return at < 0 ? null : { id: wanted[at].tab.id, index: at + 1 };
}

// An agent the person is using: shown in the agent block, typed in, or on the tab they are on.
function inYourWay(agent) {
  if (!agent) return false;
  return agent.address === shownAddress() || typingIn(agent.address) || whereYouAre().tab === agent.tab;
}

// ---- the leader's round

const say = (member, appId, text, now) => ({ at: new Date(now).toISOString(), member, appId, text });

// One round: follow the running jobs, then move applications on and start what comes next.
// Returns whether it wrote to the folder, so the caller reloads.
export async function round(v, now = Date.now()) {
  const snap = v.snap;
  if (!snap) return false;
  const running = agents(), changed = [], log = [];
  const appOf = (id) => snap.applications.find((a) => a.id === id) ?? null;

  for (const job of jobs()) {
    const agent = agentFor(job, running);
    if (!isLive(job)) {
      // Close a finished job's tab once it has had time to be seen, and one that stopped
      // unfinished once it has gone stale; never the one on screen.
      const wait = job.state === "done" ? CLOSE_AFTER : STALE;
      if (!job.closed && now - job.endedAt > wait && !inYourWay(agent)) {
        if (agent) run("tab.close", { id: agent.tab, confirmed: true });
        changed.push({ ...job, closed: true });
      }
      continue;
    }
    // A party job that has waited or sat stopped too long is stale: close it; its step shows Start … now.
    if (job.auto && ["waiting", "stopped"].includes(job.state) && job.waitingSince && now - job.waitingSince > STALE && !inYourWay(agent)) {
      const { member, doing } = describe(job);
      if (agent) run("tab.close", { id: agent.tab, confirmed: true });
      changed.push({ ...job, state: "failed", endedAt: now, closed: true });
      log.push(say(job.member, job.appId, `${member.glyph} ${member.name} went stale and was sent home: ${doing.toLowerCase()}`, now));
      continue;
    }
    const next = { ...job, address: job.address ?? agent?.address ?? null };
    const done = jobDone(job, appOf(job.appId), snap.reports);
    const asked = snap.chat.some((m) => m.from === job.member && (!job.appId || m.appId === job.appId) && Date.parse(m.at) >= job.startedAt);
    next.state = jobState(next, agent, done, now, asked);
    if (next.state === job.state && next.address === job.address) continue;
    const { member, doing } = describe(job);
    if (next.state === "done" || next.state === "failed") next.endedAt = now;
    next.waitingSince = ["waiting", "stopped"].includes(next.state) ? job.waitingSince || now : 0;
    if (next.state === "done") log.push(say(job.member, job.appId, `${member.glyph} ${member.name} finished ${doing.toLowerCase()}`, now));
    if (next.state === "failed") {
      log.push(say(job.member, job.appId, `${member.glyph} ${member.name} stopped without finishing ${doing.toLowerCase()}`, now));
      if (job.auto) notify({ title: `${member.glyph} ${member.name} couldn't finish`, body: `${doing}. Its tab says why; start the step again from the application.`, level: "error" });
    }
    if (next.state === "waiting" && job.state !== "waiting" && job.auto) {
      notify({ title: `${member.glyph} ${member.name} needs you`, body: agent?.status === "blocked" ? `${doing}: it is asking permission in its terminal.` : `${doing}: it asked you something in the chat.`, level: "warning" });
    }
    if (next.state === "stopped" && job.state !== "stopped") {
      log.push(say(job.member, job.appId, `${member.glyph} ${member.name} stopped before finishing ${doing.toLowerCase()}`, now));
    }
    changed.push(next);
  }
  if (changed.length) saveJobs(changed);

  // Strays: Job Quest agents no job tracks (started before tracking, or lost track of), in any
  // space. Closed once quiet for a while, when the tab holds nothing else and is not in your way.
  const tracked = new Set(jobs().filter((j) => !j.closed).map((j) => j.address).filter(Boolean));
  const tabInfo = new Map(spaces().flatMap((s) => (s.tabs ?? []).map((tab) => [tab.id, tab])));
  for (const t of terminals()) {
    if (t.state !== "live" || t.cwd !== v.dir || tracked.has(t.address)) continue;
    const agent = running.find((a) => a.address === t.address);
    const tab = agent && tabInfo.get(agent.tab);
    if (!agent || !["idle", "done"].includes(agent.status) || !tab || tab.panes > 1 || inYourWay(agent)) continue;
    if (now - (tab.changed_at ?? 0) < STRAY) continue;
    run("tab.close", { id: agent.tab, confirmed: true });
    log.push(say("guildmaster", null, `🧹 Closed a finished tab: ${agent.tab_name || t.address}`, now));
  }

  // The space: its current name, and its tabs in order of what needs the person.
  const space = partySpace();
  if (space && space.name !== PARTY_SPACE) run("space.rename", { id: space.id, name: PARTY_SPACE });
  if (space?.tabs?.length > 1 && whereYouAre().space?.id !== space.id) {
    const all = jobs(), byTab = new Map();
    for (const job of all) {
      const agent = agentFor(job, running);
      if (agent && !job.closed) byTab.set(agent.tab, job);
    }
    const move = nextMove(space.tabs, (id) => byTab.get(id));
    if (move) run("tab.move", move);
  }

  await flushOutbox(running);

  // Toast what workers post to the chat, once each; what was there before this copy started is old.
  if (!v.chatSeen) v.chatSeen = new Set(snap.chat.map((m) => m.id));
  for (const message of snap.chat) {
    if (v.chatSeen.has(message.id)) continue;
    v.chatSeen.add(message.id);
    if (message.from === "you") continue;
    // A worker's message to other workers (the Guildmaster passing something on) is routed
    // like yours, and not toasted.
    if (mentionsIn(message.to).length) {
      await route(v, resolve(message.to, snap.chat, snap.applications), message.text, message.from);
      continue;
    }
    const member = MEMBERS[message.from];
    notify({ title: `${member?.glyph ?? "💬"} ${member?.name ?? message.from}${message.appId ? ` · ${message.appId}` : ""}`, body: message.text.slice(0, 240), level: "info" });
  }

  let wrote = false;
  if (autopilot()) {
    const today = snap.today, report = `scout-${today}.md`;
    const scoutDue = snap.reports.includes(report) ? null : { key: jobKey("scout", "scout", today), report };
    const todo = plan(snap, jobs(), { threshold: minFit(snap.intake), scoutDue });

    for (const { app, stage, reason } of todo.advances) {
      const notes = stage === "closed" ? [app.notes, `Closed by the party: ${reason}.`].filter(Boolean).join(" ") : app.notes;
      await saveApplication(v.dir, { ...withStage(app, stage, today), notes });
      wrote = true;
      if (stage === "closed") {
        log.push(say("sage", app.id, `📪 Closed ${nameOf(app)}: ${reason}`, now));
        notify({ title: `Closed ${nameOf(app)}`, body: `${reason[0].toUpperCase()}${reason.slice(1)}. Add it and move it back to Party at work to reopen.`, level: "info" });
      } else if (stage === "drafting") {
        const fit = fitOf(app);
        log.push(say("scout", app.id, `⚔ The party takes on ${nameOf(app)}${fit !== null ? ` (fit ${fit})` : ""}`, now));
      } else {
        log.push(say("herald", app.id, `🏁 ${nameOf(app)} is ready for your approval`, now));
        notify({ title: "Ready for your approval", body: `${nameOf(app)}: resume, cover letter, review and email are in. Nothing is sent until you send it.`, level: "success" });
        playSound("done");
      }
    }
    for (const { app, reason } of todo.stuck) {
      if (v.warned.has(app.id)) continue;
      v.warned.add(app.id);
      notify({ title: `The party is stuck on ${app.company}`, body: `It ${reason}.`, level: "warning" });
    }
    // Only one start until the party's space exists, so two rounds never make two spaces.
    const hasSpace = spaces().some((s) => s.name === PARTY_SPACE && !s.machine);
    for (const step of hasSpace ? todo.starts : todo.starts.slice(0, 1)) {
      const app = appOf(step.appId);
      const job = newJob({ ...step, title: app ? nameOf(app) : "", auto: true }, now);
      if (!launch(v, job, prompts.forJob(v.dir, job, app, today))) break;
      const { member, doing } = describe(job);
      log.push(say(job.member, job.appId, `${member.glyph} ${member.name} sets out: ${doing.toLowerCase()}`, now));
    }
  }
  if (log.length) { await appendLog(v.dir, log); wrote = true; }
  return wrote;
}
