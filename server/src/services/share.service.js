import crypto from "crypto";
import pool from "../config/db.js";
import AppError from "../utils/AppError.js";

/**
 * Validates whether an ID is a valid numeric resource ID.
 */
function isValidId(id) {
    if (id === null || id === undefined) return false;
    const str = String(id).trim();
    return /^\d+$/.test(str) && BigInt(str) > 0n;
}

/**
 * Validates an email address.
 */
function isValidEmail(email) {
    if (typeof email !== "string") return false;
    const trimmed = email.trim();
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) && trimmed.length <= 255;
}

/**
 * Resolves the effective permission of a user for a given resource.
 *
 * Permission precedence:
 * 1. Owner always has full access ('owner').
 * 2. Direct file share takes precedence ('editor' or 'viewer').
 * 3. Otherwise, the nearest explicitly shared ancestor folder determines permission.
 * 4. No matching permission returns null (access denied).
 *
 * @param {string|null} userUid - Firebase UID of the requesting user (or null if anonymous)
 * @param {'file'|'folder'} resourceType - 'file' or 'folder'
 * @param {string|number} resourceId - Resource ID
 * @returns {Promise<'owner'|'editor'|'viewer'|null>}
 */
export async function resolvePermission(userUid, resourceType, resourceId) {
    if (!userUid || !resourceType || !isValidId(resourceId)) {
        return null;
    }

    const validId = String(resourceId).trim();

    if (resourceType === "file") {
        // Step 1: Check file existence and ownership
        const fileRes = await pool.query(
            "SELECT id, owner_firebase_uid, folder_id FROM files WHERE id = $1",
            [validId]
        );

        if (fileRes.rows.length === 0) {
            return null;
        }

        const file = fileRes.rows[0];

        // Owner check
        if (file.owner_firebase_uid && file.owner_firebase_uid === userUid) {
            return "owner";
        }

        // Step 2: Direct file share takes precedence
        const directRes = await pool.query(
            "SELECT permission FROM file_shares WHERE file_id = $1 AND shared_with_uid = $2",
            [validId, userUid]
        );

        if (directRes.rows.length > 0) {
            return directRes.rows[0].permission;
        }

        // Step 3: Inherit from nearest explicitly shared ancestor folder
        if (file.folder_id !== null && file.folder_id !== undefined) {
            return resolveAncestorFolderPermission(file.folder_id, userUid);
        }

        return null;
    }

    if (resourceType === "folder") {
        // Step 1: Check folder existence and ownership
        const folderRes = await pool.query(
            "SELECT id, owner_firebase_uid, parent_folder_id FROM folders WHERE id = $1",
            [validId]
        );

        if (folderRes.rows.length === 0) {
            return null;
        }

        const folder = folderRes.rows[0];

        // Owner check
        if (folder.owner_firebase_uid && folder.owner_firebase_uid === userUid) {
            return "owner";
        }

        // Step 2: Direct folder share check
        const directRes = await pool.query(
            "SELECT permission FROM folder_shares WHERE folder_id = $1 AND shared_with_uid = $2",
            [validId, userUid]
        );

        if (directRes.rows.length > 0) {
            return directRes.rows[0].permission;
        }

        // Step 3: Inherit from nearest explicitly shared ancestor folder
        if (folder.parent_folder_id !== null && folder.parent_folder_id !== undefined) {
            return resolveAncestorFolderPermission(folder.parent_folder_id, userUid);
        }

        return null;
    }

    return null;
}

/**
 * Traverses up the folder hierarchy from a starting folder and finds the nearest
 * explicitly shared ancestor folder for the user.
 *
 * @param {string|number} startFolderId - ID of starting folder
 * @param {string} userUid - Firebase UID
 * @returns {Promise<'editor'|'viewer'|null>}
 */
