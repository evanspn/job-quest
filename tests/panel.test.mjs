// Drives the mod over a real temporary folder with stand-ins for Herdr's modules (tests/stubs).
// It proves the mod's own logic: what a click or Enter writes, what is handed to an agent, and
// how the parts stay in step. It cannot prove the UI calls exist in Herdr: the stand-ins accept
// any builder. Run `herdr-app check` on the installed mod for that.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { world, sendCommand, forgetCopies } from "./stubs/herdr.mjs";
import { find, texts, walk } from "./stubs/gpui-kit.mjs";
import JobQuest, { PARTS, VIEW_STACK, AGENT_BLOCK } from "../mods/job-quest/main.js";

const LAYOUT = JSON.parse(await readFile(new URL("../layouts/job-quest.json", import.meta.url), "utf8"));

const cx = {
  notify() {}, stop_propagation() {},
  spawn(task) { Promise.resolve(task(cx)).catch(() => {}); },
  timer: { every() {}, after() {} },
};

let dir;
const json = async (path) => JSON.parse(await readFile(join(dir, path), "utf8"));

async function until(check, what) {
  for (let i = 0; i < 200; i += 1) {
    try { if (await check()) return; } catch { /* not there yet */ }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`timed out waiting for ${what}`);
}

// A copy of the mod as the layout would place it; no part is the standalone panel.
async function copy(part) {
  world.props = part ? { part } : null;
  const view = new JobQuest();
  view.init({}, cx);
  await until(() => view.snap, "the first read");
  return view;
}

const click = (view, id) => {
  const node = find(view.render(cx), id);
  assert.ok(node?.click, `no clickable #${id}`);
  node.click({}, cx);
};

async function seed(id, files) {
  await mkdir(join(dir, "applications", id), { recursive: true });
  for (const [name, text] of Object.entries(files)) await writeFile(join(dir, "applications", id, name), text);
}

beforeEach(async () => {
  forgetCopies();
  const home = await mkdtemp(join(tmpdir(), "job-quest-"));
  Object.assign(world, { home, terminals: [], shared: {}, ran: [], execs: [], notices: [], exec: null, props: null, layout: null, running: [],
    spaces: [{ id: "s1", name: "~", active: true, machine: null, tabs: [] }, { id: "jq", name: "Job Quest", active: false, machine: null, tabs: [] }],
    agents: [{ key: "claude", name: "Claude Code", run: ["claude"], installed: true }, { key: "codex", name: "Codex", run: ["codex"], installed: false }] });
  dir = join(home, "job-quest-data");
  globalThis.localStorage = { getItem: () => null, setItem() {} };
});

test("the layout places parts this mod draws, under the ids it drives", () => {
  const ids = [], parts = [];
  const visit = (node) => {
    ids.push(node.id);
    if (node.content?.mod === "job-quest") parts.push(node.content.props.part);
    if (node.type === "stack") assert.ok(node.children.some((c) => c.id === node.active), `stack ${node.id} shows a child it has`);
    (node.children ?? []).forEach(visit);
  };
  visit(LAYOUT);
  assert.equal(new Set(ids).size, ids.length, "node ids are unique");
  assert.deepEqual(parts.sort(), ["bar", "board", "chat", "detail", "intake", "party", "profile", "rail", "tabs"]);
  for (const part of parts) assert.ok(PARTS.includes(part));
  for (const id of [VIEW_STACK, AGENT_BLOCK, "jq-pipeline", "jq-party", "jq-profile", "jq-intake", "jq-terminals", "jq-term-tabs", "jq-term-view", "jq-chat", "jq-rail"]) assert.ok(ids.includes(id), id);
});

