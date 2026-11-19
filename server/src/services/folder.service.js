import pool from "../config/db.js";
import AppError from "../utils/AppError.js";
import { requireFolderAccess } from "./access.service.js";
import { audienceForFolder, publishChange } from "./events.service.js";

const FOLDER_FIELDS = "id, name, owner_firebase_uid, parent_folder_id, version, created_at, updated_at";

/**
 * Validates a folder name.
 * Throws AppError(400) if invalid.
 */
export function validateFolderName(name) {
    if (typeof name !== "string") {
        throw new AppError("Folder name must be a string", 400);
    }
    const trimmed = name.trim();
    if (!trimmed || trimmed.length > 255) {
        throw new AppError("Folder name must be between 1 and 255 characters", 400);
    }
    if (trimmed === "." || trimmed === "..") {
        throw new AppError("Invalid folder name", 400);
    }
    if (/[\/\\\x00-\x1f\x7f]/.test(trimmed)) {
        throw new AppError("Folder name contains invalid characters", 400);
    }
    return trimmed;
}

/**
 * Validates a folder ID.
 * Throws AppError(400) if invalid.
 */
export function validateFolderId(id) {
    const str = String(id).trim();
    if (!/^\d+$/.test(str) || BigInt(str) <= 0n) {
        throw new AppError("Invalid folder ID", 400);
    }
    return str;
}

/** Case-insensitive duplicate folder name check inside one owner's parent folder (or root). */
async function assertFolderNameAvailable(ownerUid, parentId, name, excludeId = null) {
    const params = [ownerUid, name];
    let sql = parentId === null
        ? "SELECT id FROM folders WHERE owner_firebase_uid = $1 AND parent_folder_id IS NULL AND LOWER(name) = LOWER($2)"
        : "SELECT id FROM folders WHERE owner_firebase_uid = $1 AND parent_folder_id = $3 AND LOWER(name) = LOWER($2)";
    if (parentId !== null) params.push(parentId);
    if (excludeId !== null) {
        params.push(excludeId);
        sql += ` AND id != $${params.length}`;
    }
    const dup = await pool.query(sql, params);
    if (dup.rows.length > 0) {
        throw new AppError("A folder with this name already exists in this location", 409);
    }
}

/**
 * Creates a new folder at the caller's root, inside one of their folders,
 * or inside a folder shared with them as editor (the new folder then belongs to that folder's owner).
 */
