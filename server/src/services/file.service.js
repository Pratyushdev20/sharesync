import pool from "../config/db.js";
import AppError from "../utils/AppError.js";
import storageService from "./storage.service.js";
import env from "../config/env.js";
import {
    validateFileName,
    validateFileId,
    validateFileContent
} from "../utils/fileValidator.js";

/**
 * Ensures a PostgreSQL user record exists for the given Firebase UID
 * to preserve the owner_id foreign key constraint.
 */
export async function getOrCreatePostgresUserId(ownerUid, email = null, name = null) {
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

    // Check if user exists by email and link them
    if (email) {
        const linkRes = await pool.query(
            "UPDATE users SET firebase_uid = $1 WHERE email = $2 AND firebase_uid IS NULL RETURNING id",
            [ownerUid, email]
        );
        if (linkRes.rows.length > 0) {
            return linkRes.rows[0].id;
        }
    }

    // Create user record to satisfy NOT NULL foreign key
    const insertRes = await pool.query(
        "INSERT INTO users (name, email, firebase_uid) VALUES ($1, $2, $3) RETURNING id",
        [name || "ShareSync User", email || `${ownerUid}@sharesync.local`, ownerUid]
    );

    return insertRes.rows[0].id;
}

/**
 * Uploads a file, validates content and permissions, and saves to storage and database.
 */
