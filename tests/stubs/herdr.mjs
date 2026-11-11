// A stand-in for the `herdr` module over a real temporary folder. Tests set `world` first.
import * as fs from "node:fs/promises";
import { dirname } from "node:path";

export const world = { home: "", shared: {}, ran: [], execs: [], notices: [], agents: [], exec: null };

export const home = () => world.home;
export const appHome = () => `${world.home}/.config/herdr-app`;
export const shared = (key) => world.shared[key];
export const setShared = (key, value) => { world.shared[key] = value; return null; };
export const run = (name, args) => { world.ran.push({ name, args }); return null; };
export const notify = (notice) => { world.notices.push(notice); return "n1"; };
export const theme = () => new Proxy({}, { get: (_t, name) => `#${String(name)}` });
export const window = () => ({ platform: "linux" });
export const knownAgents = async () => world.agents;
export const pickFolder = async () => null;
export const watchFolder = () => new Promise(() => {});

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
