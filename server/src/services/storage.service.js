import fs from "fs";
import path from "path";
import crypto from "crypto";
import { PassThrough, Transform, pipeline } from "stream";
import env from "../config/env.js";
import AppError from "../utils/AppError.js";
import { encryptBuffer, createDecryptStream, ENC_HEADER_LEN, ENC_OVERHEAD } from "../utils/crypto.js";

/**
 * Storage Service
 * Abstraction layer for file storage operations (currently local disk).
 * Can be swapped with cloud storage (S3, GCS) by replacing this module.
 */
class LocalStorageService {
    constructor(baseDir = env.uploadDir) {
        this.baseDir = path.resolve(baseDir);
    }

    /**
     * Sanitizes a UID or component to avoid filesystem navigation
     */
    _sanitizeComponent(component) {
        return String(component).replace(/[^a-zA-Z0-9_-]/g, "_");
    }

    /**
     * Resolves and secures a storage path within baseDir, preventing path traversal
     */
    _resolvePath(storagePath) {
        // Normalize slashes
        const normalized = path.normalize(storagePath).replace(/^(\.\.(\/|\\|$))+/, "");
        const resolved = path.resolve(this.baseDir, normalized);

        // Path traversal check: resolved path must be strictly inside baseDir
        // (a plain startsWith would accept sibling dirs like "uploads_evil")
        const relative = path.relative(this.baseDir, resolved);
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
            throw new AppError("Invalid storage path: Path traversal detected", 400);
        }

        return resolved;
    }

    /**
     * Saves a file buffer to storage
     * @param {Object} options
     * @param {string} options.ownerUid - Firebase UID of the owner
     * @param {string} options.filename - Original validated filename
     * @param {Buffer} options.buffer - File buffer
     * @returns {Promise<{ storagePath: string, size: number }>}
     */
    async saveFile({ ownerUid, filename, buffer }) {
        const safeUid = this._sanitizeComponent(ownerUid);
        const userDir = path.join(this.baseDir, safeUid);

        // Ensure directory exists
        await fs.promises.mkdir(userDir, { recursive: true });

        // Generate unique filename using crypto.randomUUID()
        const uniqueId = crypto.randomUUID();
        const baseName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_");
        const storedFilename = `${uniqueId}_${baseName}`;

        const fullPath = path.join(userDir, storedFilename);
        // Encrypt at rest (AES-256-GCM, per-file key). Plaintext never touches the disk.
        // "wx" refuses to overwrite an existing file.
        await fs.promises.writeFile(fullPath, encryptBuffer(buffer), { flag: "wx", mode: 0o600 });

        // Return relative storage path for DB persistence
        const storagePath = path.join(safeUid, storedFilename).replace(/\\/g, "/");

        return {
            storagePath,
            size: buffer.length,
            encrypted: true
        };
    }

    /**
     * Retrieves a readable (decrypted) stream for file download.
     * @param {string} storagePath - Relative storage path stored in DB
     * @param {Object} [options]
     * @param {boolean} [options.encrypted=false] - Whether the stored file is encrypted (files.is_encrypted)
     * @returns {Promise<{ stream: import("stream").Readable, size: number }>} size is the plaintext size
     */
    async getFileStream(storagePath, { encrypted = false } = {}) {
        const resolved = this._resolvePath(storagePath);

        let stats;
        try {
            stats = await fs.promises.stat(resolved);
        } catch (err) {
            if (err.code === "ENOENT") {
                throw new AppError("File not found on storage", 404);
            }
            throw err;
        }
        if (!stats.isFile()) {
            throw new AppError("File not found on storage", 404);
        }

        // Legacy files uploaded before encryption was introduced
        if (!encrypted) {
            return { stream: fs.createReadStream(resolved), size: stats.size };
        }

        if (stats.size < ENC_OVERHEAD) {
            throw new AppError("Stored file is corrupted", 500);
        }

        // Read header and auth tag, then stream-decrypt the ciphertext in between
        const handle = await fs.promises.open(resolved, "r");
        const header = Buffer.alloc(ENC_HEADER_LEN);
        const tag = Buffer.alloc(16);
        try {
            await handle.read(header, 0, ENC_HEADER_LEN, 0);
            await handle.read(tag, 0, 16, stats.size - 16);
        } finally {
            await handle.close();
        }

        const decipher = createDecryptStream(header, tag);
        const plaintextSize = stats.size - ENC_OVERHEAD;
        if (plaintextSize === 0) {
            // Nothing to stream; still verify the tag
            const output = new PassThrough();
            try { decipher.final(); output.end(); } catch { output.destroy(new AppError("Stored file failed integrity check", 500)); }
            return { stream: output, size: 0 };
        }

        const source = fs.createReadStream(resolved, { start: ENC_HEADER_LEN, end: stats.size - 17 });

        // GCM only verifies integrity at the very end. Hold back the last decrypted chunk until
        // verification succeeds, so a tampered file can never be delivered complete: the client
        // receives fewer bytes than Content-Length and the transfer fails.
        let held = null;
        const holdback = new Transform({
            transform(chunk, _enc, cb) {
                if (held) this.push(held);
                held = chunk;
                cb();
            },
            flush(cb) {
                if (held) this.push(held);
                cb();
            }
        });

        const stream = pipeline(source, decipher, holdback, (err) => {
            if (err) console.error("Decryption stream error (possible tampering):", err.message);
        });
        return { stream, size: plaintextSize };
    }

    /**
     * Deletes a file from storage
     * @param {string} storagePath - Relative storage path stored in DB
     * @returns {Promise<boolean>}
     */
    async deleteFile(storagePath) {
        try {
            const resolved = this._resolvePath(storagePath);
            await fs.promises.unlink(resolved);
            return true;
        } catch (err) {
            // If already deleted, ignore ENOENT
            if (err.code === "ENOENT") {
                return false;
            }
            console.error("Storage delete warning:", err.message);
            return false;
        }
    }

    /**
     * Checks if a file exists on storage
     * @param {string} storagePath
     * @returns {Promise<boolean>}
     */
    async fileExists(storagePath) {
        try {
            const resolved = this._resolvePath(storagePath);
            await fs.promises.access(resolved, fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }
}

const storageService = new LocalStorageService();
export default storageService;