async function resolveAncestorFolderPermission(startFolderId, userUid) {
    if (!isValidId(startFolderId) || !userUid) {
        return null;
    }

    const query = `
        WITH RECURSIVE ancestor_tree AS (
            SELECT id, parent_folder_id, 1 AS depth
            FROM folders
            WHERE id = $1
            UNION ALL
            SELECT f.id, f.parent_folder_id, at.depth + 1
            FROM folders f
            JOIN ancestor_tree at ON f.id = at.parent_folder_id
        )
        SELECT fs.permission, at.depth
        FROM ancestor_tree at
        JOIN folder_shares fs ON at.id = fs.folder_id
        WHERE fs.shared_with_uid = $2
        ORDER BY at.depth ASC
        LIMIT 1;
    `;

    const res = await pool.query(query, [String(startFolderId).trim(), userUid]);
    if (res.rows.length > 0) {
        return res.rows[0].permission;
    }

    return null;
}

/**
 * Shares a file or folder with a registered user by email.
 *
 * @param {Object} params
 * @param {string} params.ownerUid - Authenticated Firebase UID of the owner
 * @param {'file'|'folder'} params.resourceType - 'file' or 'folder'
 * @param {string|number} params.resourceId - Resource ID
 * @param {string} params.recipientEmail - Registered user email
 * @param {'viewer'|'editor'} params.permission - Access permission level
 * @returns {Promise<Object>} Safe share record (no internal paths or hashes)
 */
