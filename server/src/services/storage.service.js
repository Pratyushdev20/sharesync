import fs from "fs";
import path from "path";
import crypto from "crypto";
import { pipeline } from "stream";
import env from "../config/env.js";
import AppError from "../utils/AppError.js";
import log from "../utils/log.js";
import { encryptBuffer, DecryptStream, ENC_OVERHEAD } from "../utils/crypto.js";

/**
 * Storage Service
 *
 * Every file is encrypted (AES-256-GCM) BEFORE it reaches a storage backend, so neither the
 * disk nor the object store ever sees plaintext.
 *
 * Drivers:
 *  - LocalDriver: files under UPLOAD_DIR (default). storage_path = "<uid>/<uuid>_<name>"
 *  - S3Driver:    any S3-compatible object store (AWS S3, Cloudflare R2, MinIO, Backblaze B2...).
 *                 storage_path = "s3:<key>"
 *
 * New uploads go to the configured driver; reads/deletes pick the driver from the stored
 * path, so switching STORAGE_DRIVER never breaks files that were stored earlier.
 */

const S3_PREFIX = "s3:";

function sanitizeComponent(component) {
    return String(component).replace(/[^a-zA-Z0-9_-]/g, "_");
}

function objectName(ownerUid, filename) {
    const baseName = path.basename(filename).replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);
    return `${sanitizeComponent(ownerUid)}/${crypto.randomUUID()}_${baseName}`;
}

/** Wraps a raw stored-byte stream into a plaintext stream (decrypting if needed). */
function toPlaintextStream(raw, encrypted) {
    if (!encrypted) return raw;
    return pipeline(raw, new DecryptStream(), (err) => {
        if (err) log.warn("storage.decrypt_failed", { err });
    });
}

export class LocalDriver {
    constructor(baseDir = env.uploadDir) {
        this.baseDir = path.resolve(baseDir);
    }

    /** Resolves a storage path strictly inside baseDir (blocks traversal and sibling dirs). */
    _resolvePath(storagePath) {
        const normalized = path.normalize(storagePath).replace(/^(\.\.(\/|\\|$))+/, "");
        const resolved = path.resolve(this.baseDir, normalized);
        const relative = path.relative(this.baseDir, resolved);
        if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) {
            throw new AppError("Invalid storage path: Path traversal detected", 400);
        }
        return resolved;
    }

    async put(ownerUid, filename, encryptedBuffer) {
        const rel = objectName(ownerUid, filename);
        const full = this._resolvePath(rel);
        await fs.promises.mkdir(path.dirname(full), { recursive: true });
        // "wx" refuses to overwrite; 0600 = owner read/write only
        await fs.promises.writeFile(full, encryptedBuffer, { flag: "wx", mode: 0o600 });
        return rel;
    }

    async openRaw(storagePath) {
        const resolved = this._resolvePath(storagePath);
        let stats;
        try {
            stats = await fs.promises.stat(resolved);
        } catch (err) {
            if (err.code === "ENOENT") throw new AppError("File not found on storage", 404);
            throw err;
        }
        if (!stats.isFile()) throw new AppError("File not found on storage", 404);
        return { raw: fs.createReadStream(resolved), storedSize: stats.size };
    }

    async remove(storagePath) {
        try {
            await fs.promises.unlink(this._resolvePath(storagePath));
            return true;
        } catch (err) {
            if (err.code !== "ENOENT") log.warn("storage.delete_failed", { err });
            return false;
        }
    }

    async exists(storagePath) {
        try {
            await fs.promises.access(this._resolvePath(storagePath), fs.constants.F_OK);
            return true;
        } catch {
            return false;
        }
    }

    /** Readiness probe: the upload directory must be writable. */
    async check() {
        await fs.promises.mkdir(this.baseDir, { recursive: true });
        await fs.promises.access(this.baseDir, fs.constants.W_OK);
        return { driver: "local" };
    }
}

export class S3Driver {
    /**
     * @param {object} [options]
     * @param {object} [options.client] - injected S3Client-compatible object (used by tests)
     */
    constructor({ client, bucket = env.s3.bucket, prefix = env.s3.prefix } = {}) {
        this.bucket = bucket;
        this.prefix = prefix;
        this._client = client || null;
        this._sdk = null;
    }

    async _lib() {
        if (!this._sdk) this._sdk = await import("@aws-sdk/client-s3");
        return this._sdk;
    }

