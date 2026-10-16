#!/usr/bin/env bun
// Queue a repository: writes repos/<owner>/<repo>/repo.json, pinned to the
// commit its default branch is at now. Commit the file and open a pull request.
//
//   bun add.ts <owner/repo> --by <your GitHub login> [--commit <sha>] [--why <text>]

import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkEntry, targetPath, type Entry } from "./lib/types.ts";

const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const die = (m: string): never => { console.error(m); process.exit(1); };
const name = (argv.find((a, i) => !a.startsWith("--") && !(argv[i - 1] ?? "").startsWith("--")) ?? die("usage: bun add.ts <owner/repo> --by <your GitHub login> [--commit <sha>] [--why <text>]"))
  .replace(/^https:\/\/github\.com\//, "").replace(/(\.git)?\/?$/, "");
const by = flag("by") ?? die("--by <your GitHub login> is required");

const gh = async (path: string) => {
  const r = await fetch(`https://api.github.com${path}`, { headers: { Accept: "application/vnd.github+json", ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) } });
  if (!r.ok) die(`GitHub said ${r.status} for ${path}${r.status === 403 ? " (rate limited: set GITHUB_TOKEN)" : ""}`);
  return r.json() as Promise<Record<string, any>>;
};
const info = await gh(`/repos/${name}`);
if (info.private) die(`${name} is not public`);
const repo = String(info.full_name).toLowerCase();
const out = join(import.meta.dir, targetPath(repo));
if (existsSync(out)) die(`${repo} is already queued: ${targetPath(repo)}`);
const commit = flag("commit") ?? (await gh(`/repos/${info.full_name}/commits/${info.default_branch}`)).sha;

const entry: Entry = {
  repo, url: `https://github.com/${info.full_name}`, stars: info.stargazers_count ?? null, addedBy: by,
  addedAt: new Date().toISOString(), via: "pull-request", commit, ...(flag("why") ? { justification: flag("why") } : {}),
};
const errs = checkEntry(entry);
if (errs.length) die(`✕ ${errs.join("; ")}`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(entry, null, 2) + "\n");
console.log(`${targetPath(repo)}: ${info.full_name} at ${String(commit).slice(0, 12)}, ${entry.stars} stars`);
