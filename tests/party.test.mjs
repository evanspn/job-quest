// The party: its rules (model.js), and rounds of the leader over a real temporary folder with
// stand-ins for Herdr's modules. Agents are faked by putting entries in world.running.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { world, forgetCopies } from "./stubs/herdr.mjs";
import { find } from "./stubs/gpui-kit.mjs";
import JobQuest from "../mods/job-quest/main.js";
import * as party from "../mods/job-quest/party.js";
import {
  nextStep, plan, jobState, jobDone, readVerdict, minFit, MAX_PARTY, REVIEW_ROUNDS, START_TIMEOUT,
} from "../mods/job-quest/model.js";
import * as prompts from "../mods/job-quest/prompts.js";

const today = "2026-11-11";
const base = {
  stage: "drafting", url: "https://x", hasPosting: true, hasResearch: false, hasResume: false, hasCoverLetter: false,
  hasReview: false, hasEmail: false, hasFollowup: false, hasPrep: false, verdict: "", round: 0, fit: "", followUpAt: "",
  contactEmail: "jane@acme.com", emailTo: "", attachments: [], missingAttachments: [],
};
const mailed = { hasEmail: true, emailTo: "Jane <jane@acme.com>", attachments: ["R.pdf"], missingAttachments: [] };
const app = (fields) => ({ id: "acme", company: "Acme", role: "Dev", ...base, ...fields });

// ---- rules

test("an application in drafting goes Sage, Scribe, Inquisitor, Herald, then to you", () => {
  const step = (fields) => nextStep(app(fields), today, 70);
  assert.deepEqual(step({}), { member: "sage", kind: "research" });
  assert.deepEqual(step({ hasResearch: true }), { member: "scribe", kind: "draft" });
  assert.deepEqual(step({ hasResearch: true, hasResume: true }), { member: "scribe", kind: "draft" });
  const drafted = { hasResearch: true, hasResume: true, hasCoverLetter: true };
  assert.deepEqual(step(drafted), { member: "inquisitor", kind: "review" });
  assert.deepEqual(step({ ...drafted, hasReview: true, verdict: "revise", round: 1 }), { member: "scribe", kind: "revise" });
  assert.deepEqual(step({ ...drafted, hasReview: true, verdict: "revised", round: 1 }), { member: "inquisitor", kind: "review" });
  // After the last round the drafts go on whatever the verdict: you decide.
  assert.deepEqual(step({ ...drafted, hasReview: true, verdict: "revise", round: REVIEW_ROUNDS }), { member: "herald", kind: "package" });
  assert.deepEqual(step({ ...drafted, hasReview: true, verdict: "pass", round: 1 }), { member: "herald", kind: "package" });
  assert.deepEqual(step({ ...drafted, hasReview: true, verdict: "pass", round: 1, hasEmail: true }), { member: "herald", kind: "package" }, "an email with no To: or attachments is not done");
  assert.deepEqual(step({ ...drafted, hasReview: true, verdict: "pass", round: 1, ...mailed, missingAttachments: ["R.pdf"] }), { member: "herald", kind: "package" });
  assert.deepEqual(step({ ...drafted, hasReview: true, verdict: "pass", round: 1, ...mailed }), { advance: "ready" });
  assert.deepEqual(step({ url: "", hasPosting: false }), { member: "sage", kind: "research" }, "the Sage finds the posting itself");
  assert.match(step({ url: "", hasPosting: false, hasResearch: true }).stuck, /could not find it/);
  // No address to send it to: a full stop after research, before anything is drafted.
  assert.match(step({ hasResearch: true, contactEmail: "" }).stuck, /no contact email/);
  assert.match(step({ hasResearch: true, contactEmail: "jobs at acme" }).stuck, /no contact email/);
  assert.match(step({ ...drafted, contactEmail: "" }).stuck, /no contact email/, "not even the review or the email");
});

