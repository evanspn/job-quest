import { test } from "node:test";
import assert from "node:assert/strict";
import {
  toIntake, toRepos, toApplication, stored, newApplication, withStage, followUpsDue, parseRepo,
  mergeRepos, toggleRepo, addRepo, appendNotes, isLink, mailto, addDays, parse, APPLICATION_KEYS,
  parseEmail, splitAddress,
} from "../mods/job-quest/model.js";
import { composeArgs } from "../mods/job-quest/mail.js";
import * as prompts from "../mods/job-quest/prompts.js";

const today = "2026-11-11";

test("parse and the coercions read anything without throwing", () => {
  assert.equal(parse("{nope"), undefined);
  assert.equal(parse(null), undefined);
  assert.equal(toIntake(undefined).roles, "");
  assert.equal(toIntake({ roles: "Backend", salaryMin: 150 }).salaryMin, "");
  assert.deepEqual(toRepos("x"), []);
  assert.deepEqual(toRepos([{ fullName: "a/b", isIncluded: "yes" }, { url: "no name" }]),
    [{ fullName: "a/b", url: "", isPrivate: false, isIncluded: false, summary: "" }]);
  assert.equal(toApplication("acme", { stage: "bogus" }).stage, "lead");
  assert.equal(toApplication("acme", null).company, "acme");
});

test("newApplication makes a slug id and never reuses one", () => {
  const first = newApplication("Acme Corp, Senior Backend Engineer", [], today);
  assert.equal(first.id, "acme-corp-senior-backend-engineer");
  assert.equal(first.company, "Acme Corp");
  assert.equal(first.role, "Senior Backend Engineer");
  assert.equal(first.stage, "lead");
  assert.equal(first.createdAt, today);
  assert.equal(newApplication("Acme Corp, Senior Backend Engineer", [first.id], today).id, `${first.id}-2`);
  assert.equal(newApplication("Acme", [], today).role, "");
  assert.equal(newApplication("  ,  ", [], today), null);
});

test("stored writes only the file's fields, in order", () => {
  const row = { ...newApplication("Acme, Dev", [], "2026-11-01"), hasResume: true, hasPosting: false };
  const out = stored(row, today);
  assert.deepEqual(Object.keys(out), APPLICATION_KEYS);
  assert.equal(out.updatedAt, today);
  assert.equal(out.createdAt, "2026-11-01");
});

test("moving to applied stamps the date and a follow-up once", () => {
  const app = newApplication("Acme, Dev", [], today);
  const applied = withStage(app, "applied", today);
  assert.equal(applied.appliedAt, today);
  assert.equal(applied.followUpAt, "2026-11-18");
  const again = withStage({ ...applied, stage: "interview", followUpAt: "2026-12-01" }, "applied", "2026-11-20");
  assert.equal(again.appliedAt, today);
  assert.equal(again.followUpAt, "2026-12-01");
  assert.equal(withStage(app, "drafting", today).appliedAt, "");
  assert.equal(addDays("2026-12-28", 7), "2027-01-04");
});

test("followUpsDue lists applied applications whose date has come", () => {
  const base = withStage(newApplication("Acme, Dev", [], "2026-11-01"), "applied", "2026-11-01");
  const later = { ...base, id: "later", followUpAt: "2026-12-01" };
  const moved = { ...base, id: "moved", stage: "interview" };
  assert.deepEqual(followUpsDue([base, later, moved], today).map((a) => a.id), [base.id]);
});

test("parseRepo takes owner/name or an address", () => {
  assert.deepEqual(parseRepo("me/tool"), { fullName: "me/tool", url: "https://github.com/me/tool" });
  assert.deepEqual(parseRepo(" https://github.com/me/tool.git "), { fullName: "me/tool", url: "https://github.com/me/tool" });
  assert.deepEqual(parseRepo("https://gitlab.com/me/tool/"), { fullName: "me/tool", url: "https://gitlab.com/me/tool" });
  assert.equal(parseRepo("just-a-name"), null);
  assert.equal(parseRepo("https://github.com/me/tool/tree/main"), null);
});

