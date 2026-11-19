import pool from "../config/db.js";
import AppError from "../utils/AppError.js";
import storageService from "./storage.service.js";
import env from "../config/env.js";
import {
    validateFileName,
    validateFileId,
    validateFileContent
} from "../utils/fileValidator.js";
import { requireFileAccess, requireFolderAccess } from "./access.service.js";

/**
 * Ensures a PostgreSQL user record exists for the given Firebase UID
 * to preserve the owner_id foreign key constraint.
 */
export async function getOrCreatePostgresUserId(ownerUid, email = null, name = null, emailVerified = false) {
    if (!ownerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    const userRes = await pool.query(
        "SELECT id FROM users WHERE firebase_uid = $1",
        [ownerUid]
    );

    if (userRes.rows.length > 0) {
        return userRes.rows[0].id;
    }

    // Link an existing record by email ONLY when Firebase has verified the email.
    // Otherwise anyone could sign up with someone else's address and claim their record.
    if (email && emailVerified) {
        const linkRes = await pool.query(
            "UPDATE users SET firebase_uid = $1 WHERE email = $2 AND firebase_uid IS NULL RETURNING id",
            [ownerUid, email]
        );
        if (linkRes.rows.length > 0) {
            return linkRes.rows[0].id;
        }
    }

    // Create user record to satisfy NOT NULL foreign key.
    // Unverified emails are not stored, so they cannot collide with (or squat) a real user's email.
    const insertRes = await pool.query(
        "INSERT INTO users (name, email, firebase_uid) VALUES ($1, $2, $3) RETURNING id",
        [name || "ShareSync User", (emailVerified && email) || `${ownerUid}@sharesync.local`, ownerUid]
    );

    return insertRes.rows[0].id;
}

const PUBLIC_FILE_FIELDS = "id, name, size, mime_type, folder_id, created_at, updated_at";

/** Removes internal fields before a file record is sent to a client. */
function toPublicFile(file, permission) {
    const out = {
        id: file.id,
        name: file.name,
        size: file.size,
        mime_type: file.mime_type,
        folder_id: file.folder_id,
        created_at: file.created_at,
        updated_at: file.updated_at
    };
    if (permission) out.access = permission;
    return out;
}

/** True if a request value means "the root of my workspace". */
function isRootValue(value) {
    return value === null || value === undefined || value === "null" || value === "root" || value === "";
}

/** Case-insensitive duplicate name check inside one owner's folder (or root). */
async function assertNameAvailable(ownerUid, folderId, name, excludeId = null, message = "A file with this name already exists in this location") {
    const params = [ownerUid, name];
    let sql = folderId === null
        ? "SELECT id FROM files WHERE owner_firebase_uid = $1 AND folder_id IS NULL AND LOWER(name) = LOWER($2)"
        : "SELECT id FROM files WHERE owner_firebase_uid = $1 AND folder_id = $3 AND LOWER(name) = LOWER($2)";
    if (folderId !== null) params.push(folderId);
    if (excludeId !== null) {
        params.push(excludeId);
        sql += ` AND id != $${params.length}`;
    }
    const dup = await pool.query(sql, params);
    if (dup.rows.length > 0) {
        throw new AppError(message, 409);
    }
}

/**
 * Uploads a file into the caller's root, one of their folders, or a folder shared with them as editor.
 * Files uploaded into a shared folder belong to the folder's owner (so they stay inside the shared tree);
 * the uploader is recorded in uploaded_by_uid.
 */
export async function uploadFile(callerUid, userMeta, fileData, { folder_id = null } = {}) {
    if (!callerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    if (!fileData || !fileData.buffer) {
        throw new AppError("No file provided for upload", 400);
    }

    const validName = validateFileName(fileData.originalname);

    // Validate actual file content (magic numbers, signatures, and size limit)
    const { verifiedMimeType, size } = validateFileContent(
        fileData.buffer,
        fileData.mimetype,
        validName,
        env.maxFileSize
    );

    let validFolderId = null;
    let ownerUid = callerUid;

    if (!isRootValue(folder_id)) {
        validFolderId = validateFileId(folder_id);
        let access;
        try {
            access = await requireFolderAccess(callerUid, validFolderId, "editor", "upload files to this folder");
        } catch (err) {
            if (err.statusCode === 404) throw new AppError("Target folder not found", 404);
            throw err;
        }
        ownerUid = access.folder.owner_firebase_uid;
    }

    await assertNameAvailable(ownerUid, validFolderId, validName);

    // Get or create PostgreSQL owner_id for the file owner
    const ownerId = ownerUid === callerUid
        ? await getOrCreatePostgresUserId(ownerUid, userMeta?.email, userMeta?.name, userMeta?.emailVerified === true)
        : await getOrCreatePostgresUserId(ownerUid);

    // Write encrypted file to storage
    const { storagePath, encrypted } = await storageService.saveFile({
        ownerUid,
        filename: validName,
        buffer: fileData.buffer
    });

    try {
        const result = await pool.query(
            `INSERT INTO files (name, size, mime_type, storage_path, owner_id, folder_id, owner_firebase_uid,
                                uploaded_by_uid, is_encrypted, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING ${PUBLIC_FILE_FIELDS}`,
            [validName, size, verifiedMimeType, storagePath, ownerId, validFolderId, ownerUid, callerUid, encrypted === true]
        );

        return result.rows[0];
    } catch (dbErr) {
        // Rollback disk write if DB insert fails
        await storageService.deleteFile(storagePath);
        if (dbErr.code === "23505") {
            throw new AppError("A file with this name already exists in this location", 409);
        }
        throw dbErr;
    }
}

/**
 * Lists files. With a folder ID, lists that folder's files if the caller can view it
 * (owned or shared). Without one, lists the caller's own files.
 */
export async function getFiles(callerUid, { folder_id } = {}) {
    if (!callerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    if (folder_id !== undefined && folder_id !== "") {
        if (folder_id === "root" || folder_id === "null" || folder_id === null) {
            const result = await pool.query(
                `SELECT ${PUBLIC_FILE_FIELDS}
                 FROM files
                 WHERE owner_firebase_uid = $1 AND folder_id IS NULL
                 ORDER BY name ASC`,
                [callerUid]
            );
            return result.rows;
        }

        const validFolderId = validateFileId(folder_id);
        await requireFolderAccess(callerUid, validFolderId, "viewer", "access files in this folder");

        const result = await pool.query(
            `SELECT ${PUBLIC_FILE_FIELDS}
             FROM files
             WHERE folder_id = $1
             ORDER BY name ASC`,
            [validFolderId]
        );
        return result.rows;
    }

    const result = await pool.query(
        `SELECT ${PUBLIC_FILE_FIELDS}
         FROM files
         WHERE owner_firebase_uid = $1
         ORDER BY folder_id NULLS FIRST, name ASC`,
        [callerUid]
    );
    return result.rows;
}

/**
 * Gets file metadata by ID (owner or shared user). Never exposes internal storage_path.
 * Includes `access` so clients know which actions to offer.
 */
export async function getFileById(fileId, callerUid) {
    const validId = validateFileId(fileId);
    const { file, permission } = await requireFileAccess(callerUid, validId, "viewer", "access this file");
    return toPublicFile(file, permission);
}

/**
 * Opens a decrypted stream of a file record. Shared by user downloads and link downloads.
 */
export async function openFileStream(file) {
    const { stream, size } = await storageService.getFileStream(file.storage_path, {
        encrypted: file.is_encrypted === true
    });
    return {
        fileRecord: {
            id: file.id,
            name: file.name,
            mime_type: file.mime_type,
            size: size ?? file.size
        },
        stream
    };
}

/**
 * Retrieves file record and stream for secure download (owner, editor or viewer).
 */
export async function getFileForDownload(fileId, callerUid) {
    const validId = validateFileId(fileId);
    const { file } = await requireFileAccess(callerUid, validId, "viewer", "download this file");
    return openFileStream(file);
}

/**
 * Renames a file (owner or editor).
 */
export async function renameFile(fileId, callerUid, newName) {
    const validId = validateFileId(fileId);
    const validName = validateFileName(newName);

    const { file, permission } = await requireFileAccess(callerUid, validId, "editor", "rename this file");

    if (file.name === validName) {
        return toPublicFile(file, permission);
    }

    await assertNameAvailable(file.owner_firebase_uid, file.folder_id, validName, validId);

    const result = await pool.query(
        `UPDATE files
         SET name = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING ${PUBLIC_FILE_FIELDS}`,
        [validName, validId]
    );

    return result.rows[0];
}

/**
 * Moves a file between the owner's folders (or to root). Owner only:
 * moving can take a file out of a shared folder, so shared users may not do it.
 */
export async function moveFile(fileId, callerUid, targetFolderId) {
    const validId = validateFileId(fileId);
    const { file } = await requireFileAccess(callerUid, validId, "owner", "move this file");

    let validTargetId = null;

    if (!isRootValue(targetFolderId)) {
        validTargetId = validateFileId(targetFolderId);

        const folderRes = await pool.query(
            "SELECT id, owner_firebase_uid FROM folders WHERE id = $1",
            [validTargetId]
        );

        if (folderRes.rows.length === 0) {
            throw new AppError("Target folder not found", 404);
        }

        if (folderRes.rows[0].owner_firebase_uid !== callerUid) {
            throw new AppError("Forbidden: You do not have permission to move files to this folder", 403);
        }
    }

    await assertNameAvailable(callerUid, validTargetId, file.name, validId, "A file with this name already exists in the target folder");

    const result = await pool.query(
        `UPDATE files
         SET folder_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING ${PUBLIC_FILE_FIELDS}`,
        [validTargetId, validId]
    );

    return result.rows[0];
}

/**
 * Deletes a file from database and disk storage (owner or editor).
 * The database row is removed first so a storage failure never leaves a row pointing at nothing.
 */
export async function deleteFile(fileId, callerUid) {
    const validId = validateFileId(fileId);
    const { file } = await requireFileAccess(callerUid, validId, "editor", "delete this file");

    await pool.query("DELETE FROM files WHERE id = $1", [validId]);

    if (file.storage_path) {
        await storageService.deleteFile(file.storage_path);
    }

    return {
        id: file.id,
        name: file.name
    };
}