test("leads are taken on by fit, follow-ups and interview prep come by themselves", () => {
  assert.deepEqual(nextStep(app({ stage: "lead", fit: "82" }), today, 70), { advance: "drafting" });
  assert.equal(nextStep(app({ stage: "lead", fit: "60" }), today, 70), null);
  assert.equal(nextStep(app({ stage: "lead", fit: "" }), today, 70), null, "a lead you added yourself waits for you");
  assert.equal(nextStep(app({ stage: "lead", fit: "99" }), today, null), null, "autoFit off");
  assert.deepEqual(nextStep(app({ stage: "applied", followUpAt: today }), today, 70), { member: "herald", kind: "followup" });
  assert.equal(nextStep(app({ stage: "applied", followUpAt: "2026-12-01" }), today, 70), null);
  assert.deepEqual(nextStep(app({ stage: "interview" }), today, 70), { member: "coach", kind: "prep" });
  assert.equal(nextStep(app({ stage: "ready" }), today, 70), null);
});

test("minFit and readVerdict read loose text", () => {
  assert.equal(minFit({ autoFit: "" }), 70);
  assert.equal(minFit({ autoFit: "85 or so" }), 85);
  assert.equal(minFit({ autoFit: "Off" }), null);
  assert.deepEqual(readVerdict("Verdict: Revise\nRound: 2\n\n## Must fix"), { verdict: "revise", round: 2 });
  assert.deepEqual(readVerdict("Verdict: revised\nRound: 1"), { verdict: "revised", round: 1 });
  assert.deepEqual(readVerdict(null), { verdict: "", round: 0 });
});

test("plan fills the party up to its size, one job per application, never the same job twice", () => {
  const snap = { today, applications: ["a", "b", "c", "d"].map((id) => app({ id })) };
  const first = plan(snap, [], { threshold: 70, scoutDue: null });
  assert.equal(first.starts.length, MAX_PARTY);
  assert.ok(first.starts.every((s) => s.member === "sage"));
  const running = first.starts.map((s) => ({ ...s, state: "working" }));
  assert.equal(plan(snap, running, { threshold: 70, scoutDue: null }).starts.length, 0, "full");
  const ended = running.map((j) => ({ ...j, state: "failed" }));
  const again = plan(snap, ended, { threshold: 70, scoutDue: null });
  assert.deepEqual(again.starts.map((s) => s.appId), ["d"], "a failed step is not retried by itself");
  const scouting = plan(snap, [], { threshold: 70, scoutDue: { key: "scout:scout:x:0", report: "r.md" } });
  assert.equal(scouting.starts[0].member, "scout");
  assert.equal(scouting.starts.length, MAX_PARTY);
});

test("a job's state comes from its agent and its files", () => {
  const job = { startedAt: 0, address: null };
  assert.equal(jobState(job, null, false, 1000), "starting");
  assert.equal(jobState(job, null, false, START_TIMEOUT + 1), "failed");
  assert.equal(jobState(job, { status: "working" }, true, 0), "working");
  assert.equal(jobState(job, { status: "blocked" }, false, 0), "waiting");
  assert.equal(jobState(job, { status: "idle" }, false, 0), "waiting", "it stopped to ask something");
  assert.equal(jobState(job, { status: "done" }, true, 0), "done");
  assert.equal(jobState({ ...job, address: "t1" }, null, false, 0), "failed", "closed before finishing");
  assert.equal(jobState({ ...job, address: "t1" }, null, null, 0), "done", "a job with no check ends with its agent");
  assert.equal(jobDone({ kind: "review", round: 1 }, app({ verdict: "pass", round: 1 })), false, "the old review");
  assert.equal(jobDone({ kind: "review", round: 1 }, app({ verdict: "pass", round: 2 })), true);
});

test("every party prompt names its output file and forbids sending", () => {
  const row = app({ hasResearch: true, round: 1, hasReview: true });
  assert.match(prompts.research("/d", app({ url: "", hasPosting: false })), /find the posting yourself/);
  const files = { scout: "reports/r.md", research: "research.md", draft: "resume.md", revise: "Verdict: revised", review: "review.md", package: "email.md", followup: "followup.md", prep: "prep.md" };
  for (const [kind, file] of Object.entries(files)) {
    const task = prompts.forJob("/d", { kind, report: "r.md" }, row, today);
    assert.ok(task.includes(file), `${kind} names ${file}`);
    assert.match(task, /never send/i, kind);
  }
  assert.match(prompts.review("/d", row), /Round: 2/);
  assert.doesNotMatch(prompts.draft("/d", row, "both"), /"stage": "ready"/, "the panel moves stages, not the Scribe");
});