export async function uploadFile(ownerUid, userMeta, fileData, { folder_id = null } = {}) {
    if (!ownerUid) {
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

    // Validate target folder if provided
    if (folder_id !== null && folder_id !== undefined && folder_id !== "null" && folder_id !== "root" && folder_id !== "") {
        validFolderId = validateFileId(folder_id);

        const folderRes = await pool.query(
            "SELECT id, owner_firebase_uid FROM folders WHERE id = $1",
            [validFolderId]
        );

        if (folderRes.rows.length === 0) {
            throw new AppError("Target folder not found", 404);
        }

        if (folderRes.rows[0].owner_firebase_uid !== ownerUid) {
            throw new AppError("Forbidden: You do not have permission to upload files to this folder", 403);
        }
    }

    // Check duplicate filename in target folder for this owner
    let dupCheck;
    if (validFolderId === null) {
        dupCheck = await pool.query(
            "SELECT id FROM files WHERE owner_firebase_uid = $1 AND folder_id IS NULL AND LOWER(name) = LOWER($2)",
            [ownerUid, validName]
        );
    } else {
        dupCheck = await pool.query(
            "SELECT id FROM files WHERE owner_firebase_uid = $1 AND folder_id = $2 AND LOWER(name) = LOWER($3)",
            [ownerUid, validFolderId, validName]
        );
    }

    if (dupCheck.rows.length > 0) {
        throw new AppError("A file with this name already exists in this location", 409);
    }

    // Get or create PostgreSQL owner_id
    const ownerId = await getOrCreatePostgresUserId(ownerUid, userMeta?.email, userMeta?.name);

    // Write file to storage
    const { storagePath } = await storageService.saveFile({
        ownerUid,
        filename: validName,
        buffer: fileData.buffer
    });

    try {
        const result = await pool.query(
            `INSERT INTO files (name, size, mime_type, storage_path, owner_id, folder_id, owner_firebase_uid, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
             RETURNING id, name, size, mime_type, folder_id, created_at, updated_at`,
            [validName, size, verifiedMimeType, storagePath, ownerId, validFolderId, ownerUid]
        );

        return result.rows[0];
    } catch (dbErr) {
        // Rollback disk write if DB insert fails
        await storageService.deleteFile(storagePath);
        throw dbErr;
    }
}

/**
 * Lists files owned by the authenticated user, optionally filtered by folder.
 */
export async function getFiles(ownerUid, { folder_id } = {}) {
    if (!ownerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    if (folder_id !== undefined && folder_id !== "") {
        if (folder_id === "root" || folder_id === "null" || folder_id === null) {
            const result = await pool.query(
                `SELECT id, name, size, mime_type, folder_id, created_at, updated_at
                 FROM files
                 WHERE owner_firebase_uid = $1 AND folder_id IS NULL
                 ORDER BY name ASC`,
                [ownerUid]
            );
            return result.rows;
        }

        const validFolderId = validateFileId(folder_id);

        // Verify folder exists and belongs to the user
        const folderRes = await pool.query(
            "SELECT id, owner_firebase_uid FROM folders WHERE id = $1",
            [validFolderId]
        );

        if (folderRes.rows.length === 0) {
            throw new AppError("Folder not found", 404);
        }

        if (folderRes.rows[0].owner_firebase_uid !== ownerUid) {
            throw new AppError("Forbidden: You do not have permission to access files in this folder", 403);
        }

        const result = await pool.query(
            `SELECT id, name, size, mime_type, folder_id, created_at, updated_at
             FROM files
             WHERE owner_firebase_uid = $1 AND folder_id = $2
             ORDER BY name ASC`,
            [ownerUid, validFolderId]
        );
        return result.rows;
    }

    const result = await pool.query(
        `SELECT id, name, size, mime_type, folder_id, created_at, updated_at
         FROM files
         WHERE owner_firebase_uid = $1
         ORDER BY folder_id NULLS FIRST, name ASC`,
        [ownerUid]
    );
    return result.rows;
}

/**
 * Gets file metadata by ID, strictly enforcing ownership.
 * Never exposes internal storage_path.
 */
export async function getFileById(fileId, ownerUid) {
    if (!ownerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    const validId = validateFileId(fileId);

    const result = await pool.query(
        `SELECT id, name, size, mime_type, folder_id, owner_firebase_uid, created_at, updated_at
         FROM files
         WHERE id = $1`,
        [validId]
    );

    if (result.rows.length === 0) {
        throw new AppError("File not found", 404);
    }

    const file = result.rows[0];

    if (file.owner_firebase_uid !== ownerUid) {
        throw new AppError("Forbidden: You do not have permission to access this file", 403);
    }

    return {
        id: file.id,
        name: file.name,
        size: file.size,
        mime_type: file.mime_type,
        folder_id: file.folder_id,
        created_at: file.created_at,
        updated_at: file.updated_at
    };
}

/**
 * Retrieves file record and stream for secure download.
 */
export async function getFileForDownload(fileId, ownerUid) {
    if (!ownerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    const validId = validateFileId(fileId);

    const result = await pool.query(
        `SELECT id, name, size, mime_type, storage_path, owner_firebase_uid
         FROM files
         WHERE id = $1`,
        [validId]
    );

    if (result.rows.length === 0) {
        throw new AppError("File not found", 404);
    }

    const file = result.rows[0];

    if (file.owner_firebase_uid !== ownerUid) {
        throw new AppError("Forbidden: You do not have permission to download this file", 403);
    }

    const { stream, size } = await storageService.getFileStream(file.storage_path);

    return {
        fileRecord: {
            id: file.id,
            name: file.name,
            mime_type: file.mime_type,
            size: size || file.size
        },
        stream
    };
}

/**
 * Renames a file owned by the user.
 */
export async function renameFile(fileId, ownerUid, newName) {
    if (!ownerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    const validId = validateFileId(fileId);
    const validName = validateFileName(newName);

    const fileRes = await pool.query(
        "SELECT id, name, folder_id, owner_firebase_uid FROM files WHERE id = $1",
        [validId]
    );

    if (fileRes.rows.length === 0) {
        throw new AppError("File not found", 404);
    }

    const file = fileRes.rows[0];

    if (file.owner_firebase_uid !== ownerUid) {
        throw new AppError("Forbidden: You do not have permission to rename this file", 403);
    }

    if (file.name === validName) {
        return getFileById(validId, ownerUid);
    }

    // Check duplicate filename in same folder
    let dupCheck;
    if (file.folder_id === null) {
        dupCheck = await pool.query(
            "SELECT id FROM files WHERE owner_firebase_uid = $1 AND folder_id IS NULL AND LOWER(name) = LOWER($2) AND id != $3",
            [ownerUid, validName, validId]
        );
    } else {
        dupCheck = await pool.query(
            "SELECT id FROM files WHERE owner_firebase_uid = $1 AND folder_id = $2 AND LOWER(name) = LOWER($3) AND id != $4",
            [ownerUid, file.folder_id, validName, validId]
        );
    }

    if (dupCheck.rows.length > 0) {
        throw new AppError("A file with this name already exists in this location", 409);
    }

    const result = await pool.query(
        `UPDATE files
         SET name = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, name, size, mime_type, folder_id, created_at, updated_at`,
        [validName, validId]
    );

    return result.rows[0];
}

/**
 * Moves a file between folders (or to root).
 */
export async function moveFile(fileId, ownerUid, targetFolderId) {
    if (!ownerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    const validId = validateFileId(fileId);

    const fileRes = await pool.query(
        "SELECT id, name, folder_id, owner_firebase_uid FROM files WHERE id = $1",
        [validId]
    );

    if (fileRes.rows.length === 0) {
        throw new AppError("File not found", 404);
    }

    const file = fileRes.rows[0];

    if (file.owner_firebase_uid !== ownerUid) {
        throw new AppError("Forbidden: You do not have permission to move this file", 403);
    }

    let validTargetId = null;

    if (targetFolderId !== null && targetFolderId !== undefined && targetFolderId !== "null" && targetFolderId !== "root" && targetFolderId !== "") {
        validTargetId = validateFileId(targetFolderId);

        const folderRes = await pool.query(
            "SELECT id, owner_firebase_uid FROM folders WHERE id = $1",
            [validTargetId]
        );

        if (folderRes.rows.length === 0) {
            throw new AppError("Target folder not found", 404);
        }

        if (folderRes.rows[0].owner_firebase_uid !== ownerUid) {
            throw new AppError("Forbidden: You do not have permission to move files to this folder", 403);
        }
    }

    // Check duplicate in target folder
    let dupCheck;
    if (validTargetId === null) {
        dupCheck = await pool.query(
            "SELECT id FROM files WHERE owner_firebase_uid = $1 AND folder_id IS NULL AND LOWER(name) = LOWER($2) AND id != $3",
            [ownerUid, file.name, validId]
        );
    } else {
        dupCheck = await pool.query(
            "SELECT id FROM files WHERE owner_firebase_uid = $1 AND folder_id = $2 AND LOWER(name) = LOWER($3) AND id != $4",
            [ownerUid, validTargetId, file.name, validId]
        );
    }

    if (dupCheck.rows.length > 0) {
        throw new AppError("A file with this name already exists in the target folder", 409);
    }

    const result = await pool.query(
        `UPDATE files
         SET folder_id = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, name, size, mime_type, folder_id, created_at, updated_at`,
        [validTargetId, validId]
    );

    return result.rows[0];
}

/**
 * Deletes a file from database and disk storage.
 */
export async function deleteFile(fileId, ownerUid) {
    if (!ownerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    const validId = validateFileId(fileId);

    const fileRes = await pool.query(
        "SELECT id, name, storage_path, owner_firebase_uid FROM files WHERE id = $1",
        [validId]
    );

    if (fileRes.rows.length === 0) {
        throw new AppError("File not found", 404);
    }

    const file = fileRes.rows[0];

    if (file.owner_firebase_uid !== ownerUid) {
        throw new AppError("Forbidden: You do not have permission to delete this file", 403);
    }

    // Remove from storage
    if (file.storage_path) {
        await storageService.deleteFile(file.storage_path);
    }

    // Remove from database
    await pool.query("DELETE FROM files WHERE id = $1", [validId]);

    return {
        id: file.id,
        name: file.name
    };
}
