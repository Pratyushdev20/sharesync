import pool from "../config/db.js";
import AppError from "../utils/AppError.js";
import { resolvePermission } from "./share.service.js";

/**
 * Central access control for files and folders.
 *
 * Permission levels (each includes the ones below it):
 *   owner  - full control, including sharing, moving and deleting shared roots
 *   editor - view, download, upload, create subfolders, rename, delete contents
 *   viewer - view and download only
 *
 * Every file/folder service call goes through requireFileAccess / requireFolderAccess,
 * so a shared user can never do more than their permission allows.
 */
const RANK = { viewer: 1, editor: 2, owner: 3 };

export function hasAtLeast(permission, needed) {
    return (RANK[permission] || 0) >= RANK[needed];
}

async function permissionFor(uid, type, row) {
    if (row.owner_firebase_uid && row.owner_firebase_uid === uid) return "owner";
    return resolvePermission(uid, type, row.id);
}

/**
 * Loads a file and verifies the caller has at least `needed` permission.
 * @returns {Promise<{ file: object, permission: 'owner'|'editor'|'viewer' }>}
 * @throws AppError 404 if the file does not exist, 403 if access is insufficient
 */
export async function requireFileAccess(uid, fileId, needed, action = "access this file") {
    if (!uid) throw new AppError("Unauthorized: Firebase UID is required", 401);

    const res = await pool.query(
        `SELECT id, name, size, mime_type, storage_path, folder_id, owner_id, owner_firebase_uid,
                is_encrypted, version, created_at, updated_at
         FROM files WHERE id = $1`,
        [fileId]
    );
    if (res.rows.length === 0) throw new AppError("File not found", 404);

    const file = res.rows[0];
    const permission = await permissionFor(uid, "file", file);
    if (!hasAtLeast(permission, needed)) {
        throw new AppError(`Forbidden: You do not have permission to ${action}`, 403);
    }
    return { file, permission };
}

/**
 * Loads a folder and verifies the caller has at least `needed` permission.
 * @returns {Promise<{ folder: object, permission: 'owner'|'editor'|'viewer' }>}
 */
export async function requireFolderAccess(uid, folderId, needed, action = "access this folder") {
    if (!uid) throw new AppError("Unauthorized: Firebase UID is required", 401);

    const res = await pool.query(
        `SELECT id, name, owner_id, owner_firebase_uid, parent_folder_id, version, created_at, updated_at
         FROM folders WHERE id = $1`,
        [folderId]
    );
    if (res.rows.length === 0) throw new AppError("Folder not found", 404);

    const folder = res.rows[0];
    const permission = await permissionFor(uid, "folder", folder);
    if (!hasAtLeast(permission, needed)) {
        throw new AppError(`Forbidden: You do not have permission to ${action}`, 403);
    }
    return { folder, permission };
}

/**
 * Loads a note and verifies access. Notes inherit permissions from the folder they live in;
 * notes at the root of a workspace are private to their owner.
 * @returns {Promise<{ note: object, permission: 'owner'|'editor'|'viewer' }>}
 */
export async function requireNoteAccess(uid, noteId, needed, action = "access this note") {
    if (!uid) throw new AppError("Unauthorized: Firebase UID is required", 401);

    const res = await pool.query(
        `SELECT id, owner_firebase_uid, folder_id, kind, title, content, version,
                created_by_uid, updated_by_uid, created_at, updated_at
         FROM notes WHERE id = $1`,
        [noteId]
    );
    if (res.rows.length === 0) throw new AppError("Note not found", 404);

    const note = res.rows[0];
    let permission = null;
    if (note.owner_firebase_uid === uid) permission = "owner";
    else if (note.folder_id !== null) permission = await resolvePermission(uid, "folder", note.folder_id);

    if (!hasAtLeast(permission, needed)) {
        throw new AppError(`Forbidden: You do not have permission to ${action}`, 403);
    }
    return { note, permission };
}

/**
 * True if `folderId` is `rootFolderId` itself or nested anywhere beneath it.
 * Used to keep folder share links confined to the shared folder tree.
 */
export async function isFolderWithin(folderId, rootFolderId) {
    if (folderId === null || folderId === undefined) return false;
    const res = await pool.query(
        `WITH RECURSIVE ancestors AS (
            SELECT id, parent_folder_id, 0 AS depth FROM folders WHERE id = $1
            UNION ALL
            SELECT f.id, f.parent_folder_id, a.depth + 1
            FROM folders f JOIN ancestors a ON f.id = a.parent_folder_id
            WHERE a.depth < 100
         )
         SELECT 1 FROM ancestors WHERE id = $2 LIMIT 1`,
        [folderId, rootFolderId]
    );
    return res.rows.length > 0;
}