// ---- the leader, over a folder

const cx = {
  notify() {}, stop_propagation() {},
  spawn(task) { Promise.resolve(task(cx)).catch(() => {}); },
  timer: { every() {}, after() {} },
};

let dir;

async function until(check, what) {
  for (let i = 0; i < 200; i += 1) {
    try { if (await check()) return; } catch { /* not yet */ }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`timed out waiting for ${what}`);
}

async function copy(part) {
  world.props = part ? { part } : null;
  const view = new JobQuest();
  view.init({}, cx);
  await until(() => view.snap, "the first read");
  return view;
}

async function seed(id, files) {
  await mkdir(join(dir, "applications", id), { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, "applications", id, name), text);
}

const json = async (path) => JSON.parse(await readFile(join(dir, path), "utf8"));
const started = () => world.ran.filter((r) => r.name === "tab.new" || r.name === "space.new");

// A round as the timer would run it, then a fresh read of the folder.
async function round(view) {
  const wrote = await party.round(view);
  if (wrote) await view.saved(cx);
  else await view.reload(cx);
}

beforeEach(async () => {
  forgetCopies();
  const home = await mkdtemp(join(tmpdir(), "job-quest-party-"));
  Object.assign(world, {
    home, terminals: [], shared: {}, ran: [], execs: [], notices: [], exec: null, props: null, layout: null, running: [], sounds: [], hcs: [],
    spaces: [{ id: "s1", name: "~", active: true, machine: null }],
    agents: [{ key: "claude", name: "Claude Code", run: ["claude"], installed: true }],
  });
  dir = join(home, "job-quest-data");
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  await mkdir(join(dir, "reports"), { recursive: true });
  await writeFile(join(dir, "reports", `scout-${new Date().toISOString().slice(0, 10)}.md`), "searched\n");
});

test("the party carries an application from drafting to your approval, then stops", async () => {
  await seed("acme", { "application.json": JSON.stringify({ company: "Acme", role: "Dev", stage: "drafting", contactEmail: "jane@acme.com" }), "posting.md": "Build things\n" });
  const view = await copy("rail");
  await until(() => view.snap.applications.length === 1, "the application");

  // 1. The Sage sets out in a space of its own, and the person is taken back where they were.
  await round(view);
  assert.deepEqual(started().map((r) => r.name), ["space.new"]);
  const first = started()[0].args;
  assert.equal(first.name, party.PARTY_SPACE);
  assert.match(first.task, /You are the Sage/);
  assert.deepEqual(world.ran.at(-1), { name: "space.select", args: { id: "s1" } });
  const [sage] = party.jobs();
  assert.equal(sage.state, "starting");
  world.spaces.push({ id: "s2", name: party.PARTY_SPACE, active: false, machine: null });

  // 2. Its agent appears and works; nothing else starts for this application meanwhile.
  world.running = [{ address: "t1", tab: "tab1", tab_name: sage.tab, status: "working" }];
  await round(view);
  assert.equal(party.jobs()[0].state, "working");
  assert.equal(party.jobs()[0].address, "t1");
  assert.equal(started().length, 1);

  // 3. research.md appears and the agent goes idle: done, and the Scribe sets out.
  await writeFile(join(dir, "applications/acme/research.md"), "# Acme\n");
  world.running[0].status = "done";
  await view.reload(cx); // the app's watchFolder does this as the file lands
  await round(view);
  assert.equal(party.jobs().find((j) => j.member === "sage").state, "done");
  assert.equal(started().length, 2);
  assert.deepEqual(started()[1].args.space, "s2", "the next ones join the party's space");
  assert.match(started()[1].args.task, /You are the Scribe/);

  // 4. Fast-forward: drafts, a passing review, the email. The application moves to ready.
  world.running = [];
  party.saveJobs(party.jobs().map((j) => ({ ...j, state: "done" })));
  await writeFile(join(dir, "applications/acme/resume.md"), "r\n");
  await writeFile(join(dir, "applications/acme/cover-letter.md"), "c\n");
  await writeFile(join(dir, "applications/acme/review.md"), "Verdict: pass\nRound: 1\n");
  await writeFile(join(dir, "applications/acme/email.md"), "To: Jane <jane@acme.com>\nSubject: Hi\nAttachments: Me-Resume.pdf\n\nBody\n");
  await view.reload(cx);
  await round(view);
  assert.equal((await json("applications/acme/application.json")).stage, "drafting", "the PDF it names is not there yet");
  // The Herald was sent back to finish it; say it has.
  party.saveJobs(party.jobs().map((j) => ({ ...j, state: "done" })));
  await writeFile(join(dir, "applications/acme/Me-Resume.pdf"), "%PDF");
  await view.reload(cx);
  await round(view);
  assert.equal((await json("applications/acme/application.json")).stage, "ready");
  assert.ok(world.notices.some((n) => n.title === "Ready for your approval"));
  assert.deepEqual(world.sounds, ["done"]);
  const log = await readFile(join(dir, "log.jsonl"), "utf8");
  assert.match(log, /Sage sets out/);
  assert.match(log, /ready for your approval/);

  // 5. Ready is yours: the party starts nothing more.
  const before = started().length;
  await round(view);
  assert.equal(started().length, before);
});