    async _clientInstance() {
        if (this._client) return this._client;
        const { S3Client } = await this._lib();
        this._client = new S3Client({
            region: env.s3.region,
            endpoint: env.s3.endpoint,
            forcePathStyle: env.s3.forcePathStyle,
            credentials: { accessKeyId: env.s3.accessKeyId, secretAccessKey: env.s3.secretAccessKey },
        });
        return this._client;
    }

    _key(storagePath) {
        const key = storagePath.slice(S3_PREFIX.length);
        if (!key || key.includes("..") || key.startsWith("/")) {
            throw new AppError("Invalid storage path", 400);
        }
        return key;
    }

    async put(ownerUid, filename, encryptedBuffer) {
        const { PutObjectCommand } = await this._lib();
        const key = `${this.prefix}${objectName(ownerUid, filename)}`;
        await (await this._clientInstance()).send(new PutObjectCommand({
            Bucket: this.bucket,
            Key: key,
            Body: encryptedBuffer,
            ContentType: "application/octet-stream", // content is ciphertext; real type lives in the DB
            ServerSideEncryption: process.env.S3_SSE === "false" ? undefined : "AES256",
        }));
        return `${S3_PREFIX}${key}`;
    }

    async openRaw(storagePath) {
        const { GetObjectCommand } = await this._lib();
        try {
            const res = await (await this._clientInstance()).send(new GetObjectCommand({
                Bucket: this.bucket,
                Key: this._key(storagePath),
            }));
            return { raw: res.Body, storedSize: Number(res.ContentLength) };
        } catch (err) {
            if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
                throw new AppError("File not found on storage", 404);
            }
            throw err;
        }
    }

    async remove(storagePath) {
        const { DeleteObjectCommand } = await this._lib();
        try {
            await (await this._clientInstance()).send(new DeleteObjectCommand({
                Bucket: this.bucket,
                Key: this._key(storagePath),
            }));
            return true;
        } catch (err) {
            log.warn("storage.delete_failed", { err });
            return false;
        }
    }

    async exists(storagePath) {
        const { HeadObjectCommand } = await this._lib();
        try {
            await (await this._clientInstance()).send(new HeadObjectCommand({ Bucket: this.bucket, Key: this._key(storagePath) }));
            return true;
        } catch {
            return false;
        }
    }

    async check() {
        const { HeadBucketCommand } = await this._lib();
        await (await this._clientInstance()).send(new HeadBucketCommand({ Bucket: this.bucket }));
        return { driver: "s3" };
    }
}

class StorageService {
    constructor({ local = new LocalDriver(), s3 = null, driver = env.storageDriver } = {}) {
        this.local = local;
        this._s3 = s3;
        this.driver = driver;
    }

    get s3() {
        if (!this._s3) this._s3 = new S3Driver();
        return this._s3;
    }

    _driverFor(storagePath) {
        return String(storagePath).startsWith(S3_PREFIX) ? this.s3 : this.local;
    }

    /** Backwards-compatible path resolver used by scripts/tests for local files. */
    _resolvePath(storagePath) {
        return this.local._resolvePath(storagePath);
    }

    /**
     * Encrypts and stores a file buffer.
     * @returns {Promise<{ storagePath: string, size: number, encrypted: true }>}
     */
    async saveFile({ ownerUid, filename, buffer }) {
        const target = this.driver === "s3" ? this.s3 : this.local;
        const storagePath = await target.put(ownerUid, filename, encryptBuffer(buffer));
        return { storagePath, size: buffer.length, encrypted: true };
    }

    /**
     * Opens a plaintext stream of a stored file.
     * @returns {Promise<{ stream: import("stream").Readable, size: number }>} size = plaintext size
     */
    async getFileStream(storagePath, { encrypted = false } = {}) {
        const { raw, storedSize } = await this._driverFor(storagePath).openRaw(storagePath);
        if (encrypted && Number.isFinite(storedSize) && storedSize < ENC_OVERHEAD) {
            raw.destroy?.();
            throw new AppError("Stored file is corrupted", 500);
        }
        return {
            stream: toPlaintextStream(raw, encrypted),
            size: encrypted ? storedSize - ENC_OVERHEAD : storedSize,
        };
    }

    async deleteFile(storagePath) {
        return this._driverFor(storagePath).remove(storagePath);
    }

    async fileExists(storagePath) {
        return this._driverFor(storagePath).exists(storagePath);
    }

    /** Readiness probe for the active driver. */
    async check() {
        return (this.driver === "s3" ? this.s3 : this.local).check();
    }
}

const storageService = new StorageService();
export { StorageService };
export default storageService;
