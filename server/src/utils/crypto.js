import crypto from "crypto";
import AppError from "./AppError.js";

/**
 * Encryption at rest for stored files.
 *
 * Format of an encrypted file on disk (version 1):
 *   MAGIC "SSE1" (4) | salt (16) | iv (12) | ciphertext (n) | auth tag (16)
 *
 * Each file gets its own AES-256-GCM key derived with HKDF-SHA256 from the master key
 * (FILE_ENCRYPTION_KEY) and a random per-file salt. GCM authenticates the data, so any
 * tampering with a stored file is detected when it is read.
 */
export const ENC_MAGIC = Buffer.from("SSE1");
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;
export const ENC_HEADER_LEN = ENC_MAGIC.length + SALT_LEN + IV_LEN; // 32
export const ENC_OVERHEAD = ENC_HEADER_LEN + TAG_LEN; // 48
const HKDF_INFO = Buffer.from("sharesync-file-encryption-v1");

let cachedMasterKey = null;

/** Loads and validates the 32-byte master key (base64 or hex) from FILE_ENCRYPTION_KEY. */
export function getMasterKey() {
    if (cachedMasterKey) return cachedMasterKey;
    const raw = (process.env.FILE_ENCRYPTION_KEY || "").trim();
    if (!raw) {
        throw new Error(
            "FILE_ENCRYPTION_KEY is not set. Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
        );
    }
    const key = /^[0-9a-fA-F]{64}$/.test(raw) ? Buffer.from(raw, "hex") : Buffer.from(raw, "base64");
    if (key.length !== 32) {
        throw new Error("FILE_ENCRYPTION_KEY must decode to exactly 32 bytes (base64 or 64 hex chars)");
    }
    cachedMasterKey = key;
    return key;
}

function deriveFileKey(salt) {
    return Buffer.from(crypto.hkdfSync("sha256", getMasterKey(), salt, HKDF_INFO, 32));
}

/** Encrypts a whole buffer into the on-disk format. */
export function encryptBuffer(plaintext) {
    const salt = crypto.randomBytes(SALT_LEN);
    const iv = crypto.randomBytes(IV_LEN);
    const cipher = crypto.createCipheriv("aes-256-gcm", deriveFileKey(salt), iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return Buffer.concat([ENC_MAGIC, salt, iv, ciphertext, cipher.getAuthTag()]);
}

/** Parses the header and tag of an encrypted file and returns a streaming decipher. */
export function createDecryptStream(header, tag) {
    if (header.length !== ENC_HEADER_LEN || !header.subarray(0, 4).equals(ENC_MAGIC)) {
        throw new AppError("Stored file is corrupted or not encrypted", 500);
    }
    const salt = header.subarray(4, 4 + SALT_LEN);
    const iv = header.subarray(4 + SALT_LEN, ENC_HEADER_LEN);
    const decipher = crypto.createDecipheriv("aes-256-gcm", deriveFileKey(salt), iv);
    decipher.setAuthTag(tag);
    return decipher;
}

// ---------------------------------------------------------------------------
// Share-link passwords: scrypt, never stored or logged in plaintext
// ---------------------------------------------------------------------------
const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SCRYPT_KEYLEN = 32;

export function hashPassword(password) {
    const salt = crypto.randomBytes(16);
    const hash = crypto.scryptSync(password, salt, SCRYPT_KEYLEN, SCRYPT_PARAMS);
    return `scrypt$${SCRYPT_PARAMS.N}$${SCRYPT_PARAMS.r}$${SCRYPT_PARAMS.p}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password, stored) {
    if (typeof password !== "string" || typeof stored !== "string") return false;
    const parts = stored.split("$");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [, N, r, p, saltB64, hashB64] = parts;
    const expected = Buffer.from(hashB64, "base64");
    const actual = crypto.scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, {
        N: Number(N), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

/** SHA-256 hex of a share token (only the hash is ever stored). */
export function hashToken(rawToken) {
    return crypto.createHash("sha256").update(rawToken).digest("hex");
}