test("a scouted lead with a good fit is taken on; with autopilot off nothing starts", async () => {
  await seed("good", { "application.json": JSON.stringify({ company: "Good", stage: "lead", fit: "88" }), "posting.md": "p\n" });
  await seed("meh", { "application.json": JSON.stringify({ company: "Meh", stage: "lead", fit: "55" }) });
  const view = await copy("rail");
  await until(() => view.snap.applications.length === 2, "both");

  party.setAutopilot(false);
  await round(view);
  assert.equal(started().length, 0);
  assert.equal((await json("applications/good/application.json")).stage, "lead");

  party.setAutopilot(true);
  await round(view);
  assert.equal((await json("applications/good/application.json")).stage, "drafting");
  assert.equal((await json("applications/meh/application.json")).stage, "lead");
  await round(view);
  assert.match(started()[0].args.task, /pull in everything about Good/);
});

test("the Scout goes out once a day when today's report is missing", async () => {
  const view = await copy("rail");
  const report = `scout-${view.snap.today}.md`;
  await round(view);
  assert.equal(started().length, 0, "today's report exists");
  await writeFile(join(dir, "reports", report), "");
  const { rm } = await import("node:fs/promises");
  await rm(join(dir, "reports", report));
  await view.reload(cx);
  await round(view);
  assert.equal(started().length, 1);
  assert.match(started()[0].args.task, new RegExp(`reports/${report}`));
});

test("only the copy holding the lease runs the party", async () => {
  const first = await copy("rail"), second = await copy("panel");
  assert.equal(party.lead(first.token), true);
  assert.equal(party.lead(second.token), false);
  assert.equal(party.lead(second.token, Date.now() + 20000), true, "a stale lease is taken over");
});

test("the rail shows the party's agents and swaps the agent block between them", async () => {
  world.layout = JSON.parse(await readFile(new URL("../layouts/job-quest.json", import.meta.url), "utf8"));
  const view = await copy("rail");
  party.saveJobs([
    party.newJob({ key: "a", member: "sage", kind: "research", appId: "acme", title: "Acme · Dev" }),
    party.newJob({ key: "b", member: "scribe", kind: "draft", appId: "beta", title: "Beta · Dev" }),
  ]);
  const [sage, scribe] = party.jobs();
  world.running = [
    { address: "t1", tab: "tab1", tab_name: sage.tab, status: "working" },
    { address: "t2", tab: "tab2", tab_name: scribe.tab, status: "blocked" },
  ];
  const tile = (key) => find(view.render(cx), `jq-rail-${key}`);
  assert.ok(tile("a") && tile("b"));
  tile("b").click({}, cx);
  assert.deepEqual(world.ran.slice(-2), [
    { name: "agent.focus", args: { terminal: "t2" } },
    { name: "layout.show", args: { id: "jq-agent" } },
  ]);
  party.cycle(1);
  assert.deepEqual(world.ran.at(-2), { name: "agent.focus", args: { terminal: "t1" } });
  // Clicking the one shown, with the block open, hides it.
  world.layout = { ...world.layout, children: world.layout.children.map((c) => c.id !== "jq-body" ? c : { ...c, children: c.children.map((n) => n.id === "jq-agent" ? { ...n, hidden: false } : n) }) };
  tile("a").click({}, cx);
  assert.deepEqual(world.ran.at(-1), { name: "layout.hide", args: { id: "jq-agent" } });
});

