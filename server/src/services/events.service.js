import pool from "../config/db.js";
import env from "../config/env.js";
import log from "../utils/log.js";
import { emitToUsers } from "../realtime/socket.js";

/**
 * Change feed, activity log and audience calculation.
 *
 * Every successful mutation calls `publishChange()`, which:
 *  1. computes the audience (owner + everyone with access through direct or inherited shares),
 *  2. stores one sync_events row per audience member (durable change feed for offline devices),
 *  3. pushes the event in real time to each member's devices,
 *  4. writes an activity_log entry.
 *
 * Publishing never fails the user's request: errors are logged, and clients also do a full
 * refresh whenever they reconnect.
 */

/** Owner + users with a share on the folder or any of its ancestors. */
export async function audienceForFolder(folderId, ownerUid) {
    const audience = new Set(ownerUid ? [ownerUid] : []);
    if (folderId === null || folderId === undefined) return audience;
    const res = await pool.query(
        `WITH RECURSIVE ancestors AS (
            SELECT id, parent_folder_id, 0 AS depth FROM folders WHERE id = $1
            UNION ALL
            SELECT f.id, f.parent_folder_id, a.depth + 1
            FROM folders f JOIN ancestors a ON f.id = a.parent_folder_id
            WHERE a.depth < 100
         )
         SELECT DISTINCT fs.shared_with_uid FROM folder_shares fs JOIN ancestors a ON a.id = fs.folder_id`,
        [folderId]
    );
    res.rows.forEach((r) => audience.add(r.shared_with_uid));
    return audience;
}

/** Folder audience + users the file itself is shared with. */
export async function audienceForFile(fileId, folderId, ownerUid) {
    const audience = await audienceForFolder(folderId, ownerUid);
    if (fileId) {
        const res = await pool.query("SELECT shared_with_uid FROM file_shares WHERE file_id = $1", [fileId]);
        res.rows.forEach((r) => audience.add(r.shared_with_uid));
    }
    return audience;
}

/** Display name for notifications ("Rahul uploaded ..."). */
export async function getUserName(uid) {
    if (!uid) return "Someone";
    const res = await pool.query("SELECT name FROM users WHERE firebase_uid = $1", [uid]);
    return res.rows[0]?.name || "Someone";
}

export async function recordActivity({ actorUid, action, resourceType = null, resourceId = null, ownerUid = null, metadata = {} }) {
    try {
        await pool.query(
            `INSERT INTO activity_log (actor_uid, action, resource_type, resource_id, owner_uid, metadata)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [actorUid || null, action, resourceType, resourceId, ownerUid, JSON.stringify(metadata)]
        );
    } catch (err) {
        log.warn("activity.record_failed", { err, action });
    }
}

/**
 * @param {object} change
 * @param {Iterable<string>} change.audience - user uids that may see this change
 * @param {string} change.actorUid
 * @param {string} change.eventType - e.g. "file.created", "note.updated", "share.revoked"
 * @param {'file'|'folder'|'note'|'share'|'link'} change.resourceType
 * @param {string|number|null} change.resourceId
 * @param {string|number|null} [change.folderId] - folder the resource lives in (for client refresh)
 * @param {object} [change.payload] - small, non-sensitive details (name, version, ...)
 * @param {string|null} [change.ownerUid] - for the activity log
 * @param {boolean} [change.activity=true] - also write an activity_log entry
 */
export async function publishChange({
    audience,
    actorUid,
    eventType,
    resourceType,
    resourceId = null,
    folderId = null,
    payload = {},
    ownerUid = null,
    activity = true,
}) {
    try {
        const users = [...new Set(audience)].filter(Boolean);
        const body = { ...payload, actorUid: actorUid || null };

        if (users.length > 0) {
            const values = [];
            const params = [];
            users.forEach((uid, i) => {
                const o = i * 6;
                values.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6})`);
                params.push(uid, eventType, resourceType, resourceId, folderId, JSON.stringify(body));
            });
            const inserted = await pool.query(
                `INSERT INTO sync_events (user_uid, event_type, resource_type, resource_id, folder_id, payload)
                 VALUES ${values.join(", ")}
                 RETURNING id, user_uid, created_at`,
                params
            );
            const byUser = new Map(inserted.rows.map((r) => [r.user_uid, r]));
            emitToUsers(users, "sync:event", (uid) => ({
                id: String(byUser.get(uid)?.id ?? ""),
                type: eventType,
                resourceType,
                resourceId: resourceId === null ? null : String(resourceId),
                folderId: folderId === null || folderId === undefined ? null : String(folderId),
                payload: body,
                createdAt: byUser.get(uid)?.created_at,
            }));
        }

        if (activity) {
            await recordActivity({
                actorUid,
                action: eventType,
                resourceType: ["file", "folder", "note"].includes(resourceType) ? resourceType : null,
                resourceId: ["file", "folder", "note"].includes(resourceType) ? resourceId : null,
                ownerUid,
                metadata: payload,
            });
        }
    } catch (err) {
        log.error("sync.publish_failed", { err, eventType, resourceType, resourceId });
    }
}

/**
 * Removes change-feed entries older than the retention period and raises the prune
 * watermark, so devices with an older cursor know they must do a full reload.
 */
export async function pruneSyncEvents({ olderThanDays = env.syncRetentionDays } = {}) {
    try {
        const res = await pool.query(
            `WITH deleted AS (
                DELETE FROM sync_events WHERE created_at < NOW() - make_interval(days => $1::int) RETURNING id
             )
             UPDATE sync_state SET value = GREATEST(value, COALESCE((SELECT MAX(id) FROM deleted), 0)),
                                   updated_at = CURRENT_TIMESTAMP
             WHERE key = 'prune_watermark'
             RETURNING value, (SELECT COUNT(*) FROM deleted)::int AS rows`,
            [olderThanDays]
        );
        const rows = res.rows[0]?.rows || 0;
        if (rows) log.info("sync.pruned", { rows, watermark: res.rows[0].value });
        return rows;
    } catch (err) {
        log.warn("sync.prune_failed", { err });
        return 0;
    }
}
