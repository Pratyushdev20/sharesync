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
import { audienceForFile, getUserName, publishChange } from "./events.service.js";
import { createNotifications } from "./notification.service.js";

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

const PUBLIC_FILE_FIELDS = "id, name, size, mime_type, folder_id, version, created_at, updated_at";

/** Removes internal fields before a file record is sent to a client. */
function toPublicFile(file, permission) {
    const out = {
        id: file.id,
        name: file.name,
        size: file.size,
        mime_type: file.mime_type,
        folder_id: file.folder_id,
        version: file.version,
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

    let created;
    try {
        const result = await pool.query(
            `INSERT INTO files (name, size, mime_type, storage_path, owner_id, folder_id, owner_firebase_uid,
                                uploaded_by_uid, is_encrypted, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING ${PUBLIC_FILE_FIELDS}`,
            [validName, size, verifiedMimeType, storagePath, ownerId, validFolderId, ownerUid, callerUid, encrypted === true]
        );
        created = result.rows[0];
    } catch (dbErr) {
        // Rollback disk write if DB insert fails
        await storageService.deleteFile(storagePath);
        if (dbErr.code === "23505") {
            throw new AppError("A file with this name already exists in this location", 409);
        }
        throw dbErr;
    }

    await announce({
        actorUid: callerUid,
        eventType: "file.created",
        file: { ...created, owner_firebase_uid: ownerUid },
        notifyVerb: "uploaded",
    });
    return created;
}

/**
 * Publishes a file change to everyone with access and, for shared content,
 * notifies the other people involved ("Rahul uploaded report.pdf").
 */
async function announce({ actorUid, eventType, file, audience, notifyVerb = null, extra = {} }) {
    const who = audience || await audienceForFile(file.id, file.folder_id, file.owner_firebase_uid);
    await publishChange({
        audience: who,
        actorUid,
        eventType,
        resourceType: "file",
        resourceId: file.id,
        folderId: file.folder_id,
        ownerUid: file.owner_firebase_uid,
        payload: { name: file.name, version: file.version ?? null, size: file.size ?? null, ...extra },
    });
    if (notifyVerb) {
        const others = [...who].filter((uid) => uid !== actorUid);
        if (others.length > 0) {
            const actorName = await getUserName(actorUid);
            await createNotifications(others.map((userUid) => ({
                userUid,
                actorUid,
                type: eventType,
                title: `${actorName} ${notifyVerb} a file`,
                body: `"${file.name}"`,
                resourceType: "file",
                resourceId: file.id,
                data: { folderId: file.folder_id === null || file.folder_id === undefined ? null : String(file.folder_id) },
            })));
        }
    }
}

/** Rejects stale writes: the client sends the version it last saw. */
function assertVersion(current, expectedVersion, label = "file") {
    if (expectedVersion === undefined || expectedVersion === null || expectedVersion === "") return;
    const expected = Number(expectedVersion);
    if (!Number.isInteger(expected) || expected < 1) {
        throw new AppError("expected_version must be a positive integer", 400, "VALIDATION_ERROR");
    }
    if (expected !== Number(current.version)) {
        const err = new AppError(`This ${label} was changed on another device. Refresh to see the latest version.`, 409, "CONFLICT");
        err.details = { currentVersion: Number(current.version) };
        throw err;
    }
}

/**
 * Replaces a file's content with a new version (owner or editor).
 * Conflict detection: pass `expectedVersion`; 409 CONFLICT if someone else changed it first.
 * The update is atomic (`WHERE version = $expected`), and the old stored object is removed
 * only after the database points at the new one.
 */
export async function replaceFileContent(fileId, callerUid, fileData, { expectedVersion } = {}) {
    const validId = validateFileId(fileId);
    if (!fileData || !fileData.buffer) {
        throw new AppError("No file provided for upload", 400);
    }
    const { file } = await requireFileAccess(callerUid, validId, "editor", "update this file");
    assertVersion(file, expectedVersion);

    const { verifiedMimeType, size } = validateFileContent(
        fileData.buffer,
        fileData.mimetype,
        file.name,
        env.maxFileSize
    );

    const { storagePath, encrypted } = await storageService.saveFile({
        ownerUid: file.owner_firebase_uid,
        filename: file.name,
        buffer: fileData.buffer
    });

    const result = await pool.query(
        `UPDATE files
         SET storage_path = $1, size = $2, mime_type = $3, is_encrypted = $4, uploaded_by_uid = $5,
             version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $6 AND version = $7
         RETURNING ${PUBLIC_FILE_FIELDS}, owner_firebase_uid`,
        [storagePath, size, verifiedMimeType, encrypted === true, callerUid, validId, file.version]
    );

    if (result.rows.length === 0) {
        await storageService.deleteFile(storagePath);
        const err = new AppError("This file was changed on another device. Refresh to see the latest version.", 409, "CONFLICT");
        throw err;
    }

    if (file.storage_path && file.storage_path !== storagePath) {
        await storageService.deleteFile(file.storage_path);
    }

    const updated = result.rows[0];
    await announce({ actorUid: callerUid, eventType: "file.updated", file: updated, notifyVerb: "updated", extra: { contentChanged: true } });
    delete updated.owner_firebase_uid;
    return updated;
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
    const download = await openFileStream(file);
    download.fileRecord.version = file.version;
    download.ownerUid = file.owner_firebase_uid;
    return download;
}

/**
 * Renames a file (owner or editor). Optional `expectedVersion` enables conflict detection.
 */
export async function renameFile(fileId, callerUid, newName, { expectedVersion } = {}) {
    const validId = validateFileId(fileId);
    const validName = validateFileName(newName);

    const { file, permission } = await requireFileAccess(callerUid, validId, "editor", "rename this file");
    assertVersion(file, expectedVersion);

    if (file.name === validName) {
        return toPublicFile(file, permission);
    }

    await assertNameAvailable(file.owner_firebase_uid, file.folder_id, validName, validId);

    const result = await pool.query(
        `UPDATE files
         SET name = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND version = $3
         RETURNING ${PUBLIC_FILE_FIELDS}`,
        [validName, validId, file.version]
    );
    if (result.rows.length === 0) {
        throw new AppError("This file was changed on another device. Refresh to see the latest version.", 409, "CONFLICT");
    }

    const updated = result.rows[0];
    await announce({
        actorUid: callerUid,
        eventType: "file.updated",
        file: { ...updated, owner_firebase_uid: file.owner_firebase_uid },
        extra: { previousName: file.name },
    });
    return updated;
}

/**
 * Moves a file between the owner's folders (or to root). Owner only:
 * moving can take a file out of a shared folder, so shared users may not do it.
 */
export async function moveFile(fileId, callerUid, targetFolderId, { expectedVersion } = {}) {
    const validId = validateFileId(fileId);
    const { file } = await requireFileAccess(callerUid, validId, "owner", "move this file");
    assertVersion(file, expectedVersion);

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

    // People who could see it in the old location must also learn that it left
    const audience = await audienceForFile(file.id, file.folder_id, file.owner_firebase_uid);

    const result = await pool.query(
        `UPDATE files
         SET folder_id = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND version = $3
         RETURNING ${PUBLIC_FILE_FIELDS}`,
        [validTargetId, validId, file.version]
    );
    if (result.rows.length === 0) {
        throw new AppError("This file was changed on another device. Refresh to see the latest version.", 409, "CONFLICT");
    }

    const moved = result.rows[0];
    (await audienceForFile(moved.id, moved.folder_id, file.owner_firebase_uid)).forEach((uid) => audience.add(uid));
    await announce({
        actorUid: callerUid,
        eventType: "file.moved",
        file: { ...moved, owner_firebase_uid: file.owner_firebase_uid },
        audience,
        extra: { previousFolderId: file.folder_id === null ? null : String(file.folder_id) },
    });
    return moved;
}

/**
 * Deletes a file from database and storage (owner or editor).
 * The database row is removed first so a storage failure never leaves a row pointing at nothing.
 */
export async function deleteFile(fileId, callerUid, { expectedVersion } = {}) {
    const validId = validateFileId(fileId);
    const { file } = await requireFileAccess(callerUid, validId, "editor", "delete this file");
    assertVersion(file, expectedVersion);

    // Compute the audience before the shares disappear with the row (ON DELETE CASCADE)
    const audience = await audienceForFile(file.id, file.folder_id, file.owner_firebase_uid);

    await pool.query("DELETE FROM files WHERE id = $1", [validId]);

    if (file.storage_path) {
        await storageService.deleteFile(file.storage_path);
    }

    await announce({ actorUid: callerUid, eventType: "file.deleted", file, audience, notifyVerb: "deleted" });

    return {
        id: file.id,
        name: file.name
    };
}