test("a button's agent joins the party where you are, and its tab name finds it", async () => {
  await seed("acme", { "application.json": JSON.stringify({ company: "Acme", role: "Dev", stage: "lead" }) });
  world.shared["job-quest.selected"] = "acme";
  const view = await copy("detail");
  view.draft(view.application(), "both", cx);
  const made = world.ran.find((r) => r.name === "space.new");
  assert.equal(made.args.name, party.PARTY_SPACE, "in the Job Quest space, like every agent it starts");
  assert.deepEqual(made.args.argv, ["claude", "--permission-mode", "auto"]);
  const [job] = party.jobs();
  assert.equal(job.tab, made.args.tab);
  assert.equal(job.member, "scribe");
  assert.equal(job.auto, false);
});

test("the Terminals view lists Job Quest's terminals as named tabs and shows one, never in two blocks", async () => {
  world.layout = JSON.parse(await readFile(new URL("../layouts/job-quest.json", import.meta.url), "utf8"));
  const view = await copy("tabs");
  const sage = party.newJob({ key: "a", member: "sage", kind: "research", appId: "hooli-ai-engineer" });
  const scout = party.newJob({ key: "b", member: "scout", kind: "scout", report: "scout-2026-11-11.md" });
  assert.equal(sage.tab, "🔮 sage/hooli-ai-engineer");
  assert.equal(scout.tab, "🏹 scout/2026-11-11");
  party.saveJobs([sage, scout]);
  world.terminals = [
    { address: "t1", cwd: dir, state: "live" },
    { address: "t2", cwd: dir, state: "live" },
    { address: "t5", cwd: "/elsewhere", state: "live" },
    { address: "t6", cwd: dir, state: "live", name: "Draft: Initech" },
  ].map((t) => ({ ...t }));
  world.running = [
    { address: "t1", tab: "tab1", tab_name: sage.tab, status: "working" },
    { address: "t2", tab: "tab2", tab_name: scout.tab, status: "blocked" },
  ];
  // stand-in terminals() adds running agents too; keep one entry per address
  const seen = new Set();
  const listed = party.folderTerminals(dir).filter((e) => !seen.has(e.address) && seen.add(e.address));
  assert.deepEqual(listed.map((e) => e.name), ["🔮 sage/hooli-ai-engineer", "🏹 scout/2026-11-11", "Draft: Initech"]);

  // In the Terminals view, choosing a tab shows that agent there and leaves the agent pane shut.
  const select = (id) => ({ ...world.layout, children: world.layout.children.map((c) => c.id !== "jq-body" ? c : { ...c, children: c.children.map((n) => n.id === "jq-view" ? { ...n, active: id } : n) }) });
  world.layout = select("jq-terminals");
  find(view.render(cx), "jq-term-1").click({}, cx);
  assert.deepEqual(world.ran.at(-1), { name: "agent.focus", args: { terminal: "t2" } });
  assert.ok(!world.ran.some((r) => r.name === "layout.show"));
  // A terminal still asking a first-run question is peeked at instead.
  find(view.render(cx), "jq-term-2").click({}, cx);
  assert.deepEqual(world.ran.at(-1), { name: "terminal.peek", args: { terminal: "t6" } });
});

