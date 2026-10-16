# The ledger's CBOM profile

A submission is a [CycloneDX 1.6](https://cyclonedx.org/docs/1.6/json/) cryptography
bill of materials. It must be valid against the official CycloneDX 1.6 schema, and
add the following, so it can be checked at its commit and scored. `weakcrypto
check` and CI validate both.

| Where | What | Required |
| --- | --- | --- |
| `metadata.component.name` | The repository, `owner/repo`, lowercased | yes |
| `metadata.component.version` | The scanned commit, full 40-character SHA | yes |
| `metadata.tools.components[0]` | The tool: `name`, `version` | yes |
| `metadata.timestamp` | When it ran | yes |
| `metadata.properties` `weakcrypto:id` | A handle, unique across the repository and used once; also the file name (`<id>.cbom.json`). `stamp` generates one (a UUID) | yes |
| `metadata.properties` `weakcrypto:submitter` | The GitHub account that commits it (a GitHub App's login ends in `[bot]`). CI checks it against the author of the commit that adds the file; the sites it is first to report are credited to this account | yes |
| `metadata.properties` `weakcrypto:asset-count` | The number of assets found = the number of `cryptographic-asset` components | yes |
| `metadata.properties` `weakcrypto:model` | The model that drove or assisted the tool | if any |
| `metadata.properties` `weakcrypto:config` | The template or settings | no |
| `metadata.properties` `weakcrypto:runtime-ms`, `weakcrypto:cost-usd` | What the run took | no |
| `metadata.properties` `weakcrypto:rejected` (repeatable) | `path:line` the tool examined and judged not cryptographic | no |
| `metadata.properties` `weakcrypto:builds-on` | ids of the CBOMs (same repository and commit) this one started from, comma separated | no |
| `components[]` of type `cryptographic-asset` | One per asset: `name`, `cryptoProperties` (assetType; for algorithms the CycloneDX `primitive`) | yes |
| `components[].evidence.occurrences[]` | Every place it occurs: `location` (path from the repository root) and `line` | yes |
| `components[].properties` `weakcrypto:evidence` (one per occurrence) | `path:line=<hash>`: first 16 hex of SHA-256 over the line's trimmed text at the commit | yes |

Quantum vulnerability is CycloneDX's own field: `algorithmProperties.nistQuantumSecurityLevel: 0`
on a public-key scheme Shor's algorithm breaks (signature, key-agree, pke, kem).

## Example

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.6",
  "serialNumber": "urn:uuid:6f0c6a7e-3c1b-4c55-9a8f-0d9a3b8f2e11",
  "version": 1,
  "metadata": {
    "timestamp": "2026-10-10T17:30:00Z",
    "tools": { "components": [{ "type": "application", "name": "semgrep", "version": "1.90.0" }] },
    "component": { "type": "application", "name": "acme/app", "version": "a6443895a894d89641710a68d82e870e190b57f4" },
    "properties": [
      { "name": "weakcrypto:id", "value": "0b6f6d2e-6c0a-4b7e-9a57-3f0b9d1c2a44" },
      { "name": "weakcrypto:submitter", "value": "ada" },
      { "name": "weakcrypto:asset-count", "value": "1" }
    ]
  },
  "components": [
    {
      "type": "cryptographic-asset",
      "name": "RSA",
      "bom-ref": "asset-1",
      "cryptoProperties": { "assetType": "algorithm", "algorithmProperties": { "primitive": "signature", "nistQuantumSecurityLevel": 0 } },
      "evidence": { "occurrences": [{ "location": "src/sign.js", "line": 4 }] },
      "properties": [{ "name": "weakcrypto:evidence", "value": "src/sign.js:4=3f9a1c0b7e2d4a65" }]
    }
  ]
}
```