export async function shareWithUser({
    ownerUid,
    resourceType,
    resourceId,
    recipientEmail,
    permission = "viewer"
}) {
    if (!ownerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    if (resourceType !== "file" && resourceType !== "folder") {
        throw new AppError("Invalid resource type. Must be 'file' or 'folder'", 400);
    }

    if (!isValidId(resourceId)) {
        throw new AppError("Invalid resource ID", 400);
    }

    if (!isValidEmail(recipientEmail)) {
        throw new AppError("Invalid recipient email address", 400);
    }

    if (permission !== "viewer" && permission !== "editor") {
        throw new AppError("Invalid permission. Must be 'viewer' or 'editor'", 400);
    }

    const validId = String(resourceId).trim();

    // 1. Verify resource existence and database-verified ownership
    let resourceName;
    if (resourceType === "file") {
        const fileRes = await pool.query(
            "SELECT id, name, owner_firebase_uid FROM files WHERE id = $1",
            [validId]
        );
        if (fileRes.rows.length === 0) {
            throw new AppError("File not found", 404);
        }
        if (fileRes.rows[0].owner_firebase_uid !== ownerUid) {
            throw new AppError("Forbidden: Only the resource owner can share this file", 403);
        }
        resourceName = fileRes.rows[0].name;
    } else {
        const folderRes = await pool.query(
            "SELECT id, name, owner_firebase_uid FROM folders WHERE id = $1",
            [validId]
        );
        if (folderRes.rows.length === 0) {
            throw new AppError("Folder not found", 404);
        }
        if (folderRes.rows[0].owner_firebase_uid !== ownerUid) {
            throw new AppError("Forbidden: Only the resource owner can share this folder", 403);
        }
        resourceName = folderRes.rows[0].name;
    }

    // 2. Resolve recipient email against registered users with valid Firebase UID
    const userRes = await pool.query(
        "SELECT id, firebase_uid, email, name FROM users WHERE LOWER(email) = LOWER($1)",
        [recipientEmail.trim()]
    );

    if (userRes.rows.length === 0 || !userRes.rows[0].firebase_uid) {
        throw new AppError("Recipient user not found or not registered with Firebase", 404);
    }

    const recipient = userRes.rows[0];

    // 3. Prevent self-sharing
    if (recipient.firebase_uid === ownerUid) {
        throw new AppError("Cannot share resource with yourself", 400);
    }

    // 4. Prevent duplicate shares
    if (resourceType === "file") {
        const dupCheck = await pool.query(
            "SELECT id FROM file_shares WHERE file_id = $1 AND shared_with_uid = $2",
            [validId, recipient.firebase_uid]
        );
        if (dupCheck.rows.length > 0) {
            throw new AppError("Resource is already shared with this user", 409);
        }

        const insertRes = await pool.query(
            `INSERT INTO file_shares (file_id, shared_by_uid, shared_with_uid, permission)
             VALUES ($1, $2, $3, $4)
             RETURNING id, file_id, shared_by_uid, shared_with_uid, permission, created_at, updated_at`,
            [validId, ownerUid, recipient.firebase_uid, permission]
        );

        const share = insertRes.rows[0];
        return {
            id: share.id,
            resourceType: "file",
            resourceId: share.file_id,
            resourceName,
            permission: share.permission,
            sharedByUid: share.shared_by_uid,
            sharedWithUid: share.shared_with_uid,
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            createdAt: share.created_at
        };
    } else {
        const dupCheck = await pool.query(
            "SELECT id FROM folder_shares WHERE folder_id = $1 AND shared_with_uid = $2",
            [validId, recipient.firebase_uid]
        );
        if (dupCheck.rows.length > 0) {
            throw new AppError("Resource is already shared with this user", 409);
        }

        const insertRes = await pool.query(
            `INSERT INTO folder_shares (folder_id, shared_by_uid, shared_with_uid, permission)
             VALUES ($1, $2, $3, $4)
             RETURNING id, folder_id, shared_by_uid, shared_with_uid, permission, created_at, updated_at`,
            [validId, ownerUid, recipient.firebase_uid, permission]
        );

        const share = insertRes.rows[0];
        return {
            id: share.id,
            resourceType: "folder",
            resourceId: share.folder_id,
            resourceName,
            permission: share.permission,
            sharedByUid: share.shared_by_uid,
            sharedWithUid: share.shared_with_uid,
            recipientEmail: recipient.email,
            recipientName: recipient.name,
            createdAt: share.created_at
        };
    }
}

/**
 * Creates a secure shareable link for a file or folder.
 *
 * @param {Object} params
 * @param {string} params.ownerUid - Authenticated Firebase UID of the owner
 * @param {'file'|'folder'} params.resourceType - 'file' or 'folder'
 * @param {string|number} params.resourceId - Resource ID
 * @param {'viewer'|'editor'} [params.permission='viewer'] - Permission granted
 * @param {boolean} [params.isAnonymousAllowed=false] - Whether public unauthenticated access is allowed
 * @param {number|null} [params.expiresInHours=null] - Hours until link expires
 * @returns {Promise<{ shareLink: Object, rawToken: string }>}
 */
export async function createShareLink({
    ownerUid,
    resourceType,
    resourceId,
    permission = "viewer",
    isAnonymousAllowed = false,
    expiresInHours = null
}) {
    if (!ownerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    if (resourceType !== "file" && resourceType !== "folder") {
        throw new AppError("Invalid resource type. Must be 'file' or 'folder'", 400);
    }

    if (!isValidId(resourceId)) {
        throw new AppError("Invalid resource ID", 400);
    }

    if (permission !== "viewer" && permission !== "editor") {
        throw new AppError("Invalid permission. Must be 'viewer' or 'editor'", 400);
    }

    const anonymous = Boolean(isAnonymousAllowed);

    // Rule: Anonymous share links must be Viewer-only
    if (anonymous && permission !== "viewer") {
        throw new AppError("Anonymous links can only grant viewer permissions. Editor access requires authentication.", 400);
    }

    let expiresAt = null;
    if (expiresInHours !== null && expiresInHours !== undefined) {
        const hours = Number(expiresInHours);
        if (isNaN(hours) || hours <= 0 || hours > 87600) { // max 10 years
            throw new AppError("Invalid expiry duration in hours", 400);
        }
        expiresAt = new Date(Date.now() + hours * 3600 * 1000);
    }

    const validId = String(resourceId).trim();

    // Verify resource ownership
    let resourceName;
    if (resourceType === "file") {
        const fileRes = await pool.query(
            "SELECT id, name, owner_firebase_uid FROM files WHERE id = $1",
            [validId]
        );
        if (fileRes.rows.length === 0) {
            throw new AppError("File not found", 404);
        }
        if (fileRes.rows[0].owner_firebase_uid !== ownerUid) {
            throw new AppError("Forbidden: Only the resource owner can create share links", 403);
        }
        resourceName = fileRes.rows[0].name;
    } else {
        const folderRes = await pool.query(
            "SELECT id, name, owner_firebase_uid FROM folders WHERE id = $1",
            [validId]
        );
        if (folderRes.rows.length === 0) {
            throw new AppError("Folder not found", 404);
        }
        if (folderRes.rows[0].owner_firebase_uid !== ownerUid) {
            throw new AppError("Forbidden: Only the resource owner can create share links", 403);
        }
        resourceName = folderRes.rows[0].name;
    }

    // Generate 32-byte secure random token and its SHA-256 hash
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

    const fileId = resourceType === "file" ? validId : null;
    const folderId = resourceType === "folder" ? validId : null;

    const insertRes = await pool.query(
        `INSERT INTO share_links (
            token_hash, file_id, folder_id, created_by_uid, permission, is_anonymous_allowed, expires_at, is_active
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, true)
         RETURNING id, file_id, folder_id, created_by_uid, permission, is_anonymous_allowed, expires_at, is_active, created_at`,
        [tokenHash, fileId, folderId, ownerUid, permission, anonymous, expiresAt]
    );

    const link = insertRes.rows[0];

    return {
        shareLink: {
            id: link.id,
            resourceType,
            resourceId: validId,
            resourceName,
            permission: link.permission,
            isAnonymousAllowed: link.is_anonymous_allowed,
            expiresAt: link.expires_at,
            isActive: link.is_active,
            createdAt: link.created_at
        },
        rawToken
    };
}

/**
 * Revokes a direct user share grant on a file or folder.
 * Only the resource owner can revoke shares.
 *
 * @param {Object} params
 * @param {string} params.ownerUid - Authenticated Firebase UID of the owner
 * @param {'file'|'folder'} params.resourceType - 'file' or 'folder'
 * @param {string|number} params.shareId - Share record ID
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function revokeUserShare({ ownerUid, resourceType, shareId }) {
    if (!ownerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    if (!isValidId(shareId)) {
        throw new AppError("Invalid share ID", 400);
    }

    const validShareId = String(shareId).trim();

    if (resourceType === "file") {
        const shareRes = await pool.query(
            `SELECT fs.id, f.owner_firebase_uid 
             FROM file_shares fs
             JOIN files f ON fs.file_id = f.id
             WHERE fs.id = $1`,
            [validShareId]
        );

        if (shareRes.rows.length === 0) {
            throw new AppError("Share record not found", 404);
        }

        if (shareRes.rows[0].owner_firebase_uid !== ownerUid) {
            throw new AppError("Forbidden: Only the resource owner can revoke this share", 403);
        }

        await pool.query("DELETE FROM file_shares WHERE id = $1", [validShareId]);
        return { success: true, message: "File share revoked successfully" };
    } else if (resourceType === "folder") {
        const shareRes = await pool.query(
            `SELECT fs.id, f.owner_firebase_uid 
             FROM folder_shares fs
             JOIN folders f ON fs.folder_id = f.id
             WHERE fs.id = $1`,
            [validShareId]
        );

        if (shareRes.rows.length === 0) {
            throw new AppError("Share record not found", 404);
        }

        if (shareRes.rows[0].owner_firebase_uid !== ownerUid) {
            throw new AppError("Forbidden: Only the resource owner can revoke this share", 403);
        }

        await pool.query("DELETE FROM folder_shares WHERE id = $1", [validShareId]);
        return { success: true, message: "Folder share revoked successfully" };
    } else {
        throw new AppError("Invalid resource type. Must be 'file' or 'folder'", 400);
    }
}

/**
 * Revokes a share link.
 * Only the link creator (owner) can revoke the link.
 *
 * @param {Object} params
 * @param {string} params.ownerUid - Authenticated Firebase UID
 * @param {string|number} params.linkId - Share link ID
 * @returns {Promise<{ success: boolean, message: string }>}
 */
export async function revokeShareLink({ ownerUid, linkId }) {
    if (!ownerUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    if (!isValidId(linkId)) {
        throw new AppError("Invalid share link ID", 400);
    }

    const validLinkId = String(linkId).trim();

    const linkRes = await pool.query(
        "SELECT id, created_by_uid, is_active FROM share_links WHERE id = $1",
        [validLinkId]
    );

    if (linkRes.rows.length === 0) {
        throw new AppError("Share link not found", 404);
    }

    if (linkRes.rows[0].created_by_uid !== ownerUid) {
        throw new AppError("Forbidden: Only the link creator can revoke this link", 403);
    }

    await pool.query(
        "UPDATE share_links SET is_active = false, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [validLinkId]
    );

    return { success: true, message: "Share link revoked successfully" };
}

/**
 * Returns all resources directly shared with the authenticated user.
 * Projections are strictly filtered to never leak storage paths.
 *
 * @param {string} userUid - Authenticated Firebase UID
 * @returns {Promise<{ files: Array, folders: Array }>}
 */
export async function getSharedWithMe(userUid) {
    if (!userUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    const filesRes = await pool.query(
        `SELECT 
            fs.id AS share_id,
            fs.permission,
            fs.created_at AS shared_at,
            f.id AS file_id,
            f.name,
            f.size,
            f.mime_type,
            f.created_at,
            f.updated_at,
            COALESCE(u.name, 'Unknown Owner') AS owner_name,
            COALESCE(u.email, f.owner_firebase_uid) AS owner_email
         FROM file_shares fs
         JOIN files f ON fs.file_id = f.id
         LEFT JOIN users u ON f.owner_firebase_uid = u.firebase_uid
         WHERE fs.shared_with_uid = $1
         ORDER BY fs.created_at DESC`,
        [userUid]
    );

    const foldersRes = await pool.query(
        `SELECT 
            fs.id AS share_id,
            fs.permission,
            fs.created_at AS shared_at,
            f.id AS folder_id,
            f.name,
            f.parent_folder_id,
            f.created_at,
            f.updated_at,
            COALESCE(u.name, 'Unknown Owner') AS owner_name,
            COALESCE(u.email, f.owner_firebase_uid) AS owner_email
         FROM folder_shares fs
         JOIN folders f ON fs.folder_id = f.id
         LEFT JOIN users u ON f.owner_firebase_uid = u.firebase_uid
         WHERE fs.shared_with_uid = $1
         ORDER BY fs.created_at DESC`,
        [userUid]
    );

    return {
        files: filesRes.rows,
        folders: foldersRes.rows
    };
}

/**
 * Returns all active user shares and links created by the authenticated user.
 *
 * @param {string} userUid - Authenticated Firebase UID
 * @returns {Promise<{ files: Array, folders: Array, links: Array }>}
 */
export async function getSharedByMe(userUid) {
    if (!userUid) {
        throw new AppError("Unauthorized: Firebase UID is required", 401);
    }

    const filesRes = await pool.query(
        `SELECT 
            fs.id AS share_id,
            fs.permission,
            fs.created_at AS shared_at,
            f.id AS file_id,
            f.name AS file_name,
            fs.shared_with_uid,
            COALESCE(u.name, 'Unknown') AS recipient_name,
            COALESCE(u.email, fs.shared_with_uid) AS recipient_email
         FROM file_shares fs
         JOIN files f ON fs.file_id = f.id
         LEFT JOIN users u ON fs.shared_with_uid = u.firebase_uid
         WHERE fs.shared_by_uid = $1
         ORDER BY fs.created_at DESC`,
        [userUid]
    );

    const foldersRes = await pool.query(
        `SELECT 
            fs.id AS share_id,
            fs.permission,
            fs.created_at AS shared_at,
            f.id AS folder_id,
            f.name AS folder_name,
            fs.shared_with_uid,
            COALESCE(u.name, 'Unknown') AS recipient_name,
            COALESCE(u.email, fs.shared_with_uid) AS recipient_email
         FROM folder_shares fs
         JOIN folders f ON fs.folder_id = f.id
         LEFT JOIN users u ON fs.shared_with_uid = u.firebase_uid
         WHERE fs.shared_by_uid = $1
         ORDER BY fs.created_at DESC`,
        [userUid]
    );

    const linksRes = await pool.query(
        `SELECT 
            sl.id AS link_id,
            CASE WHEN sl.file_id IS NOT NULL THEN 'file' ELSE 'folder' END AS resource_type,
            COALESCE(sl.file_id, sl.folder_id) AS resource_id,
            COALESCE(f.name, fold.name) AS resource_name,
            sl.permission,
            sl.is_anonymous_allowed,
            sl.expires_at,
            sl.is_active,
            sl.created_at
         FROM share_links sl
         LEFT JOIN files f ON sl.file_id = f.id
         LEFT JOIN folders fold ON sl.folder_id = fold.id
         WHERE sl.created_by_uid = $1
         ORDER BY sl.created_at DESC`,
        [userUid]
    );

    return {
        files: filesRes.rows,
        folders: foldersRes.rows,
        links: linksRes.rows
    };
}

/**
 * Resolves a public/authenticated share link token, verifying active status,
 * expiry, and authentication requirements.
 *
 * @param {string} rawToken - Plaintext 64-character hex token from URL
 * @param {string|null} [authenticatedUserUid=null] - Firebase UID if caller is logged in
 * @returns {Promise<Object>} Safe resource data and access permission
 */
export async function resolveShareLink(rawToken, authenticatedUserUid = null) {
    if (typeof rawToken !== "string" || !/^[0-9a-fA-F]{64}$/.test(rawToken.trim())) {
        throw new AppError("Invalid or malformed share link token", 400);
    }

    const tokenHash = crypto.createHash("sha256").update(rawToken.trim()).digest("hex");

    const linkRes = await pool.query(
        `SELECT id, file_id, folder_id, created_by_uid, permission, is_anonymous_allowed, expires_at, is_active, created_at
         FROM share_links
         WHERE token_hash = $1`,
        [tokenHash]
    );

    if (linkRes.rows.length === 0) {
        throw new AppError("Share link not found or invalid", 404);
    }

    const link = linkRes.rows[0];

    // Check revocation
    if (!link.is_active) {
        throw new AppError("This share link has been revoked", 410);
    }

    // Check expiration
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
        throw new AppError("This share link has expired", 410);
    }

    // Check authentication requirement
    if (!link.is_anonymous_allowed && !authenticatedUserUid) {
        throw new AppError("Authentication required to access this share link", 401);
    }

    // Safe resource projection (NO internal storage paths exposed)
    if (link.file_id) {
        const fileRes = await pool.query(
            "SELECT id, name, size, mime_type, created_at, updated_at FROM files WHERE id = $1",
            [link.file_id]
        );

        if (fileRes.rows.length === 0) {
            throw new AppError("The shared file is no longer available", 404);
        }

        return {
            linkId: link.id,
            resourceType: "file",
            resource: fileRes.rows[0],
            permission: link.permission,
            isAnonymousAllowed: link.is_anonymous_allowed,
            expiresAt: link.expires_at
        };
    } else if (link.folder_id) {
        const folderRes = await pool.query(
            "SELECT id, name, parent_folder_id, created_at, updated_at FROM folders WHERE id = $1",
            [link.folder_id]
        );

        if (folderRes.rows.length === 0) {
            throw new AppError("The shared folder is no longer available", 404);
        }

        return {
            linkId: link.id,
            resourceType: "folder",
            resource: folderRes.rows[0],
            permission: link.permission,
            isAnonymousAllowed: link.is_anonymous_allowed,
            expiresAt: link.expires_at
        };
    }

    throw new AppError("Invalid share link resource target", 500);
}

export default {
    resolvePermission,
    shareWithUser,
    createShareLink,
    revokeUserShare,
    revokeShareLink,
    getSharedWithMe,
    getSharedByMe,
    resolveShareLink
};
