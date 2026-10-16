// What is in the repository. A repository to scan is a folder with a repo.json;
// the CBOMs people submit for it sit beside it. A CBOM is CycloneDX on disk
// (lib/cbom.ts); Submission is the shape it is read into. Answer keys are plain
// JSON, described in ../schema.

export interface Finding {
  /** A CycloneDX primitive (signature, key-agree, pke, hash, ae, ...) or, for non-algorithm assets, the asset type. */
  file: string; line: number; primitive: string; evidence: string;
  algorithm?: string | null; quantumVulnerable?: boolean | null; note?: string;
}
export interface Submission {
  schema: "weakcrypto.submission/v1";
  id: string; repo: string; commit: string;
  tool: { name: string; version?: string; config?: string };
  model?: string | null; submitter: string; createdAt: string;
  /** Assets found: the CBOM's cryptographic-asset components. */
  assets?: number;
  /** The CBOMs (ids, same repository and commit) this one started from. */
  buildsOn?: string[];
  /** When its file entered the repository (the commit that added it): the order findings are credited in. */
  filedAt?: string;
  runtime?: { ms?: number; costUsd?: number | null };
  cbom?: string;
  findings: Finding[];
  rejected?: Array<{ file: string; line: number; note?: string }>;
}
/** An entry in the queue: one repository to scan (schema/entry.schema.json). The same shape whether a person
 *  added it (repos/<owner>/<repo>/repo.json) or it came from the 100+ star list (a line in seed/<x>.jsonl). */
export interface Entry {
  repo: string; url: string; stars: number | null; addedBy: string; addedAt: string; via: "site" | "pull-request" | "corpus";
  /** The commit to scan, when pinned. */
  commit?: string;
  justification?: string;
  /** Deprecated: the first entries carry it. */
  schema?: "weakcrypto.target/v1";
}
export type Target = Entry;
export type Verdict = "confirmed" | "rejected" | "pending";
export interface LabelledSite {
  file: string; line: number; verdict: Verdict; by: string;
  primitive?: string | null; algorithm?: string | null; quantumVulnerable?: boolean | null;
  claimedBy: string[]; rejectedBy?: string[]; firstClaim?: string;
  /** The GitHub account whose CBOM reported it first: who found it. A CBOM that builds on that one does not take the credit. */
  foundBy?: string;
  note?: string;
}
export interface Labels {
  schema: "weakcrypto.labels/v1"; repo: string; commit: string; updatedAt?: string;
  sites: LabelledSite[];
}

const REPO = /^[a-z0-9-]+\/[a-z0-9._-]+$/;
const SHA = /^[0-9a-f]{40}$/;
const LOGIN = /^[A-Za-z0-9-]{1,39}(?:\[bot\])?$/;
const isIso = (s: unknown) => typeof s === "string" && !Number.isNaN(Date.parse(s));

const KEYS_OF_ENTRY = new Set(["repo", "url", "stars", "addedBy", "addedAt", "via", "commit", "justification", "schema"]);
/** What is wrong with an entry, if anything (schema/entry.schema.json, in code). */
export function checkEntry(x: unknown): string[] {
  const e: string[] = [];
  const t = x as Partial<Entry>;
  if (!t || typeof t !== "object" || Array.isArray(t)) return ["not an object"];
  for (const k of Object.keys(t)) if (!KEYS_OF_ENTRY.has(k)) e.push(`${k}: not part of an entry`);
  if (typeof t.repo !== "string" || !REPO.test(t.repo)) e.push("repo must be owner/name, lowercased");
  if (typeof t.url !== "string" || !/^https:\/\/github\.com\/[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(t.url)) e.push("url must be https://github.com/owner/name");
  else if (t.repo && t.url.slice("https://github.com/".length).toLowerCase() !== t.repo) e.push("url and repo name different repositories");
  if (!("stars" in t) || !(t.stars === null || (Number.isInteger(t.stars) && t.stars! >= 0))) e.push("stars must be a whole number, or null if not looked up");
  if (typeof t.addedBy !== "string" || !LOGIN.test(t.addedBy)) e.push("addedBy must be a GitHub login (an app's ends in [bot])");
  if (!isIso(t.addedAt)) e.push("addedAt must be an ISO date");
  if (!["site", "pull-request", "corpus"].includes(t.via as string)) e.push("via must be site, pull-request or corpus");
  if (t.commit != null && !SHA.test(t.commit)) e.push("commit must be a full 40-character SHA");
  if (t.justification != null && (typeof t.justification !== "string" || t.justification.length > 500)) e.push("justification: at most 500 characters");
  if (t.schema != null && t.schema !== "weakcrypto.target/v1") e.push("schema: leave it out");
  return e;
}
export const checkTarget = checkEntry;

/** Where everything lives. */
export const REPOS = "repos", SEED = "seed", KEYS = "benchmark/keys", RUNS = "benchmark/runs";
/** seed/<x>.jsonl: the 100+ star list, one entry per line, filed by the first character of the owner. */
export const seedPath = (repo: string) => `${SEED}/${/^[a-z0-9]/.test(repo) ? repo[0] : "_"}.jsonl`;
/** repos/<owner>/<repo>/: the queue is these folders. */
export const repoDir = (repo: string) => `${REPOS}/${repo}`;
export const targetPath = (repo: string) => `${repoDir(repo)}/repo.json`;
export const cbomPath = (repo: string, id: string) => `${repoDir(repo)}/${id}.cbom.json`;
export const keyPath = (repo: string) => `${KEYS}/${repo}.json`;
export const runPath = (model: string, repo: string) => `${RUNS}/${model.replace(/[/:]/g, "_")}/${repo}.json`;