test("opening Terminals shuts the agent pane and shows a Job Quest agent", async () => {
  world.layout = JSON.parse(await readFile(new URL("../layouts/job-quest.json", import.meta.url), "utf8"));
  world.terminals = [{ address: "t1", cwd: dir, state: "live" }];
  world.running = [{ address: "t1", tab: "tab1", tab_name: "🔮 sage/x", status: "working" }];
  const bar = await copy("bar");
  find(bar.render(cx), "jq-view-terminals").click({}, cx);
  assert.deepEqual(world.ran.slice(0, 3), [
    { name: "layout.hide", args: { id: "jq-agent" } },
    { name: "layout.select", args: { stack: "jq-view", child: "jq-terminals" } },
    { name: "agent.focus", args: { terminal: "t1" } },
  ]);
});

test("a job waiting too long goes stale and is closed; finished tabs close; old space renamed", async () => {
  const view = await copy("rail");
  const now = Date.now();
  const stale = { ...party.newJob({ key: "s", member: "sage", kind: "research", appId: "acme", auto: true }, now - 60 * 60 * 1000), state: "waiting", waitingSince: now - 30 * 60 * 1000, address: "t1" };
  const done = { ...party.newJob({ key: "d", member: "scribe", kind: "draft", appId: "beta" }, now - 60 * 60 * 1000), state: "done", endedAt: now - 5 * 60 * 1000, address: "t2" };
  party.saveJobs([stale, done]);
  world.running = [
    { address: "t1", tab: "tab1", tab_name: stale.tab, status: "idle" },
    { address: "t2", tab: "tab2", tab_name: done.tab, status: "idle" },
  ];
  world.spaces.push({ id: "s2", name: "Job Quest party", active: false, machine: null, tabs: [] });
  party.setAutopilot(false);
  await round(view);
  const closed = world.ran.filter((r) => r.name === "tab.close").map((r) => r.args.id).sort();
  assert.deepEqual(closed, ["tab1", "tab2"]);
  assert.equal(party.jobs().find((j) => j.key === "s").state, "failed");
  assert.ok(world.ran.some((r) => r.name === "space.rename" && r.args.name === party.PARTY_SPACE));
});

test("the space's tabs are put in order of what needs you, one move at a time", () => {
  const tabs = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  const states = { a: { state: "done", startedAt: 1 }, b: { state: "working", startedAt: 2 }, c: { state: "waiting", startedAt: 3 } };
  assert.deepEqual(party.nextMove(tabs, (id) => states[id]), { id: "c", index: 1 });
  const ordered = [{ id: "c" }, { id: "b" }, { id: "a" }, { id: "d" }];
  assert.equal(party.nextMove(ordered, (id) => states[id]), null);
});

// ---- the party chat

async function post(name, message) {
  await mkdir(join(dir, "chat"), { recursive: true });
  await writeFile(join(dir, "chat", name), typeof message === "string" ? message : JSON.stringify(message));
}

test("the chat reads the workers' message files, skips broken ones, and weaves in the party's events", async () => {
  await post("20261111-100000-sage.json", { at: "2026-11-11T10:00:00Z", from: "sage", appId: "acme", text: "No contact email published. Where should it go?" });
  await post("20261111-100100-scribe.json", "{ not json");
  await post("20261111-100200-scribe.json", { at: "2026-11-11T10:02:00Z", from: "scribe", text: "  " });
  await writeFile(join(dir, "log.jsonl"), JSON.stringify({ at: "2026-11-11T09:59:00Z", member: "sage", appId: "acme", text: "🔮 Sage sets out" }) + "\n");
  const view = await copy("chat");
  assert.deepEqual(view.chatItems().map((m) => [m.event ? "event" : m.from, m.text.slice(0, 12)]), [["event", "🔮 Sage sets"], ["sage", "No contact e"]]);
  assert.ok(find(view.render(cx), "jq-chat-1"));
});

