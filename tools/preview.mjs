// Draws a MOCK-UP of the Job Quest layout without Herdr: it runs the mod's real render code
// against the test stand-ins, with sample data, and turns the recorded element tree into HTML.
// It shows structure and content; fonts, spacing and Herdr's own blocks (terminals, the status
// bar) are approximations. For the real thing use `herdr-app shot` in the app.
//
//   node --import ./tests/stubs/register.mjs tools/preview.mjs <out-dir>
import { mkdtemp, mkdir, writeFile, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { world } from "../tests/stubs/herdr.mjs";
import { Node } from "../tests/stubs/gpui-kit.mjs";
import JobQuest from "../mods/job-quest/main.js";

const THEME = {
  background: "#16181d", canvas: "#0f1114", chrome: "#1a1d23", surface: "#1c1f26", popover: "#22262e",
  raised: "#262a33", hover: "#2c313b", selected: "#323845", border: "#2c313a", input: "#3a404c",
  foreground: "#e4e7ec", muted: "#a3abb8", dim: "#6f7785", accent: "#8fb0e8", accent_foreground: "#10131a",
  solid: "#e4e7ec", solid_foreground: "#16181d", working: "#7fb4f0", blocked: "#e6b062", done: "#7ccf8e",
  idle: "#6f7785", ansi1: "#e57474", ansi2: "#8ccf7e", ansi4: "#67b0e8",
};

const px = (n) => `${n}px`;
const STYLE = {
  size_full: () => "width:100%;height:100%", w_full: () => "width:100%", h_full: () => "height:100%",
  flex_1: () => "flex:1 1 0%", flex_none: () => "flex:none", flex_wrap: () => "flex-wrap:wrap", flex: () => "display:flex",
  gap: (n) => `gap:${px(n)}`, p: (n) => `padding:${px(n)}`, px: (n) => `padding-left:${px(n)};padding-right:${px(n)}`,
  py: (n) => `padding-top:${px(n)};padding-bottom:${px(n)}`, pt: (n) => `padding-top:${px(n)}`, pb: (n) => `padding-bottom:${px(n)}`,
  pr: (n) => `padding-right:${px(n)}`, mt: (n) => `margin-top:${px(n)}`, w: (n) => `width:${px(n)}`, h: (n) => `height:${px(n)}`,
  size: (n) => `width:${px(n)};height:${px(n)}`, min_h: (n) => `min-height:${px(n)}`, min_w: (n) => `min-width:${px(n)}`,
  items_center: () => "align-items:center", items_start: () => "align-items:flex-start",
  justify_between: () => "justify-content:space-between", justify_center: () => "justify-content:center", justify_end: () => "justify-content:flex-end",
  rounded: (n) => `border-radius:${px(n)}`, border_1: () => "border-width:1px;border-style:solid", border_b: (n) => `border-bottom:${px(n)} solid`,
  border_color: (c) => `border-color:${c}`, bg: (c) => `background:${c}`, text_color: (c) => `color:${c}`, text_size: (n) => `font-size:${px(n)}`,
  font_semibold: () => "font-weight:600", font_medium: () => "font-weight:500",
  truncate: () => "overflow:hidden;white-space:nowrap;text-overflow:ellipsis", cursor_pointer: () => "",
  overflow_y_scrollbar: () => "overflow-y:hidden", overflow_x_scrollbar: () => "overflow-x:hidden", overflow_hidden: () => "overflow:hidden",
};
const BASE = { v_flex: "display:flex;flex-direction:column", h_flex: "display:flex;flex-direction:row", div: "", input: "flex:1", textarea: "", editor: "", markdown: "" };

const escape = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;");

// Enough markdown for a resume: headings, bullets, bold.
function markdown(text) {
  return text.split("\n").map((line) => {
    const html = escape(line).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
    if (line.startsWith("### ")) return `<div style="font-weight:600;margin-top:8px">${html.slice(4)}</div>`;
    if (line.startsWith("## ")) return `<div style="font-weight:600;font-size:14px;margin-top:12px;border-bottom:1px solid ${THEME.border};padding-bottom:3px">${html.slice(3)}</div>`;
    if (line.startsWith("# ")) return `<div style="font-weight:700;font-size:18px">${html.slice(2)}</div>`;
    if (line.startsWith("- ")) return `<div style="padding-left:14px;text-indent:-10px">• ${html.slice(2)}</div>`;
    return line ? `<div>${html}</div>` : `<div style="height:6px"></div>`;
  }).join("");
}

function html(node) {
  if (typeof node === "string") return escape(node);
  if (!(node instanceof Node)) return "";
  const css = [BASE[node.kind] ?? ""];
  for (const [name, args] of node.calls) if (STYLE[name]) css.push(STYLE[name](...args));
  let inner = node.children_.map(html).join("");
  if (node.kind === "input" || node.kind === "textarea") {
    const value = node.state.value();
    inner = value ? escape(value) : `<span style="color:${THEME.dim}">${escape(node.state.placeholder ?? "")}</span>`;
    css.push("display:flex;align-items:center");
  }
  if (node.kind === "markdown") inner = markdown(node.children_.join(""));
  if (node.kind === "editor") { inner = escape(node.state.value()); css.push("white-space:pre-wrap;font-family:monospace;padding:8px"); }
  return `<div style="${css.filter(Boolean).join(";")}">${inner}</div>`;
}

const cx = { notify() {}, stop_propagation() {}, spawn(task) { Promise.resolve(task(cx)).catch(() => {}); }, timer: { every() {}, after() {} } };
const color = (value) => THEME[value] ?? value;

// What Herdr itself draws in a block: stood in for by a labelled placeholder.
function placeholder(label, body) {
  return `<div style="width:100%;height:100%;display:flex;flex-direction:column;font-family:monospace;font-size:12.5px;color:${THEME.muted};padding:12px;box-sizing:border-box;gap:4px">
    <div style="color:${THEME.dim};font-family:sans-serif;font-size:11px">${label}</div>${body}</div>`;
}

const TERMINAL = ["<span style='color:#8fb0e8'>●</span> Read applications/northwind-platform-engineer/posting.md", "<span style='color:#8fb0e8'>●</span> Read profile/master.md", "<span style='color:#8fb0e8'>●</span> Read guides/resume-guide.md",
  "", "The posting leads with Kubernetes operators and Go.", "Putting the scheduler project first and cutting the", "two frontend roles to one line each.", "",
  "<span style='color:#8fb0e8'>●</span> Write applications/northwind-platform-engineer/resume.md", "", "<span style='color:#e6b062'>Gap:</span> the posting asks for Terraform; your profile", "does not mention it. Left out. Have you used it?"]
  .map((line) => `<div>${line || "&nbsp;"}</div>`).join("");

async function block(node, parts) {
  const content = node.content ?? {};
  if (content.mod === "job-quest") {
    world.props = content.props;
    const view = new JobQuest();
    view.init({}, cx);
    for (let i = 0; i < 300 && !view.snap; i += 1) await new Promise((r) => setTimeout(r, 10));
    await view.loadDoc();
    parts.push(view);
    return () => { let root = view.render(cx); root.resize?.({ width: view.pixels ?? 1000, height: 600 }, cx); root = view.render(cx); return html(root); };
  }
  if (content.agent) return () => placeholder("Herdr draws the agent's terminal here (sample text)", TERMINAL);
  if (content.tab) return () => placeholder("Herdr draws the active tab's terminals here", "");
  return () => `<div style="height:100%;display:flex;align-items:center;padding:0 12px;font-size:11px;color:${THEME.dim}">Herdr's status bar</div>`;
}

// A layout node as a flex box. `along`: the parent's direction, which says what size.px sets.
async function box(node, along, show, parts) {
  const css = ["box-sizing:border-box", "min-width:0", "min-height:0", "overflow:hidden"];
  css.push(node.size?.px ? `flex:none;${along === "row" ? "width" : "height"}:${px(node.size.px)}` : "flex:1 1 0%");
  if (along === "row") css.push("height:100%"); else css.push("width:100%");
  if (node.background) css.push(`background:${color(node.background)}`);
  if (node.border) css.push(`border:${px(node.border.width)} solid ${color(node.border.color)}`);
  if (node.radius) css.push(`border-radius:${px(node.radius)}`);
  if (node.padding) css.push(`padding:${px(node.padding)}`);
  let inner;
  if (node.type === "block") { const draw = await block(node, parts); inner = draw; }
  else {
    const kids = node.type === "stack" ? node.children.filter((c) => c.id === (show.view ?? node.active))
      : node.children.filter((c) => !c.hidden || show.ids.includes(c.id));
    const direction = node.type === "row" ? "row" : "column";
    css.push(`display:flex;flex-direction:${direction}`, node.gap ? `gap:${px(node.gap)}` : "");
    const drawn = [];
    for (const kid of kids) drawn.push(await box(kid, node.type === "stack" ? along : direction, show, parts));
    inner = () => drawn.map((d) => d()).join("");
  }
  return () => `<div data-node="${node.id}" style="${css.filter(Boolean).join(";")}">${inner()}</div>`;
}

async function seed(home) {
  const dir = join(home, "job-quest-data");
  const apps = [
    ["northwind-platform-engineer", { company: "Northwind", role: "Platform Engineer", stage: "drafting", url: "https://jobs.example.com/northwind/412", contactName: "Sam Rivera", contactEmail: "jobs@northwind.example", notes: "Referred by Priya. Range 150-175k." }, true],
    ["lumen-labs-backend-engineer", { company: "Lumen Labs", role: "Backend Engineer", stage: "lead" }, false],
    ["harbor-senior-sre", { company: "Harbor", role: "Senior SRE", stage: "lead" }, false],
    ["tessera-infrastructure-engineer", { company: "Tessera", role: "Infrastructure Engineer", stage: "ready" }, true],
    ["quill-staff-engineer", { company: "Quill", role: "Staff Engineer", stage: "applied", appliedAt: "2026-11-02", followUpAt: "2026-11-09" }, true],
    ["bramble-backend-engineer", { company: "Bramble", role: "Backend Engineer", stage: "applied", appliedAt: "2026-11-08", followUpAt: "2026-11-15" }, true],
    ["orchard-platform-lead", { company: "Orchard", role: "Platform Lead", stage: "interview", appliedAt: "2026-10-21" }, true],
  ];
  const resume = "# Alex Example\n\nalex@example.com · Remote · github.com/alex-example\n\n## Experience\n\n### Senior Software Engineer, Fabrikam · Remote · Mar 2022 to present\n\n- Designed a Go job scheduler on Kubernetes that runs 40k jobs a day, cutting queue latency from 90s to 4s\n- Led the migration of 30 services to a shared deploy pipeline, taking releases from weekly to daily\n- Owned on-call for the platform team of 6 and cut pages by 60% with better alerts\n\n## Projects\n\n### tidepool · github.com/alex-example/tidepool\n\n- A Postgres connection pooler in Rust with 1.2k stars, used in production by three companies\n\n## Skills\n\n**Languages:** Go, Rust, Python\n**Infrastructure:** Kubernetes, Postgres, AWS\n";
  for (const [id, fields, drafted] of apps) {
    await mkdir(join(dir, "applications", id), { recursive: true });
    await writeFile(join(dir, "applications", id, "application.json"), JSON.stringify({ ...fields, createdAt: "2026-10-20", updatedAt: "2026-11-10" }));
    await writeFile(join(dir, "applications", id, "posting.md"), "We are hiring.\n");
    if (drafted) { await writeFile(join(dir, "applications", id, "resume.md"), resume); await writeFile(join(dir, "applications", id, "cover-letter.md"), "Hi team,\n"); }
  }
  await mkdir(join(dir, "profile"), { recursive: true });
  for (const name of ["resume-2024.pdf", "cover-letter-fabrikam.docx", "linkedin-export.md", "notes.md", "master.md"]) await writeFile(join(dir, "profile", name), "x\n");
  await writeFile(join(dir, "intake.json"), JSON.stringify({ roles: "Platform engineer, backend engineer", seniority: "Senior", workMode: "Remote", locations: "US time zones", salaryMin: "150k base", stack: "Go, Rust, Kubernetes, Postgres", companyStage: "Series A to C", dealBreakers: "On-site five days", notes: "" }));
  await writeFile(join(dir, "repos.json"), JSON.stringify([
    { fullName: "alex-example/tidepool", url: "", isPrivate: false, isIncluded: true, summary: "pooler" },
    { fullName: "alex-example/scheduler-notes", url: "", isPrivate: false, isIncluded: true, summary: "" },
    { fullName: "alex-example/dotfiles", url: "", isPrivate: false, isIncluded: false, summary: "" },
    { fullName: "alex-example/side-project", url: "", isPrivate: true, isIncluded: false, summary: "" },
  ]));
}

const out = resolve(process.argv[2] ?? ".");
const home = await mkdtemp(join(tmpdir(), "job-quest-preview-"));
Object.assign(world, { home, theme: THEME, shared: { "job-quest.selected": "northwind-platform-engineer" }, ran: [], execs: [], notices: [], running: [],
  agents: [{ key: "claude", name: "Claude Code", run: ["claude"], installed: true }, { key: "codex", name: "Codex", run: ["codex"], installed: true }] });
globalThis.localStorage = { getItem: (key) => (key === "doc" ? "resume" : null), setItem() {} };
await seed(home);
const layout = JSON.parse(await readFile(new URL("../layouts/job-quest.json", import.meta.url), "utf8"));

const SHOTS = [
  { name: "pipeline", view: "jq-pipeline", ids: [], widths: { board: 1150 } },
  { name: "pipeline-agent", view: "jq-pipeline", ids: ["jq-agent"], widths: { board: 620 } },
  { name: "profile", view: "jq-profile", ids: [], widths: {} },
  { name: "intake", view: "jq-intake", ids: [], widths: {} },
];
for (const shot of SHOTS) {
  world.layout = JSON.parse(JSON.stringify(layout));
  world.layout.children[1].children[0].active = shot.view;
  const parts = [];
  const draw = await box(world.layout, "column", shot, parts);
  for (const view of parts) view.pixels = shot.widths[view.part] ?? 1000;
  const page = `<!doctype html><meta charset="utf-8"><style>*{box-sizing:border-box}</style><body style="margin:0;width:1720px;height:1000px;background:${THEME.canvas};font-family:Inter,'Segoe UI',system-ui,sans-serif;line-height:1.45;color:${THEME.foreground}">
    <div style="width:1720px;height:1000px;display:flex;flex-direction:column">${draw()}</div></body>`;
  await writeFile(join(out, `${shot.name}.html`), page);
}
console.log(SHOTS.map((s) => join(out, `${s.name}.html`)).join("\n"));
process.exit(0);
