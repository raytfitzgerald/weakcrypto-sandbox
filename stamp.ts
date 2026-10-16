#!/usr/bin/env bun
// Any CycloneDX CBOM, from any tool or agent, made ready to submit: pinned to
// the repository's commit, given a generated id, and every line it cites
// proven against the code. Writes it where it belongs; commit it and open a
// pull request.
//
//   bun stamp.ts <any.cbom.json> --repo <owner/repo> --by <your GitHub login> [--builds-on <id,...>] [--commit <sha>]
//                 [--model <name>] [--config <text>] [--runtime-ms <n>] [--cost-usd <n>]

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { checkCbom, stamp, toSubmission, type Cbom } from "./lib/cbom.ts";
import { cboms, target } from "./lib/files.ts";
import { fetchAt } from "./lib/source.ts";
import { cbomPath } from "./lib/types.ts";

const root = import.meta.dir;
const argv = process.argv.slice(2);
const flag = (n: string) => { const i = argv.indexOf(`--${n}`); return i >= 0 ? argv[i + 1] : undefined; };
const die = (m: string): never => { console.error(m); process.exit(1); };
const file = argv.find((a, i) => !a.startsWith("--") && !(argv[i - 1] ?? "").startsWith("--")) ?? die("usage: bun stamp.ts <any.cbom.json> --repo <owner/repo> --by <your GitHub login> [--builds-on <id,...>] [--commit <sha>] [--model <name>] [--config <text>] [--runtime-ms <n>] [--cost-usd <n>]");
const repo = (flag("repo") ?? die("--repo <owner/repo> is required")).toLowerCase();
const by = flag("by") ?? die("--by <your GitHub login> is required");
const t = target(root, repo) ?? die(`${repo} is not queued: add repos/${repo}/repo.json first`);
const commit = flag("commit") ?? t.commit ?? die(`${repo} has no pinned commit: pass --commit <sha>`);

const buildsOn = flag("builds-on")?.split(",").map((x) => x.trim()).filter(Boolean);
const have = new Set(cboms(root, repo).map((c) => c.submission.id));
const gone = (buildsOn ?? []).filter((id) => !have.has(id));
if (gone.length) die(`--builds-on names CBOMs that are not in repos/${repo}/: ${gone.join(", ")}`);

const num = (v: string | undefined) => (v == null || v === "" || Number.isNaN(Number(v)) ? undefined : Number(v));
const { cbom, dropped } = stamp(JSON.parse(readFileSync(file, "utf8")) as Cbom, {
  repo, commit, url: t.url, source: fetchAt(repo, commit, join(root, ".cache")), submitter: by, buildsOn,
  model: flag("model") ?? null, config: flag("config"), runtimeMs: num(flag("runtime-ms")), costUsd: num(flag("cost-usd")) ?? null,
});
const errs = await checkCbom(cbom);
if (errs.length) die(`✕ not a valid submission yet:\n${errs.map((e) => `    ${e}`).join("\n")}`);
const out = join(root, cbomPath(repo, toSubmission(cbom).id));
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, JSON.stringify(cbom, null, 2) + "\n");
console.log(`${cbomPath(repo, toSubmission(cbom).id)}: ${cbom.components?.length ?? 0} assets${dropped ? ` (${dropped} occurrences dropped: not at ${commit.slice(0, 12)})` : ""}`);