export async function createFolder(callerUid, { name, parent_folder_id = null }) {
    if (!callerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    const validName = validateFolderName(name);
    let validParentId = null;
    let ownerUid = callerUid;
    let ownerId = null;

    if (parent_folder_id !== null && parent_folder_id !== undefined) {
        validParentId = validateFolderId(parent_folder_id);
        let access;
        try {
            access = await requireFolderAccess(callerUid, validParentId, "editor", "create folders inside this parent folder");
        } catch (err) {
            if (err.statusCode === 404) throw new AppError("Parent folder not found", 404);
            throw err;
        }
        ownerUid = access.folder.owner_firebase_uid;
        ownerId = access.folder.owner_id;
    }

    await assertFolderNameAvailable(ownerUid, validParentId, validName);

    if (ownerId === null) {
        // Find PostgreSQL user ID if exists to preserve foreign key relationship
        const userRes = await pool.query("SELECT id FROM users WHERE firebase_uid = $1", [ownerUid]);
        ownerId = userRes.rows[0]?.id || null;
    }

    const result = await pool.query(
        `INSERT INTO folders (name, owner_firebase_uid, owner_id, parent_folder_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING ${FOLDER_FIELDS}`,
        [validName, ownerUid, ownerId, validParentId]
    );

    const created = result.rows[0];
    await publishChange({
        audience: await audienceForFolder(validParentId, ownerUid),
        actorUid: callerUid,
        eventType: "folder.created",
        resourceType: "folder",
        resourceId: created.id,
        folderId: validParentId,
        ownerUid,
        payload: { name: created.name, version: created.version },
    });
    return created;
}

/**
 * Lists folders.
 * - 'root' or null: the caller's own root folders
 * - numeric ID: child folders of that folder (caller must be able to view it: owned or shared)
 * - undefined: all of the caller's own folders
 */
export async function getFolders(callerUid, { parent_folder_id } = {}) {
    if (!callerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    if (parent_folder_id !== undefined) {
        if (parent_folder_id === "root" || parent_folder_id === "null" || parent_folder_id === null) {
            const result = await pool.query(
                `SELECT ${FOLDER_FIELDS}
                 FROM folders
                 WHERE owner_firebase_uid = $1 AND parent_folder_id IS NULL
                 ORDER BY name ASC`,
                [callerUid]
            );
            return result.rows;
        }

        const validParentId = validateFolderId(parent_folder_id);
        try {
            await requireFolderAccess(callerUid, validParentId, "viewer", "access this parent folder");
        } catch (err) {
            if (err.statusCode === 404) throw new AppError("Parent folder not found", 404);
            throw err;
        }

        const result = await pool.query(
            `SELECT ${FOLDER_FIELDS}
             FROM folders
             WHERE parent_folder_id = $1
             ORDER BY name ASC`,
            [validParentId]
        );
        return result.rows;
    }

    const result = await pool.query(
        `SELECT ${FOLDER_FIELDS}
         FROM folders
         WHERE owner_firebase_uid = $1
         ORDER BY parent_folder_id NULLS FIRST, name ASC`,
        [callerUid]
    );
    return result.rows;
}

/**
 * Gets a single folder (owner or shared user) with its subfolders and files,
 * plus `access` so clients know which actions to offer.
 */
export async function getFolderById(folderId, callerUid) {
    const validId = validateFolderId(folderId);
    const { folder, permission } = await requireFolderAccess(callerUid, validId, "viewer", "access this folder");

    const subfoldersRes = await pool.query(
        `SELECT ${FOLDER_FIELDS}
         FROM folders
         WHERE parent_folder_id = $1
         ORDER BY name ASC`,
        [validId]
    );

    const filesRes = await pool.query(
        `SELECT id, name, size, mime_type, folder_id, version, created_at, updated_at
         FROM files
         WHERE folder_id = $1
         ORDER BY name ASC`,
        [validId]
    );

    return {
        id: folder.id,
        name: folder.name,
        owner_firebase_uid: folder.owner_firebase_uid,
        parent_folder_id: folder.parent_folder_id,
        version: folder.version,
        created_at: folder.created_at,
        updated_at: folder.updated_at,
        access: permission,
        subfolders: subfoldersRes.rows,
        files: filesRes.rows
    };
}

/**
 * Renames a folder (owner or editor).
 */
export async function renameFolder(folderId, callerUid, newName, { expectedVersion } = {}) {
    const validId = validateFolderId(folderId);
    const validName = validateFolderName(newName);

    const { folder } = await requireFolderAccess(callerUid, validId, "editor", "rename this folder");
    if (expectedVersion !== undefined && expectedVersion !== null && expectedVersion !== "" &&
        Number(expectedVersion) !== Number(folder.version)) {
        const err = new AppError("This folder was changed on another device. Refresh to see the latest version.", 409, "CONFLICT");
        err.details = { currentVersion: Number(folder.version) };
        throw err;
    }

    if (folder.name === validName) {
        return {
            id: folder.id,
            name: folder.name,
            owner_firebase_uid: folder.owner_firebase_uid,
            parent_folder_id: folder.parent_folder_id,
            version: folder.version,
            created_at: folder.created_at,
            updated_at: folder.updated_at
        };
    }

    await assertFolderNameAvailable(folder.owner_firebase_uid, folder.parent_folder_id, validName, validId);

    const result = await pool.query(
        `UPDATE folders
         SET name = $1, version = version + 1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2 AND version = $3
         RETURNING ${FOLDER_FIELDS}`,
        [validName, validId, folder.version]
    );
    if (result.rows.length === 0) {
        throw new AppError("This folder was changed on another device. Refresh to see the latest version.", 409, "CONFLICT");
    }

    const renamed = result.rows[0];
    await publishChange({
        audience: await audienceForFolder(validId, folder.owner_firebase_uid),
        actorUid: callerUid,
        eventType: "folder.updated",
        resourceType: "folder",
        resourceId: renamed.id,
        folderId: renamed.parent_folder_id,
        ownerUid: folder.owner_firebase_uid,
        payload: { name: renamed.name, previousName: folder.name, version: renamed.version },
    });
    return renamed;
}

/**
 * Deletes an empty folder.
 * Owners can delete any of their empty folders. Editors can delete empty subfolders inside a
 * shared folder, but not the folder that was shared with them itself.
 * Rejects deletion with 400 if the folder contains subfolders or files.
 */
export async function deleteFolder(folderId, callerUid) {
    const validId = validateFolderId(folderId);
    const { folder, permission } = await requireFolderAccess(callerUid, validId, "editor", "delete this folder");

    if (permission === "editor") {
        const directShare = await pool.query(
            "SELECT 1 FROM folder_shares WHERE folder_id = $1 AND shared_with_uid = $2",
            [validId, callerUid]
        );
        if (directShare.rows.length > 0) {
            throw new AppError("Forbidden: Only the owner can delete a folder that was shared with you", 403);
        }
    }

    const subfolderCheck = await pool.query(
        "SELECT COUNT(*)::int as count FROM folders WHERE parent_folder_id = $1",
        [validId]
    );
    if (subfolderCheck.rows[0].count > 0) {
        throw new AppError("Cannot delete folder: folder contains subfolders. Please delete or move all contained folders first", 400);
    }

    const fileCheck = await pool.query(
        "SELECT COUNT(*)::int as count FROM files WHERE folder_id = $1",
        [validId]
    );
    if (fileCheck.rows[0].count > 0) {
        throw new AppError("Cannot delete folder: folder contains files. Please delete or move all contained files first", 400);
    }

    const noteCheck = await pool.query(
        "SELECT COUNT(*)::int as count FROM notes WHERE folder_id = $1",
        [validId]
    );
    if (noteCheck.rows[0].count > 0) {
        throw new AppError("Cannot delete folder: folder contains notes. Please delete or move all contained notes first", 400);
    }

    // Audience must be computed before the folder (and its shares) are gone
    const audience = await audienceForFolder(validId, folder.owner_firebase_uid);

    await pool.query("DELETE FROM folders WHERE id = $1", [validId]);

    await publishChange({
        audience,
        actorUid: callerUid,
        eventType: "folder.deleted",
        resourceType: "folder",
        resourceId: validId,
        folderId: folder.parent_folder_id,
        ownerUid: folder.owner_firebase_uid,
        payload: { name: folder.name },
    });

    return {
        id: validId,
        name: folder.name
    };
}