test("mergeRepos keeps choices and adds new repositories left out", () => {
  const existing = [{ fullName: "me/tool", url: "u", isPrivate: false, isIncluded: true, summary: "kept" }];
  const merged = mergeRepos(existing, [
    { nameWithOwner: "me/tool", url: "other", isPrivate: true },
    { nameWithOwner: "me/secret", url: "https://github.com/me/secret", isPrivate: true },
  ]);
  assert.deepEqual(merged[0], existing[0]);
  assert.deepEqual(merged[1], { fullName: "me/secret", url: "https://github.com/me/secret", isPrivate: true, isIncluded: false, summary: "" });
  assert.deepEqual(mergeRepos(existing, undefined), existing);
  assert.equal(toggleRepo(merged, "me/secret")[1].isIncluded, true);
  assert.equal(addRepo(merged, parseRepo("x/y")).at(-1).isIncluded, true);
});

test("appendNotes adds under the day's heading", () => {
  assert.equal(appendNotes(null, " shipped a queue ", today), "# Notes\n\n## 2026-11-11\n\nshipped a queue\n");
  assert.equal(appendNotes("# Notes\n\n## 2026-11-10\n\nold\n", "new", today), "# Notes\n\n## 2026-11-10\n\nold\n\n## 2026-11-11\n\nnew\n");
});

test("isLink tells a pasted address from a pasted posting", () => {
  assert.equal(isLink(" https://jobs.example.com/123 "), true);
  assert.equal(isLink("https://jobs.example.com/123 and more text"), false);
});

test("mailto carries the subject line and the body", () => {
  const url = mailto("Subject: Backend application: A. Person\n\nHi team,\nI built & shipped it.\n", "jobs@acme.com");
  assert.equal(url, "mailto:jobs%40acme.com?subject=Backend%20application%3A%20A.%20Person&body=Hi%20team%2C%0AI%20built%20%26%20shipped%20it.");
  assert.equal(mailto("no subject here", ""), "mailto:?subject=&body=no%20subject%20here");
});

test("prompts name the files to read and write by absolute path", () => {
  const dir = "/home/p/job-quest-data";
  const row = { id: "acme-dev", company: "Acme", role: "Dev", url: "", hasPosting: true, contactEmail: "", contactName: "" };
  const both = prompts.draft(dir, row, "both");
  assert.ok(both.includes(`${dir}/applications/acme-dev/resume.md`));
  assert.ok(both.includes(`${dir}/applications/acme-dev/cover-letter.md`));
  assert.ok(both.includes(`${dir}/guides/resume-guide.md`));
  assert.ok(both.includes("Never invent"));
  assert.ok(!prompts.draft(dir, row, "resume").includes("cover-letter.md`, following"));
  assert.ok(prompts.draft(dir, { ...row, hasPosting: false, url: "https://x.example/job" }, "both").includes("Fetch the posting from https://x.example/job"));
  assert.ok(prompts.draft(dir, { ...row, hasPosting: false }, "both").includes("Ask me to paste it"));
  assert.ok(prompts.emailDraft(dir, row).includes("Do not send anything"));
  assert.ok(prompts.emailDraft(dir, { ...row, contactEmail: "jobs@acme.com" }).includes("It goes to jobs@acme.com"));
  assert.ok(prompts.agentsFile(dir).includes("Never send an email"));
});

test("email.md's headers give the address, sender, subject and attachments", () => {
  const md = "To: Jane Doe <jane@acme.com>\nFrom: Me <me@x.com>\nSubject: Dev role\nAttachments: Me-Resume.pdf, Me-Cover-Letter.pdf\n\nHi Jane,\n\nBody.\n";
  const email = parseEmail(md);
  assert.equal(email.subject, "Dev role");
  assert.deepEqual(email.attachments, ["Me-Resume.pdf", "Me-Cover-Letter.pdf"]);
  assert.equal(email.body, "Hi Jane,\n\nBody.");
  assert.deepEqual(splitAddress(email.to), { name: "Jane Doe", address: "jane@acme.com" });
  assert.deepEqual(splitAddress("jobs@acme.com"), { name: "", address: "jobs@acme.com" });
  assert.match(mailto(md), /^mailto:jane%40acme\.com\?subject=Dev%20role&body=Hi%20Jane/);

  const args = composeArgs(md, "/apps/acme", ["Me-Resume.pdf", "Me-Cover-Letter.pdf"]);
  assert.deepEqual(args.slice(-7), ["Jane Doe", "jane@acme.com", "Me <me@x.com>", "Dev role", "Hi Jane,\n\nBody.", "/apps/acme/Me-Resume.pdf", "/apps/acme/Me-Cover-Letter.pdf"]);
  assert.throws(() => composeArgs(md, "/apps/acme", ["Me-Resume.pdf"]), /Me-Cover-Letter\.pdf/);
  assert.throws(() => composeArgs("Subject: x\n\nbody", "/a", []), /no To/);
});
