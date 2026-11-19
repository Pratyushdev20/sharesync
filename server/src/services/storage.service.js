import fs from "fs";
import path from "path";
import crypto from "crypto";
import env from "../config/env.js";
import AppError from "../utils/AppError.js";

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
        await fs.promises.writeFile(fullPath, buffer);

        // Return relative storage path for DB persistence
        const storagePath = path.join(safeUid, storedFilename).replace(/\\/g, "/");

        return {
            storagePath,
            size: buffer.length
        };
    }

    /**
     * Retrieves a readable stream for file download
     * @param {string} storagePath - Relative storage path stored in DB
     * @returns {Promise<{ stream: fs.ReadStream, size: number }>}
     */
    async getFileStream(storagePath) {
        const resolved = this._resolvePath(storagePath);

        try {
            const stats = await fs.promises.stat(resolved);
            if (!stats.isFile()) {
                throw new AppError("Requested resource is not a file", 404);
            }
            const stream = fs.createReadStream(resolved);
            return { stream, size: stats.size };
        } catch (err) {
            if (err.code === "ENOENT" || err.statusCode === 404) {
                throw new AppError("File not found on storage", 404);
            }
            throw err;
        }
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
