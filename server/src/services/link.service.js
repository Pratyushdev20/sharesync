import pool from "../config/db.js";
import AppError from "../utils/AppError.js";
import { loadActiveLink, resolveShareLink } from "./share.service.js";
import { isFolderWithin } from "./access.service.js";
import { openFileStream } from "./file.service.js";
import { validateFileId } from "../utils/fileValidator.js";

/**
 * Access to shared content through a share link (no account needed for "anyone" links).
 *
 * Security rules enforced here:
 * - every call re-validates the link (revoked / expired / sign-in / password) via loadActiveLink
 * - links are read-only: browse and download only, never modify
 * - a folder link only reaches folders and files inside the shared folder tree
 */

/** Public link metadata (what was shared, by whom, and whether it is a file or a folder). */
export async function getLinkInfo(rawToken, uid, password) {
    return resolveShareLink(rawToken, uid, password);
}

/**
 * Lists a folder reached through a folder link. `folderId` defaults to the shared folder itself.
 */
export async function getLinkFolderContents(rawToken, uid, password, folderId = null) {
    const link = await loadActiveLink(rawToken, uid, password);
    if (!link.folder_id) {
        throw new AppError("This link is for a single file, not a folder", 400);
    }

    const targetId = folderId === null || folderId === undefined || folderId === ""
        ? String(link.folder_id)
        : validateFileId(folderId);

    if (!(await isFolderWithin(targetId, link.folder_id))) {
        throw new AppError("Folder not found in this shared link", 404);
    }

    const folderRes = await pool.query(
        "SELECT id, name, parent_folder_id FROM folders WHERE id = $1",
        [targetId]
    );
    if (folderRes.rows.length === 0) {
        throw new AppError("Folder not found in this shared link", 404);
    }

    const [subfolders, files] = await Promise.all([
        pool.query(
            "SELECT id, name, created_at, updated_at FROM folders WHERE parent_folder_id = $1 ORDER BY name ASC",
            [targetId]
        ),
        pool.query(
            "SELECT id, name, size, mime_type, created_at, updated_at FROM files WHERE folder_id = $1 ORDER BY name ASC",
            [targetId]
        )
    ]);

    const folder = folderRes.rows[0];
    const isRoot = String(folder.id) === String(link.folder_id);
    return {
        folder: {
            id: folder.id,
            name: folder.name,
            // Never reveal parents outside the shared tree
            parent_folder_id: isRoot ? null : folder.parent_folder_id,
            is_link_root: isRoot
        },
        subfolders: subfolders.rows,
        files: files.rows
    };
}

/**
 * Opens a download through a link. For a file link the file is implied;
 * for a folder link `fileId` must be a file inside the shared folder tree.
 */
export async function getLinkFileForDownload(rawToken, uid, password, fileId = null) {
    const link = await loadActiveLink(rawToken, uid, password);

    let targetFileId;
    if (link.file_id) {
        if (fileId && String(fileId) !== String(link.file_id)) {
            throw new AppError("File not found in this shared link", 404);
        }
        targetFileId = String(link.file_id);
    } else {
        if (!fileId) {
            throw new AppError("file_id is required for folder links", 400);
        }
        targetFileId = validateFileId(fileId);
    }

    const fileRes = await pool.query(
        "SELECT id, name, size, mime_type, storage_path, folder_id, is_encrypted FROM files WHERE id = $1",
        [targetFileId]
    );
    if (fileRes.rows.length === 0) {
        throw new AppError("File not found in this shared link", 404);
    }
    const file = fileRes.rows[0];

    if (link.folder_id && !(await isFolderWithin(file.folder_id, link.folder_id))) {
        throw new AppError("File not found in this shared link", 404);
    }

    return openFileStream(file);
}
