// A stand-in for the `herdr` module over a real temporary folder. Tests set `world` first.
import * as fs from "node:fs/promises";
import { dirname } from "node:path";

export const world = { home: "", shared: {}, ran: [], execs: [], notices: [], agents: [], exec: null, props: null, layout: null, running: [] };

export const home = () => world.home;
export const appHome = () => `${world.home}/.config/herdr-app`;
export const shared = (key) => world.shared[key];
export const setShared = (key, value) => { world.shared[key] = value; return null; };
export const run = (name, args) => { world.ran.push({ name, args }); return null; };
export const notify = (notice) => { world.notices.push(notice); return "n1"; };
export const theme = () => world.theme ?? new Proxy({}, { get: (_t, name) => `#${String(name)}` });
export const window = () => ({ platform: "linux" });
export const props = () => world.props;
export const layout = () => world.layout;
export const settings = () => ({ zoom: 1, font_family: "JetBrains Mono" });
export const agents = () => world.running;
export const spaces = () => world.spaces ?? [{ id: "s1", name: "~", active: true, machine: null }];
export const focused = () => null;
export const playSound = (sound) => { (world.sounds ??= []).push(sound); return null; };
// Every terminal: the agents, plus any started program that has not reported a status yet.
export const terminals = () => [...(world.terminals ?? []), ...world.running].map((t) => ({ state: "live", ...t }));
// As the app's: each shown copy waits for the next command, and a command reaches every copy waiting.
const waiting = [];
export const nextCommand = () => new Promise((resolve) => waiting.push(resolve));
export function sendCommand(command) { for (const resolve of waiting.splice(0)) resolve(command); }
// Copies from an earlier test are no longer shown.
export function forgetCopies() { waiting.length = 0; }
export const knownAgents = async () => world.agents;
export const pickFolder = async () => null;
export const watchFolder = () => new Promise(() => {});

export async function hc(args) {
  (world.hcs ??= []).push(args);
  return world.hc ? world.hc(args) : { code: 0, stdout: "", stderr: "" };
}

export async function exec(command, args = []) {
  world.execs.push({ command, args });
  return world.exec ? world.exec(command, args) : { code: 0, stdout: "", stderr: "" };
}

export async function readTextFile(path) {
  try { return await fs.readFile(path, "utf8"); } catch (e) { if (e.code === "ENOENT") return null; throw e; }
}

// As the app's: a file is replaced only when `expected` is what it holds now; null creates.
export async function writeTextFile(path, text, expected) {
  const current = await readTextFile(path);
  if (current !== (expected ?? null)) throw new Error("stale snapshot");
  await fs.mkdir(dirname(path), { recursive: true });
  await fs.writeFile(path, text);
  return null;
}
