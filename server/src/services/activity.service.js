import pool from "../config/db.js";
import AppError from "../utils/AppError.js";
import { requireFileAccess, requireFolderAccess, requireNoteAccess } from "./access.service.js";

/**
 * Activity / audit history.
 * - Per resource: visible to anyone who can currently view the resource.
 * - Personal feed: actions you performed or that happened to resources you own.
 */

const FIELDS = `a.id::text, a.action, a.resource_type, a.resource_id::text, a.metadata, a.created_at,
                COALESCE(u.name, CASE WHEN a.actor_uid IS NULL THEN 'Anonymous link visitor' ELSE 'Unknown user' END) AS actor_name,
                (a.actor_uid = $1) AS by_me`;

export async function listResourceActivity(userUid, resourceType, resourceId, { limit = 50 } = {}) {
    if (resourceType === "file") await requireFileAccess(userUid, resourceId, "viewer", "view this file's activity");
    else if (resourceType === "folder") await requireFolderAccess(userUid, resourceId, "viewer", "view this folder's activity");
    else if (resourceType === "note") await requireNoteAccess(userUid, resourceId, "viewer", "view this note's activity");
    else throw new AppError("Invalid resource type", 400, "VALIDATION_ERROR");

    const res = await pool.query(
        `SELECT ${FIELDS}
         FROM activity_log a LEFT JOIN users u ON u.firebase_uid = a.actor_uid
         WHERE a.resource_type = $2 AND a.resource_id = $3
         ORDER BY a.id DESC LIMIT $4`,
        [userUid, resourceType, resourceId, Math.min(Number(limit) || 50, 200)]
    );
    return res.rows;
}

export async function listMyActivity(userUid, { limit = 50 } = {}) {
    const res = await pool.query(
        `SELECT ${FIELDS}
         FROM activity_log a LEFT JOIN users u ON u.firebase_uid = a.actor_uid
         WHERE a.actor_uid = $1 OR a.owner_uid = $1
         ORDER BY a.id DESC LIMIT $2`,
        [userUid, Math.min(Number(limit) || 50, 200)]
    );
    return res.rows;
}
