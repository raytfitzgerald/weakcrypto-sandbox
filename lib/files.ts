// Reading the repository's folders: the queue (repos/), the CBOMs in it, and
// the benchmark's answer keys.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { toSubmission, type Cbom } from "./cbom.ts";
import { KEYS, REPOS, keyPath, repoDir, targetPath, type Labels, type Submission, type Target } from "./types.ts";

const read = <T>(f: string): T | null => (existsSync(f) ? JSON.parse(readFileSync(f, "utf8")) as T : null);
const dirs = (d: string) => (existsSync(d) ? readdirSync(d, { withFileTypes: true }).filter((x) => x.isDirectory()).map((x) => x.name) : []);

/** Every queued repository: one folder each, repos/<owner>/<repo>/repo.json. */
export function targets(root: string): Target[] {
  return dirs(join(root, REPOS)).flatMap((owner) => dirs(join(root, REPOS, owner)).map((r) => read<Target>(join(root, targetPath(`${owner}/${r}`))))).filter((t): t is Target => !!t);
}
export const target = (root: string, repo: string) => read<Target>(join(root, targetPath(repo)));

/** The CBOMs submitted for a repository, as files and as what they say. */
export function cboms(root: string, repo: string): Array<{ file: string; cbom: Cbom; submission: Submission }> {
  const d = join(root, repoDir(repo));
  if (!existsSync(d)) return [];
  return readdirSync(d).filter((f) => f.endsWith(".cbom.json")).map((f) => {
    const cbom = read<Cbom>(join(d, f))!;
    return { file: `${repoDir(repo)}/${f}`, cbom, submission: toSubmission(cbom) };
  });
}

/** The benchmark's answer key for a repository. */
export const key = (root: string, repo: string) => read<Labels>(join(root, keyPath(repo)));
/** Every repository the benchmark has a key for. */
export function keyed(root: string): string[] {
  return dirs(join(root, KEYS)).flatMap((owner) => readdirSync(join(root, KEYS, owner)).filter((f) => f.endsWith(".json")).map((f) => `${owner}/${f.replace(/\.json$/, "")}`));
}
