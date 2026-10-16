// A submission is a CycloneDX 1.6 CBOM: one cryptographic-asset component per
// asset found, each with the file and line of every place it occurs. The
// ledger's profile adds what scoring needs (see schema/cbom-profile.md):
//
//   metadata.component           the repository at the commit:
//                                name = owner/repo, version = the 40-character SHA
//   metadata.tools.components[0] the tool that produced it (name, version)
//   metadata.properties          weakcrypto:id, :submitter, :model, :config,
//                                :asset-count (= the cryptographic-asset components),
//                                :runtime-ms, :cost-usd, :rejected (path:line, repeatable)
//   components[].properties      weakcrypto:evidence = "path:line=<16 hex>" for
//                                every occurrence: the line's hash at the commit
//
// Valid means valid against the official CycloneDX 1.6 schema AND the profile.

import * as CDX from "@cyclonedx/cyclonedx-library";
import type { Finding, Submission } from "./types.ts";
import { evidenceOf, type Source } from "./source.ts";

export const P = {
  id: "weakcrypto:id", submitter: "weakcrypto:submitter", model: "weakcrypto:model", config: "weakcrypto:config",
  assets: "weakcrypto:asset-count", runtime: "weakcrypto:runtime-ms", cost: "weakcrypto:cost-usd",
  rejected: "weakcrypto:rejected", evidence: "weakcrypto:evidence",
  /** Ids of the CBOMs (same repository and commit) this one started from, comma separated. */
  buildsOn: "weakcrypto:builds-on",
} as const;

interface Prop { name: string; value?: string }
interface Occurrence { location: string; line?: number; additionalContext?: string }
export interface Component {
  type: string; name: string; "bom-ref"?: string; version?: string;
  cryptoProperties?: { assetType?: string; algorithmProperties?: { primitive?: string; parameterSetIdentifier?: string; nistQuantumSecurityLevel?: number } };
  evidence?: { occurrences?: Occurrence[] };
  properties?: Prop[];
  externalReferences?: Array<{ type: string; url: string }>;
}
export interface Cbom {
  $schema?: string; bomFormat: "CycloneDX"; specVersion: string; serialNumber?: string; version?: number;
  metadata?: { timestamp?: string; tools?: { components?: Component[] }; component?: Component; properties?: Prop[] };
  components?: Component[];
  dependencies?: unknown[];
}

const prop = (ps: Prop[] | undefined, name: string) => ps?.find((p) => p.name === name)?.value;
const props = (ps: Prop[] | undefined, name: string) => (ps ?? []).filter((p) => p.name === name).map((p) => p.value ?? "");
export const assets = (b: Cbom) => (b.components ?? []).filter((c) => c.type === "cryptographic-asset");

const SHA = /^[0-9a-f]{40}$/;
const REPO = /^[a-z0-9-]+\/[a-z0-9._-]+$/;
const LOGIN = /^[A-Za-z0-9-]{1,39}(?:\[bot\])?$/;
// Public-key schemes Shor's algorithm breaks; a hash or cipher is not among them.
const SHOR = new Set(["signature", "key-agree", "pke", "kem"]);

const validator = new CDX.Validation.JsonStrictValidator(CDX.Spec.Version.v1dot6);

