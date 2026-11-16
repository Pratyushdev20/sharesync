import pool from "../config/db.js";
import AppError from "../utils/AppError.js";

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

/**
 * Creates a new folder owned by the authenticated Firebase user.
 * Supports root folders (parent_folder_id = null) and nested folders.
 */
export async function createFolder(ownerUid, { name, parent_folder_id = null }) {
    if (!ownerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    const validName = validateFolderName(name);
    let validParentId = null;

    if (parent_folder_id !== null && parent_folder_id !== undefined) {
        validParentId = validateFolderId(parent_folder_id);

        // Verify parent folder exists and is owned by the user
        const parentRes = await pool.query(
            "SELECT id, owner_firebase_uid FROM folders WHERE id = $1",
            [validParentId]
        );

        if (parentRes.rows.length === 0) {
            throw new AppError("Parent folder not found", 404);
        }

        const parent = parentRes.rows[0];
        if (parent.owner_firebase_uid !== ownerUid) {
            throw new AppError("Forbidden: You do not have permission to create folders inside this parent folder", 403);
        }
    }

    // Check for duplicate folder name in the target parent
    let dupCheck;
    if (validParentId === null) {
        dupCheck = await pool.query(
            "SELECT id FROM folders WHERE owner_firebase_uid = $1 AND parent_folder_id IS NULL AND LOWER(name) = LOWER($2)",
            [ownerUid, validName]
        );
    } else {
        dupCheck = await pool.query(
            "SELECT id FROM folders WHERE owner_firebase_uid = $1 AND parent_folder_id = $2 AND LOWER(name) = LOWER($3)",
            [ownerUid, validParentId, validName]
        );
    }

    if (dupCheck.rows.length > 0) {
        throw new AppError("A folder with this name already exists in this location", 409);
    }

    // Find PostgreSQL user ID if exists to preserve foreign key relationship
    const userRes = await pool.query(
        "SELECT id FROM users WHERE firebase_uid = $1",
        [ownerUid]
    );
    const ownerId = userRes.rows[0]?.id || null;

    const result = await pool.query(
        `INSERT INTO folders (name, owner_firebase_uid, owner_id, parent_folder_id, created_at, updated_at)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
         RETURNING id, name, owner_firebase_uid, parent_folder_id, created_at, updated_at`,
        [validName, ownerUid, ownerId, validParentId]
    );

    return result.rows[0];
}

/**
 * Lists folders owned by the authenticated user.
 * Optional parent_folder_id filter:
 * - 'root' or null: only root folders
 * - numeric ID: child folders of the parent
 * - undefined: all folders for this user
 */
export async function getFolders(ownerUid, { parent_folder_id } = {}) {
    if (!ownerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    if (parent_folder_id !== undefined) {
        if (parent_folder_id === "root" || parent_folder_id === "null" || parent_folder_id === null) {
            const result = await pool.query(
                `SELECT id, name, owner_firebase_uid, parent_folder_id, created_at, updated_at
                 FROM folders
                 WHERE owner_firebase_uid = $1 AND parent_folder_id IS NULL
                 ORDER BY name ASC`,
                [ownerUid]
            );
            return result.rows;
        }

        const validParentId = validateFolderId(parent_folder_id);

        // Verify parent folder exists and ownership
        const parentRes = await pool.query(
            "SELECT id, owner_firebase_uid FROM folders WHERE id = $1",
            [validParentId]
        );

        if (parentRes.rows.length === 0) {
            throw new AppError("Parent folder not found", 404);
        }

        if (parentRes.rows[0].owner_firebase_uid !== ownerUid) {
            throw new AppError("Forbidden: You do not have permission to access this parent folder", 403);
        }

        const result = await pool.query(
            `SELECT id, name, owner_firebase_uid, parent_folder_id, created_at, updated_at
             FROM folders
             WHERE owner_firebase_uid = $1 AND parent_folder_id = $2
             ORDER BY name ASC`,
            [ownerUid, validParentId]
        );
        return result.rows;
    }

    const result = await pool.query(
        `SELECT id, name, owner_firebase_uid, parent_folder_id, created_at, updated_at
         FROM folders
         WHERE owner_firebase_uid = $1
         ORDER BY parent_folder_id NULLS FIRST, name ASC`,
        [ownerUid]
    );
    return result.rows;
}

/**
 * Gets a single folder by ID, ensuring strict ownership by the requesting user.
 * Also retrieves child subfolders and contained files.
 */
export async function getFolderById(folderId, ownerUid) {
    if (!ownerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    const validId = validateFolderId(folderId);

    const result = await pool.query(
        `SELECT id, name, owner_firebase_uid, parent_folder_id, created_at, updated_at
         FROM folders
         WHERE id = $1`,
        [validId]
    );

    if (result.rows.length === 0) {
        throw new AppError("Folder not found", 404);
    }

    const folder = result.rows[0];

    if (folder.owner_firebase_uid !== ownerUid) {
        throw new AppError("Forbidden: You do not have permission to access this folder", 403);
    }

    // Retrieve child subfolders
    const subfoldersRes = await pool.query(
        `SELECT id, name, owner_firebase_uid, parent_folder_id, created_at, updated_at
         FROM folders
         WHERE parent_folder_id = $1
         ORDER BY name ASC`,
        [validId]
    );

    // Retrieve files in this folder if files table exists
    let files = [];
    try {
        const filesRes = await pool.query(
            `SELECT id, name, size, mime_type, created_at
             FROM files
             WHERE folder_id = $1
             ORDER BY name ASC`,
            [validId]
        );
        files = filesRes.rows;
    } catch (err) {
        if (err.code !== "42P01") {
            throw err;
        }
        files = [];
    }

    return {
        ...folder,
        subfolders: subfoldersRes.rows,
        files
    };
}

/**
 * Renames an existing folder owned by the user.
 * Prevents duplicate names in the same location and updates updated_at.
 */
export async function renameFolder(folderId, ownerUid, newName) {
    if (!ownerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    const validId = validateFolderId(folderId);
    const validName = validateFolderName(newName);

    const folderRes = await pool.query(
        "SELECT id, name, owner_firebase_uid, parent_folder_id FROM folders WHERE id = $1",
        [validId]
    );

    if (folderRes.rows.length === 0) {
        throw new AppError("Folder not found", 404);
    }

    const folder = folderRes.rows[0];

    if (folder.owner_firebase_uid !== ownerUid) {
        throw new AppError("Forbidden: You do not have permission to rename this folder", 403);
    }

    if (folder.name === validName) {
        return {
            id: folder.id,
            name: folder.name,
            owner_firebase_uid: folder.owner_firebase_uid,
            parent_folder_id: folder.parent_folder_id,
            created_at: folder.created_at,
            updated_at: folder.updated_at
        };
    }

    // Check for duplicate name in the same parent folder
    let dupCheck;
    if (folder.parent_folder_id === null) {
        dupCheck = await pool.query(
            "SELECT id FROM folders WHERE owner_firebase_uid = $1 AND parent_folder_id IS NULL AND LOWER(name) = LOWER($2) AND id != $3",
            [ownerUid, validName, validId]
        );
    } else {
        dupCheck = await pool.query(
            "SELECT id FROM folders WHERE owner_firebase_uid = $1 AND parent_folder_id = $2 AND LOWER(name) = LOWER($3) AND id != $4",
            [ownerUid, folder.parent_folder_id, validName, validId]
        );
    }

    if (dupCheck.rows.length > 0) {
        throw new AppError("A folder with this name already exists in this location", 409);
    }

    const result = await pool.query(
        `UPDATE folders
         SET name = $1, updated_at = CURRENT_TIMESTAMP
         WHERE id = $2
         RETURNING id, name, owner_firebase_uid, parent_folder_id, created_at, updated_at`,
        [validName, validId]
    );

    return result.rows[0];
}

/**
 * Deletes an empty folder owned by the user.
 * Rejects deletion with 400 Bad Request if the folder contains child subfolders or files.
 */
export async function deleteFolder(folderId, ownerUid) {
    if (!ownerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    const validId = validateFolderId(folderId);

    const folderRes = await pool.query(
        "SELECT id, name, owner_firebase_uid FROM folders WHERE id = $1",
        [validId]
    );

    if (folderRes.rows.length === 0) {
        throw new AppError("Folder not found", 404);
    }

    const folder = folderRes.rows[0];

    if (folder.owner_firebase_uid !== ownerUid) {
        throw new AppError("Forbidden: You do not have permission to delete this folder", 403);
    }

    // Check for child subfolders
    const subfolderCheck = await pool.query(
        "SELECT COUNT(*)::int as count FROM folders WHERE parent_folder_id = $1",
        [validId]
    );

    if (subfolderCheck.rows[0].count > 0) {
        throw new AppError("Cannot delete folder: folder contains subfolders. Please delete or move all contained folders first", 400);
    }

    // Check for files inside the folder
    try {
        const fileCheck = await pool.query(
            "SELECT COUNT(*)::int as count FROM files WHERE folder_id = $1",
            [validId]
        );

        if (fileCheck.rows[0].count > 0) {
            throw new AppError("Cannot delete folder: folder contains files. Please delete or move all contained files first", 400);
        }
    } catch (err) {
        if (err instanceof AppError || err.statusCode) {
            throw err;
        }
        if (err.code !== "42P01") {
            throw err;
        }
    }

    await pool.query("DELETE FROM folders WHERE id = $1", [validId]);

    return {
        id: validId,
        name: folder.name
    };
}
