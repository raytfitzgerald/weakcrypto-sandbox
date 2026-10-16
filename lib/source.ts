// A repository's files at one exact commit, for checking submissions: fetched
// once (shallow, that commit only) into .cache/, or read from a checkout you
// already have. The evidence hash proves a line without copying it.

import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";

const run = (args: string[], cwd?: string) => {
  const p = Bun.spawnSync(["git", ...args], { cwd: cwd ?? "/", stdout: "pipe", stderr: "pipe", env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } });
  if (p.exitCode !== 0) throw new Error(`git ${args[0]}: ${p.stderr.toString().trim().split("\n").pop()}`);
  return p.stdout.toString().trim();
};

/** The line's fingerprint: first 16 hex of SHA-256 over its trimmed text. */
export const evidenceOf = (text: string) => createHash("sha256").update(text.trim()).digest("hex").slice(0, 16);

export interface Source {
  commit: string;
  /** The file's lines (1-based: lines[0] is line 1), or null if absent at the commit. */
  lines(file: string): string[] | null;
}

/** Files from a directory already checked out at `commit` (checked). */
export function fromCheckout(dir: string, commit: string): Source {
  const head = run(["rev-parse", "HEAD"], dir);
  if (head !== commit) throw new Error(`${dir} is at ${head.slice(0, 12)}, not ${commit.slice(0, 12)}`);
  return fromDir(dir, commit);
}

export function fromDir(dir: string, commit: string): Source {
  const cache = new Map<string, string[] | null>();
  return {
    commit,
    lines(file) {
      if (cache.has(file)) return cache.get(file)!;
      const p = normalize(join(dir, file));
      let out: string[] | null = null;
      // Never outside the checkout, never a directory, never anything huge.
      if (p.startsWith(normalize(dir) + "/") && existsSync(p) && statSync(p).isFile() && statSync(p).size < 20_000_000) {
        out = readFileSync(p, "utf8").split(/\r?\n/);
      }
      cache.set(file, out);
      return out;
    },
  };
}

/** Fetch `repo` at exactly `commit` into cacheDir (once), and read from there. */
export function fetchAt(repo: string, commit: string, cacheDir: string): Source {
  const dir = join(cacheDir, repo.replace("/", "__"), commit);
  if (!existsSync(join(dir, ".git"))) {
    mkdirSync(dir, { recursive: true });
    run(["init", "--quiet"], dir);
    run(["remote", "add", "origin", `https://github.com/${repo}`], dir);
    run(["fetch", "--quiet", "--depth", "1", "origin", commit], dir);
    run(["checkout", "--quiet", "FETCH_HEAD"], dir);
  }
  return fromCheckout(dir, commit);
}