/** Why a CBOM is not a valid ledger submission: the CycloneDX schema first, then the profile. */
export async function checkCbom(b: Cbom): Promise<string[]> {
  const e: string[] = [];
  if (b?.bomFormat !== "CycloneDX" || b.specVersion !== "1.6") return ["must be a CycloneDX 1.6 BOM (bomFormat CycloneDX, specVersion 1.6)"];
  const schema = await validator.validate(JSON.stringify(b)) as Array<{ instancePath: string; message?: string }> | null;
  for (const x of schema ?? []) e.push(`CycloneDX schema: ${x.instancePath || "/"} ${x.message ?? "is invalid"}`);
  if (e.length) return e.slice(0, 20);

  const m = b.metadata;
  const repo = m?.component?.name, commit = m?.component?.version;
  if (!repo || !REPO.test(repo)) e.push("metadata.component.name must be the repository, owner/repo, lowercased");
  if (!commit || !SHA.test(commit)) e.push("metadata.component.version must be the scanned commit's full 40-character SHA");
  if (!m?.tools?.components?.[0]?.name) e.push("metadata.tools.components[0] must name the tool");
  if (!m?.timestamp) e.push("metadata.timestamp is required");
  const id = prop(m?.properties, P.id);
  if (!id || !/^[a-z0-9][a-z0-9._-]{2,80}$/.test(id)) e.push(`${P.id}: lowercase letters, digits, . _ -, 3 to 81 long`);
  const on = prop(m?.properties, P.buildsOn);
  if (on != null && !on.split(",").every((x) => /^[a-z0-9][a-z0-9._-]{2,80}$/.test(x) && x !== id)) e.push(`${P.buildsOn}: a comma-separated list of other CBOM ids`);
  const who = prop(m?.properties, P.submitter);
  if (!who || !LOGIN.test(who)) e.push(`${P.submitter} must be the GitHub login of the account that commits it`);
  const count = Number(prop(m?.properties, P.assets));
  const found = assets(b).length;
  if (!Number.isInteger(count) || count !== found) e.push(`${P.assets} must equal the number of cryptographic-asset components (${found})`);

  assets(b).forEach((c, i) => {
    const at = `components[${i}] (${c.name})`;
    const occ = c.evidence?.occurrences ?? [];
    if (!occ.length) e.push(`${at}: evidence.occurrences must say where it is`);
    const ev = new Map(props(c.properties, P.evidence).map((v) => { const k = v.lastIndexOf("="); return [v.slice(0, k), v.slice(k + 1)] as const; }));
    for (const o of occ) {
      if (!o.location || o.location.startsWith("/") || o.location.split("/").includes("..")) e.push(`${at}: ${o.location} must be a path from the repository root`);
      if (!Number.isInteger(o.line) || o.line! < 1) e.push(`${at}: ${o.location} needs a line`);
      else if (!/^[0-9a-f]{16}$/.test(ev.get(`${o.location}:${o.line}`) ?? "")) e.push(`${at}: ${o.location}:${o.line} needs a ${P.evidence} hash`);
    }
  });
  return e.slice(0, 50);
}

/** The findings a CBOM claims, one per file and line (the first asset at a line names it). */
export function toSubmission(b: Cbom): Submission {
  const m = b.metadata!;
  const findings: Finding[] = [];
  const seen = new Set<string>();
  for (const c of assets(b)) {
    const ev = new Map(props(c.properties, P.evidence).map((v) => { const k = v.lastIndexOf("="); return [v.slice(0, k), v.slice(k + 1)] as const; }));
    const ap = c.cryptoProperties?.algorithmProperties;
    const primitive = ap?.primitive ?? c.cryptoProperties?.assetType ?? "unknown";
    const level = ap?.nistQuantumSecurityLevel;
    const quantumVulnerable = level == null ? null : level === 0 && SHOR.has(primitive);
    for (const o of c.evidence?.occurrences ?? []) {
      const k = `${o.location}:${o.line}`;
      if (seen.has(k)) continue;
      seen.add(k);
      findings.push({ file: o.location, line: o.line!, primitive, algorithm: c.name + (ap?.parameterSetIdentifier ? `-${ap.parameterSetIdentifier}` : ""), quantumVulnerable, evidence: ev.get(k) ?? "" });
    }
  }
  const num = (v?: string) => (v == null || v === "" ? undefined : Number(v));
  return {
    schema: "weakcrypto.submission/v1",
    id: prop(m.properties, P.id)!, repo: m.component!.name, commit: m.component!.version!,
    tool: { name: m.tools!.components![0]!.name, version: m.tools!.components![0]!.version },
    model: prop(m.properties, P.model) ?? null, submitter: prop(m.properties, P.submitter)!, assets: assets(b).length,
    ...(prop(m.properties, P.buildsOn) ? { buildsOn: prop(m.properties, P.buildsOn)!.split(",") } : {}),
    createdAt: m.timestamp!, runtime: { ms: num(prop(m.properties, P.runtime)), costUsd: num(prop(m.properties, P.cost)) ?? null },
    findings: findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line),
    rejected: props(m.properties, P.rejected).map((v) => { const k = v.lastIndexOf(":"); return { file: v.slice(0, k), line: Number(v.slice(k + 1)) }; }),
  };
}

