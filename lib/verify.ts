// Checking a submission against the repository at its commit, line by line:
//   missing      the file is not there at that commit
//   out-of-range the file is shorter than the line claimed
//   mismatch     the line's text does not match the evidence hash
//   suspect      it is there, but nothing near it looks like cryptography
//   ok           it is there, matches, and looks like cryptography
// The first three make a submission invalid. Suspect lines go to review.

import type { Finding, Submission } from "./types.ts";
import { evidenceOf, type Source } from "./source.ts";

// Words that mark cryptography in code, configs and docs, across languages.
const CRYPTO = new RegExp([
  "\\b(?:aes|des|3des|tripledes|rc4|blowfish|chacha(?:20)?|poly1305|salsa20|camellia|sm4)\\b",
  "\\b(?:rsa|dsa|ecdsa|eddsa|ed25519|ed448|x25519|x448|ecdh|ecdhe|dhe?|diffie|elgamal|secp\\d+[kr]1|p-?(?:256|384|521)|prime256v1|curve25519|brainpool)",
  "\\b(?:sha-?(?:1|2|224|256|384|512|3)|sha3|md[245]|ripemd|blake[23]?|keccak|whirlpool|sm3)\\b",
  "\\b(?:hmac|cmac|gmac|pbkdf2?|hkdf|bcrypt|scrypt|argon2(?:id|i|d)?|kdf)\\b",
  "\\b(?:tls|ssl|dtls|x\\.?509|pkcs#?\\d*|pem|der|asn\\.?1|csr|certificate|cert(?:ificate)?s?|keystore|truststore)\\b",
  "\\b(?:jwt|jws|jwe|jwk|jose|paseto|oauth|saml|ssh|gpg|pgp|openpgp)\\b",
  "\\b(?:kyber|ml-?kem|ml-?dsa|slh-?dsa|dilithium|falcon|sphincs|frodo|ntru|hqc|bike)\\b",
  "(?:crypt|cipher|encrypt|decrypt|digest|hash|signat|sign\\(|verify|keypair|key_?pair|private_?key|public_?key|secret_?key|nonce|\\biv\\b|salt|random|entropy|secure_?random|getrandom|urandom|keygen|key_?derivation)",
  "(?:openssl|boringssl|libressl|wolfssl|mbedtls|gnutls|nss|bouncy_?castle|libsodium|sodium|nacl|tweetnacl|ring|rustls|webcrypto|subtle\\.|node:crypto|crypto/|javax\\.crypto|java\\.security|cryptography|pycryptodome|pyca|golang\\.org/x/crypto|jsonwebtoken|jose|noble|elliptic|bn\\.js|forge|crypto-js|bcryptjs|argon2|libgcrypt|nettle|botan|cryptopp|tink)",
].join("|"), "i");

const NEAR = 3;

export type CheckStatus = "ok" | "suspect" | "missing" | "out-of-range" | "mismatch";
export interface Checked { file: string; line: number; status: CheckStatus }
export interface Verification {
  valid: boolean;
  counts: Record<CheckStatus, number>;
  checked: Checked[];
  /** Why it is invalid: the first few bad lines, in words. */
  problems: string[];
}

export const looksCrypto = (lines: string[], line: number) =>
  lines.slice(Math.max(0, line - 1 - NEAR), Math.min(lines.length, line + NEAR)).some((l) => CRYPTO.test(l));

export function checkFinding(src: Source, f: Pick<Finding, "file" | "line" | "evidence">): CheckStatus {
  const lines = src.lines(f.file);
  if (!lines) return "missing";
  if (f.line > lines.length) return "out-of-range";
  if (evidenceOf(lines[f.line - 1]!) !== f.evidence) return "mismatch";
  return looksCrypto(lines, f.line) ? "ok" : "suspect";
}

export function verify(sub: Submission, src: Source): Verification {
  if (src.commit !== sub.commit) throw new Error(`source is at ${src.commit.slice(0, 12)}, the submission at ${sub.commit.slice(0, 12)}`);
  const counts: Record<CheckStatus, number> = { ok: 0, suspect: 0, missing: 0, "out-of-range": 0, mismatch: 0 };
  const checked = sub.findings.map((f) => {
    const status = checkFinding(src, f);
    counts[status]++;
    return { file: f.file, line: f.line, status };
  });
  const bad = checked.filter((c) => c.status === "missing" || c.status === "out-of-range" || c.status === "mismatch");
  return {
    valid: bad.length === 0,
    counts, checked,
    problems: bad.slice(0, 10).map((c) => `${c.file}:${c.line} ${c.status === "missing" ? "is not in the repository at that commit" : c.status === "out-of-range" ? "is past the end of the file" : "does not match its evidence hash"}`),
  };
}