test("first run writes the guides and the agents' instructions, and never overwrites a guide", async () => {
  await mkdir(join(dir, "guides"), { recursive: true });
  await writeFile(join(dir, "guides/resume-guide.md"), "mine\n");
  await copy();
  assert.equal(await readFile(join(dir, "guides/resume-guide.md"), "utf8"), "mine\n");
  assert.match(await readFile(join(dir, "guides/cover-letter-guide.md"), "utf8"), /^# Cover letter guide/);
  assert.match(await readFile(join(dir, "AGENTS.md"), "utf8"), new RegExp(dir));
  assert.equal(await readFile(join(dir, "CLAUDE.md"), "utf8"), "@AGENTS.md\n");
});

test("in the panel, an application goes from a new card to a drafting agent to applied", async () => {
  const view = await copy();
  const app = "applications/acme-backend-engineer";

  view.newApp.type("Acme, Backend Engineer");
  view.newApp.submit(cx);
  await until(() => view.application(), "the new application");
  assert.equal((await json(`${app}/application.json`)).stage, "lead");
  assert.ok(find(view.render(cx), "jq-app-acme-backend-engineer"));

  click(view, "jq-app-acme-backend-engineer");
  assert.equal(view.tab, "application");
  click(view, "jq-doc-posting");
  view.posting.type("We need a Go engineer.");
  click(view, "jq-posting-save");
  await until(() => view.application().hasPosting, "the posting");
  assert.equal(await readFile(join(dir, app, "posting.md"), "utf8"), "We need a Go engineer.\n");
  await until(() => texts(view.render(cx)).includes("We need a Go engineer.\n"), "the posting's preview");

  click(view, "jq-export");
  assert.equal(world.ran.length, 0, "nothing is exported before a resume exists");
  assert.match(view.error, /resume first/);

  click(view, "jq-draft-both");
  assert.equal(world.ran.length, 1);
  const { name, args } = world.ran[0];
  assert.equal(name, "tab.new");
  assert.deepEqual(args.argv, ["claude", "--permission-mode", "auto"]);
  assert.equal(args.space, "jq", "in the Job Quest space");
  assert.equal(args.folder, dir);
  assert.ok(args.task.includes(`${dir}/${app}/resume.md`));
  await until(async () => (await json(`${app}/application.json`)).stage === "drafting", "the drafting stage");

  click(view, "jq-applied");
  await until(() => view.application().stage === "applied", "the applied stage");
  const applied = await json(`${app}/application.json`);
  assert.equal(applied.appliedAt, view.snap.today);
  assert.ok(applied.followUpAt > applied.appliedAt);
});

test("in the layout, the board and the detail are separate copies that stay in step", async () => {
  world.layout = LAYOUT;
  await seed("acme", { "application.json": JSON.stringify({ company: "Acme", role: "Dev" }) });
  const board = await copy("board"), detail = await copy("detail");
  assert.ok(texts(detail.render(cx)).some((text) => text.includes("Pick an application")));

  click(board, "jq-app-acme");
  await until(() => texts(detail.render(cx)).includes("Acme · Dev"), "the detail to follow the board's selection");

  click(detail, "jq-stage-interview");
  await until(async () => (await json("applications/acme/application.json")).stage === "interview", "the stage");
  await until(() => { board.render(cx); return board.snap.applications[0].stage === "interview"; }, "the board to reload after the detail's save");
});

test("the bar switches the layout's view and shows which one is up", async () => {
  world.layout = LAYOUT;
  const bar = await copy("bar");
  assert.equal(bar.view(), "jq-pipeline");
  click(bar, "jq-view-profile");
  assert.deepEqual(world.ran.at(-1), { name: "layout.select", args: { stack: "jq-view", child: "jq-profile" } });
  click(bar, "jq-leave");
  assert.deepEqual(world.ran.at(-1), { name: "layout.switch", args: { name: "main" } });
});

test("a started agent is shown beside the board once it appears", async () => {
  world.layout = LAYOUT;
  const intake = await copy("intake");
  click(intake, "jq-intake-interview");
  assert.equal(world.ran[0].name, "tab.new");
  intake.followAgent(cx);
  assert.equal(world.ran.length, 1, "nothing to show until the agent exists");
  world.running = [{ address: "t9" }];
  intake.followAgent(cx);
  assert.deepEqual(world.ran.slice(1), [
    { name: "agent.focus", args: { terminal: "t9" } },
    { name: "layout.show", args: { id: "jq-agent" } },
  ]);
  assert.equal(intake.awaiting, null);
});

test("a document is edited in place, and an agent's newer text is never overwritten", async () => {
  await seed("acme", { "application.json": JSON.stringify({ company: "Acme" }), "resume.md": "# Me\n" });
  world.shared["job-quest.selected"] = "acme";
  const view = await copy("detail");
  click(view, "jq-doc-resume");
  await until(() => view.doc?.text === "# Me\n", "the resume");

  click(view, "jq-edit");
  view.edit.state.type("# Me, edited\n");
  click(view, "jq-edit-save");
  await until(async () => (await readFile(join(dir, "applications/acme/resume.md"), "utf8")) === "# Me, edited\n", "the save");
  await until(() => view.edit === null && view.doc.text === "# Me, edited\n", "the preview");

  click(view, "jq-edit");
  view.edit.state.type("mine\n");
  await writeFile(join(dir, "applications/acme/resume.md"), "the agent's\n");
  click(view, "jq-edit-save");
  await until(() => view.error, "the conflict");
  assert.match(view.error, /changed on disk/);
  assert.equal(await readFile(join(dir, "applications/acme/resume.md"), "utf8"), "the agent's\n");
  assert.equal(view.edit.state.value(), "mine\n", "the person's text is kept in the editor");
});

test("Enter in one field saves what was typed in the others", async () => {
  const view = await copy("intake");
  view.field("intake:roles").type("Platform engineer");
  view.field("intake:salaryMin").type(" 150k ");
  view.field("intake:salaryMin").submit(cx);
  await until(async () => (await json("intake.json")).salaryMin === "150k", "the intake file");
  assert.equal((await json("intake.json")).roles, "Platform engineer");
});

test("a field follows the file unless the person is typing in it", async () => {
  const view = await copy("intake");
  view.field("intake:stack").type("Go");
  await writeFile(join(dir, "intake.json"), JSON.stringify({ roles: "From the agent", stack: "Rust" }));
  await view.reload(cx);
  assert.equal(view.field("intake:roles").value(), "From the agent");
  assert.equal(view.field("intake:stack").value(), "Go");
});

test("GitHub import adds repositories left out, and a click includes one", async () => {
  world.exec = (command) => (command === "gh"
    ? { code: 0, stderr: "", stdout: JSON.stringify([{ nameWithOwner: "me/tool", url: "https://github.com/me/tool", isPrivate: true }]) }
    : { code: 0, stdout: "", stderr: "" });
  const view = await copy("profile");
  click(view, "jq-repos-import");
  await until(() => view.snap.repos.length === 1, "the import");
  assert.deepEqual(world.execs[0].args.slice(0, 2), ["repo", "list"]);
  assert.equal((await json("repos.json"))[0].isIncluded, false);
  assert.ok(texts(view.render(cx)).includes("private"));

  click(view, "jq-repo-me/tool");
  await until(async () => (await json("repos.json"))[0].isIncluded, "the toggle");

  view.repoInput.type("https://github.com/someone/thing");
  view.repoInput.submit(cx);
  await until(() => view.snap.repos.length === 2, "the added repository");
});

test("a failed GitHub import says what it needs", async () => {
  world.exec = () => { throw new Error("gh: not found"); };
  const view = await copy("profile");
  click(view, "jq-repos-import");
  await until(() => view.error, "the error");
  assert.match(view.error, /gh auth login/);
  assert.equal(view.busy, null);
});

test("with no agent installed, a button says so and starts nothing", async () => {
  world.agents = [];
  const view = await copy("intake");
  click(view, "jq-intake-interview");
  assert.equal(world.ran.length, 0);
  assert.equal(world.notices[0].level, "error");
});

test("the email opens in the mail app as a draft", async () => {
  await seed("acme", {
    "application.json": JSON.stringify({ company: "Acme", contactEmail: "jobs@acme.com" }),
    "resume.md": "# Me\n", "email.md": "Subject: Hello\n\nHi team\n",
  });
  world.shared["job-quest.selected"] = "acme";
  const view = await copy("detail");
  click(view, "jq-email-open");
  await until(() => world.execs.length === 1, "the mail app");
  assert.equal(world.execs[0].command, "xdg-open");
  assert.equal(world.execs[0].args[0], "mailto:jobs%40acme.com?subject=Hello&body=Hi%20team");
});

test("the board draws columns when wide and groups when narrow", async () => {
  await seed("acme", { "application.json": JSON.stringify({ company: "Acme", stage: "applied", followUpAt: "2020-01-01" }) });
  const view = await copy("board");
  const headings = () => texts(view.render(cx)).filter((text) => ["Leads", "Applied", "Offer", "Rejected"].includes(text));
  assert.deepEqual(headings(), ["Applied"]);
  find(view.render(cx), "job-quest-board").resize({ width: 900, height: 600 }, cx);
  assert.deepEqual(headings(), ["Leads", "Applied", "Offer"]);
  assert.ok(texts(view.render(cx)).includes("Follow up due: Acme"));
});

test("every part renders, with and without a selected application, and ids are unique", async () => {
  world.layout = LAYOUT;
  await seed("acme", { "application.json": JSON.stringify({ company: "Acme", role: "Dev" }), "resume.md": "# Me\n" });
  for (const selected of [undefined, "acme"]) {
    world.shared["job-quest.selected"] = selected;
    for (const part of [...PARTS.filter((p) => p !== "panel"), null]) {
      const view = await copy(part);
      for (const tab of part ? [null] : ["pipeline", "application", "profile", "intake"]) {
        if (tab) click(view, `jq-tab-${tab}`);
        const root = view.render(cx), ids = [];
        walk(root, (node) => { if (node.id_) ids.push(node.id_); });
        assert.ok(texts(root).length > 0);
        assert.equal(new Set(ids).size, ids.length, `duplicate id in ${part ?? "panel"}/${tab}: ${ids.filter((id, i) => ids.indexOf(id) !== i)}`);
      }
    }
  }
});

test("the layout's copies all start at once on an empty folder, and none reports a conflict", async () => {
  // Every block of layouts/job-quest.json is its own copy, started together on first open.
  const views = ["bar", "board", "detail", "profile", "intake"].map((part) => {
    world.props = { part };
    const view = new JobQuest();
    view.init({}, cx);
    return view;
  });
  await until(() => views.every((v) => v.snap), "every copy's first read");
  assert.deepEqual(views.map((v) => v.error ?? null), views.map(() => null));
  assert.match(await readFile(join(dir, "AGENTS.md"), "utf8"), /./);
});

test("a draft command from keys starts one agent, from the copy that draws the application", async () => {
  await seed("acme-backend-engineer", { "application.json": JSON.stringify({ company: "Acme", role: "Backend Engineer", stage: "lead" }) });
  const views = [];
  for (const part of ["bar", "board", "detail"]) views.push(await copy(part));
  world.shared["job-quest.selected"] = "acme-backend-engineer";
  for (const v of views) v.render(cx);
  await until(() => views[2].application(), "the detail copy to follow the selection");
  sendCommand("draft-both");
  await until(() => world.ran.some((r) => r.name === "tab.new"), "an agent tab");
  await new Promise((resolve) => setTimeout(resolve, 50));
  assert.equal(world.ran.filter((r) => r.name === "tab.new").length, 1);
  await until(async () => (await json("applications/acme-backend-engineer/application.json")).stage === "drafting", "the card to move to Drafting");
});

test("an agent stopped at a first-run question is peeked at until it starts, then shown", async () => {
  world.layout = LAYOUT;
  const intake = await copy("intake");
  click(intake, "jq-intake-interview");
  // The program runs but is not an agent yet: it is asking whether to trust the folder.
  world.terminals = [{ address: "t9" }];
  for (let i = 0; i < 3; i += 1) intake.followAgent(cx);
  assert.deepEqual(world.ran.at(-1), { name: "terminal.peek", args: { terminal: "t9" } });
  for (let i = 0; i < 60; i += 1) intake.followAgent(cx);
  assert.equal(world.ran.filter((r) => r.name === "terminal.peek").length, 1, "peeked once");
  assert.ok(intake.awaiting, "still waiting while the person answers");
  // Answered: it reports a status, so it is an agent now.
  world.terminals = []; world.running = [{ address: "t9" }];
  world.layout = { ...LAYOUT, children: LAYOUT.children.map((c) => c) };
  intake.followAgent(cx);
  assert.deepEqual(world.ran.filter((r) => r.name !== "terminal.peek").slice(1), [
    { name: "agent.focus", args: { terminal: "t9" } },
    { name: "layout.show", args: { id: "jq-agent" } },
  ]);
  assert.equal(intake.awaiting, null);
});

test("the bar says an agent is starting when another copy started it", async () => {
  world.layout = LAYOUT;
  const bar = await copy("bar"), intake = await copy("intake");
  click(intake, "jq-intake-interview");
  assert.ok(texts(bar.render(cx)).includes("Starting agent…"));
  world.running = [{ address: "t9" }];
  intake.followAgent(cx);
  assert.ok(!texts(bar.render(cx)).includes("Starting agent…"));
});