test("a reply goes to whoever spoke last, is saved, and is typed into their terminal", async () => {
  const sage = { ...party.newJob({ key: "a", member: "sage", kind: "research", appId: "acme" }), state: "waiting", address: "t1" };
  const scribe = { ...party.newJob({ key: "b", member: "scribe", kind: "draft", appId: "beta" }), state: "working", address: "t2" };
  party.saveJobs([sage, scribe]);
  world.running = [{ address: "t1", tab: "tab1", tab_name: sage.tab, status: "idle" }, { address: "t2", tab: "tab2", tab_name: scribe.tab, status: "working" }];
  await post("20261111-100000-sage.json", { at: "2026-11-11T10:00:00Z", from: "sage", appId: "acme", text: "Which address?" });
  const view = await copy("chat");
  assert.equal(view.chatTarget().label, "sage", "the last speaker, not the newest worker");

  view.chatInput.type("Use jobs@acme.com");
  view.chatInput.submit(cx);
  await until(() => (world.hcs ?? []).length === 1, "the delivery");
  assert.deepEqual(world.hcs[0], ["send", "t1", "[Chat] Use jobs@acme.com"]);
  await until(() => view.snap.chat.some((m) => m.from === "you"), "the saved reply");
  const mine = view.snap.chat.find((m) => m.from === "you");
  assert.equal(mine.to, "sage");
  assert.equal(mine.appId, "acme");

  // Everyone: both terminals.
  find(view.render(cx), "jq-chat-to-all").click({}, cx);
  view.chatInput.type("Wrap up by noon");
  view.chatInput.submit(cx);
  await until(() => world.hcs.length === 3, "both deliveries");
  assert.deepEqual(world.hcs.slice(1).map((a) => a[1]).sort(), ["t1", "t2"]);
});

test("a worker's new message is toasted once, by the copy running the party", async () => {
  const view = await copy("rail");
  party.setAutopilot(false);
  await round(view);
  await post("20261111-110000-herald.json", { at: "2026-11-11T11:00:00Z", from: "herald", appId: "acme", text: "PDFs and email are ready." });
  await view.reload(cx);
  await round(view);
  await round(view);
  const toasts = world.notices.filter((n) => /Herald/.test(n.title));
  assert.equal(toasts.length, 1);
  assert.match(toasts[0].body, /PDFs and email/);
});

test("every worker is told how to use the chat", () => {
  const row = app({ id: "acme", hasResearch: true });
  for (const kind of ["scout", "research", "draft", "revise", "review", "package", "followup", "prep"]) {
    const task = prompts.forJob("/d", { kind, report: "r.md" }, row, today);
    assert.match(task, /\/d\/chat\/<YYYYMMDD-HHMMSS>-/, kind);
    assert.match(task, /\[Chat\]/, kind);
    if (kind !== "scout") assert.match(task, /"appId": "acme"/, kind);
  }
});

test("replying to a worker that has finished starts a new one with its message and your answer", async () => {
  await seed("northwind", { "application.json": JSON.stringify({ company: "Northwind", role: "FDE", stage: "drafting" }), "research.md": "r\n", "posting.md": "p\n" });
  await post("20261111-120000-sage.json", { at: "2026-11-11T12:00:00Z", from: "sage", appId: "northwind", text: "No contact email is published." });
  const view = await copy("chat");
  find(view.render(cx), "jq-chat-0-reply").click({}, cx);
  assert.equal(view.chatTarget().revive.from, "sage");
  assert.ok(find(view.render(cx), "jq-chat-to-revive"));
  view.chatInput.type("Use jobs@northwind.xyz");
  view.chatInput.submit(cx);
  const started = world.ran.find((r) => r.name === "tab.new" || r.name === "space.new");
  assert.match(started.args.task, /An earlier Sage, working on FDE at Northwind, posted: "No contact email is published\." I replied: "Use jobs@northwind\.xyz"/);
  assert.match(started.args.task, /contactEmail/);
  const [job] = party.jobs();
  assert.deepEqual([job.member, job.kind, job.appId], ["sage", "reply", "northwind"]);
  await until(() => view.snap.chat.some((m) => m.from === "you" && m.to === "a new sage"), "the saved reply");
  assert.equal(world.hcs?.length ?? 0, 0, "nothing typed into a terminal that is gone");
});
