// Drives the panel over a real temporary folder with stand-ins for Herdr's modules (tests/stubs).
// It proves the mod's own logic: what a click or Enter writes, and what is handed to an agent.
// It cannot prove the UI calls exist in Herdr: run `herdr-app check` on the installed mod for that.
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { world } from "./stubs/herdr.mjs";
import { find, texts } from "./stubs/gpui-kit.mjs";
import JobQuest from "../mods/job-quest/main.js";

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

async function panel() {
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

beforeEach(async () => {
  const home = await mkdtemp(join(tmpdir(), "job-quest-"));
  Object.assign(world, { home, shared: {}, ran: [], execs: [], notices: [], exec: null,
    agents: [{ key: "claude", name: "Claude Code", run: ["claude"], installed: true }, { key: "codex", name: "Codex", run: ["codex"], installed: false }] });
  dir = join(home, "job-quest-data");
  globalThis.localStorage = { getItem: () => null, setItem() {} };
});

test("first run writes the guides and the agents' instructions, and never overwrites a guide", async () => {
  await mkdir(join(dir, "guides"), { recursive: true });
  await writeFile(join(dir, "guides/resume-guide.md"), "mine\n");
  await panel();
  assert.equal(await readFile(join(dir, "guides/resume-guide.md"), "utf8"), "mine\n");
  assert.match(await readFile(join(dir, "guides/cover-letter-guide.md"), "utf8"), /^# Cover letter guide/);
  assert.match(await readFile(join(dir, "AGENTS.md"), "utf8"), new RegExp(dir));
  assert.equal(await readFile(join(dir, "CLAUDE.md"), "utf8"), "@AGENTS.md\n");
});

test("an application goes from a new row to a drafting agent to applied", async () => {
  const view = await panel();
  const app = "applications/acme-backend-engineer";

  view.newApp.type("Acme, Backend Engineer");
  view.newApp.submit(cx);
  await until(() => view.application(), "the new application");
  assert.equal((await json(`${app}/application.json`)).stage, "lead");
  assert.ok(find(view.render(cx), "jq-app-acme-backend-engineer"));

  click(view, "jq-tab-drafts");
  view.posting.type("We need a Go engineer.");
  click(view, "jq-posting-save");
  await until(() => view.application().hasPosting, "the posting");
  assert.equal(await readFile(join(dir, app, "posting.md"), "utf8"), "We need a Go engineer.\n");

  click(view, "jq-draft-both");
  assert.equal(world.ran.length, 1);
  const { name, args } = world.ran[0];
  assert.equal(name, "tab.new");
  assert.deepEqual(args.argv, ["claude"]);
  assert.equal(args.folder, dir);
  assert.ok(args.task.includes(`${dir}/${app}/resume.md`));
  await until(async () => (await json(`${app}/application.json`)).stage === "drafting", "the drafting stage");

  click(view, "jq-tab-submit");
  click(view, "jq-export");
  assert.equal(world.ran.length, 1, "nothing is exported before a resume exists");
  assert.match(view.error, /resume first/);

  click(view, "jq-applied");
  await until(() => view.application().stage === "applied", "the applied stage");
  const applied = await json(`${app}/application.json`);
  assert.equal(applied.appliedAt, view.snap.today);
  assert.ok(applied.followUpAt > applied.appliedAt);
});

test("Enter in one field saves what was typed in the others", async () => {
  const view = await panel();
  view.fields.get("intake:roles").state.type("Platform engineer");
  view.fields.get("intake:salaryMin").state.type(" 150k ");
  view.fields.get("intake:salaryMin").state.submit(cx);
  await until(async () => (await json("intake.json")).salaryMin === "150k", "the intake file");
  assert.equal((await json("intake.json")).roles, "Platform engineer");
});

test("a field follows the file unless the person is typing in it", async () => {
  const view = await panel();
  const roles = view.fields.get("intake:roles").state, stack = view.fields.get("intake:stack").state;
  stack.type("Go");
  await writeFile(join(dir, "intake.json"), JSON.stringify({ roles: "From the agent", stack: "Rust" }));
  await view.reload(cx);
  assert.equal(roles.value(), "From the agent");
  assert.equal(stack.value(), "Go");
});

test("GitHub import adds repositories left out, and a click includes one", async () => {
  world.exec = (command) => (command === "gh"
    ? { code: 0, stderr: "", stdout: JSON.stringify([{ nameWithOwner: "me/tool", url: "https://github.com/me/tool", isPrivate: true }]) }
    : { code: 0, stdout: "", stderr: "" });
  const view = await panel();
  click(view, "jq-tab-profile");
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
  const view = await panel();
  click(view, "jq-tab-profile");
  click(view, "jq-repos-import");
  await until(() => view.error, "the error");
  assert.match(view.error, /gh auth login/);
});

test("with no agent installed, a button says so and starts nothing", async () => {
  world.agents = [];
  const view = await panel();
  click(view, "jq-tab-intake");
  click(view, "jq-intake-interview");
  assert.equal(world.ran.length, 0);
  assert.equal(world.notices[0].level, "error");
});

test("the email opens in the mail app as a draft", async () => {
  await mkdir(join(dir, "applications/acme"), { recursive: true });
  await writeFile(join(dir, "applications/acme/application.json"), JSON.stringify({ company: "Acme", contactEmail: "jobs@acme.com" }));
  await writeFile(join(dir, "applications/acme/resume.md"), "# Me\n");
  await writeFile(join(dir, "applications/acme/email.md"), "Subject: Hello\n\nHi team\n");
  const view = await panel();
  view.select("acme", cx);
  click(view, "jq-tab-submit");
  click(view, "jq-email-open");
  await until(() => world.execs.length === 1, "the mail app");
  assert.equal(world.execs[0].command, "xdg-open");
  assert.equal(world.execs[0].args[0], "mailto:jobs%40acme.com?subject=Hello&body=Hi%20team");
});

test("every tab renders, with and without a selected application", async () => {
  const view = await panel();
  for (const tab of ["intake", "profile", "pipeline", "drafts", "submit"]) {
    click(view, `jq-tab-${tab}`);
    assert.ok(texts(view.render(cx)).length > 0);
  }
  view.newApp.type("Acme, Dev");
  view.newApp.submit(cx);
  await until(() => view.application(), "the application");
  for (const tab of ["pipeline", "drafts", "submit"]) {
    click(view, `jq-tab-${tab}`);
    assert.ok(texts(view.render(cx)).some((text) => text.includes("Acme")));
  }
});