/** Stamp a tool's CBOM as a ledger submission: the repository and commit, who and what ran it, and every line's evidence. Occurrences the checkout cannot prove are dropped. */
export function stamp(b: Cbom, o: {
  repo: string; commit: string; url: string; source: Source; submitter: string;
  /** Unique across the repository. Left out, one is generated (a UUID): an id is a handle, not a name. */
  id?: string;
  tool?: { name: string; version?: string }; model?: string | null; config?: string; runtimeMs?: number; costUsd?: number | null;
  rejected?: Array<{ file: string; line: number }>;
  /** Ids of the CBOMs this one started from. */
  buildsOn?: string[];
}): { cbom: Cbom; dropped: number } {
  let dropped = 0;
  const components = assets(b).map((c) => {
    const occ: Occurrence[] = [], ev: Prop[] = [];
    for (const x of c.evidence?.occurrences ?? []) {
      const lines = o.source.lines(x.location);
      // A whole-file asset (no line) is pinned to the file's first line.
      const line = Number.isInteger(x.line) && x.line! > 0 ? x.line! : 1;
      if (!lines || line > lines.length) { dropped++; continue; }
      occ.push({ ...x, location: x.location, line, ...(x.line ? {} : { additionalContext: [x.additionalContext, "whole file"].filter(Boolean).join("; ") }) });
      ev.push({ name: P.evidence, value: `${x.location}:${line}=${evidenceOf(lines[line - 1]!)}` });
    }
    return { ...c, evidence: { ...c.evidence, occurrences: occ }, properties: [...(c.properties ?? []).filter((p) => p.name !== P.evidence), ...ev] };
  }).filter((c) => c.evidence.occurrences.length);
  const meta: Prop[] = [
    { name: P.id, value: o.id ?? crypto.randomUUID() }, { name: P.submitter, value: o.submitter },
    ...(o.model ? [{ name: P.model, value: o.model }] : []), ...(o.config ? [{ name: P.config, value: o.config }] : []),
    { name: P.assets, value: String(components.length) },
    ...(o.runtimeMs != null ? [{ name: P.runtime, value: String(Math.round(o.runtimeMs)) }] : []),
    ...(o.costUsd != null ? [{ name: P.cost, value: String(o.costUsd) }] : []),
    ...(o.rejected ?? []).map((r) => ({ name: P.rejected, value: `${r.file}:${r.line}` })),
    ...(o.buildsOn?.length ? [{ name: P.buildsOn, value: o.buildsOn.join(",") }] : []),
  ];
  const keep = new Set(components.map((c) => c["bom-ref"]).filter(Boolean));
  return {
    dropped,
    cbom: {
      $schema: "http://cyclonedx.org/schema/bom-1.6.schema.json", bomFormat: "CycloneDX", specVersion: "1.6",
      serialNumber: `urn:uuid:${crypto.randomUUID()}`, version: 1,
      metadata: {
        timestamp: b.metadata?.timestamp ?? new Date().toISOString(),
        tools: { components: [o.tool ? { type: "application", ...o.tool } : b.metadata?.tools?.components?.[0] ?? { type: "application", name: "unknown" }] },
        component: { type: "application", name: o.repo, version: o.commit, "bom-ref": `repo:${o.repo}@${o.commit}`, externalReferences: [{ type: "vcs", url: o.url }] },
        properties: [...(b.metadata?.properties ?? []).filter((p) => !p.name.startsWith("weakcrypto:")), ...meta],
      },
      components,
      // Dependencies that point at a dropped component would not validate.
      ...(b.dependencies ? { dependencies: (b.dependencies as Array<{ ref: string; dependsOn?: string[] }>).filter((d) => keep.has(d.ref)).map((d) => ({ ...d, ...(d.dependsOn ? { dependsOn: d.dependsOn.filter((x) => keep.has(x)) } : {}) })) } : {}),
    },
  };
}
