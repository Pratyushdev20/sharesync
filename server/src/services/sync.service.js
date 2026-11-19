import pool from "../config/db.js";
import AppError from "../utils/AppError.js";

/**
 * Change feed for reliable synchronisation.
 *
 * Devices remember the id of the last event they processed ("cursor"). After being offline
 * they call getChanges(since=cursor) to receive everything they missed, in order. If the
 * cursor is older than the retained history, `reset: true` tells the device to do a full reload.
 */

function toPublic(row) {
    return {
        id: String(row.id),
        type: row.event_type,
        resourceType: row.resource_type,
        resourceId: row.resource_id === null ? null : String(row.resource_id),
        folderId: row.folder_id === null ? null : String(row.folder_id),
        payload: row.payload || {},
        createdAt: row.created_at,
    };
}

export async function getCursor(userUid) {
    const res = await pool.query("SELECT COALESCE(MAX(id), 0)::text AS cursor FROM sync_events WHERE user_uid = $1", [userUid]);
    return res.rows[0].cursor;
}

export async function getChanges(userUid, { since = "0", limit = 200 } = {}) {
    const pageSize = Math.min(Math.max(Number(limit) || 200, 1), 500);
    const sinceId = String(since);

    // Events up to the prune watermark were deleted by retention: a cursor below it may have
    // missed changes, so the client must reload fully instead of trusting the feed.
    let reset = false;
    if (sinceId !== "0") {
        const wm = await pool.query("SELECT value::text AS value FROM sync_state WHERE key = 'prune_watermark'");
        const watermark = BigInt(wm.rows[0]?.value || "0");
        reset = BigInt(sinceId) < watermark;
    }

    const res = await pool.query(
        `SELECT id, event_type, resource_type, resource_id, folder_id, payload, created_at
         FROM sync_events WHERE user_uid = $1 AND id > $2
         ORDER BY id ASC LIMIT $3`,
        [userUid, sinceId, pageSize + 1]
    );
    const events = res.rows.slice(0, pageSize).map(toPublic);
    const cursor = events.length ? events[events.length - 1].id : sinceId === "0" ? await getCursor(userUid) : sinceId;
    return { events, cursor, hasMore: res.rows.length > pageSize, reset };
}

export async function registerDevice(userUid, { deviceId, platform, deviceName, cursor }) {
    const res = await pool.query(
        `INSERT INTO sync_devices (user_uid, device_id, platform, device_name, last_seen_at, last_sync_cursor)
         VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP, $5)
         ON CONFLICT (user_uid, device_id) DO UPDATE SET
            platform = EXCLUDED.platform,
            device_name = COALESCE(EXCLUDED.device_name, sync_devices.device_name),
            last_seen_at = CURRENT_TIMESTAMP,
            last_sync_cursor = COALESCE(EXCLUDED.last_sync_cursor, sync_devices.last_sync_cursor)
         RETURNING device_id, platform, device_name, last_seen_at, last_sync_cursor`,
        [userUid, deviceId, platform || null, deviceName || null, cursor ?? null]
    );
    return res.rows[0];
}

export async function listDevices(userUid) {
    const res = await pool.query(
        `SELECT device_id, platform, device_name, last_seen_at, last_sync_cursor::text, created_at
         FROM sync_devices WHERE user_uid = $1 ORDER BY last_seen_at DESC`,
        [userUid]
    );
    return res.rows;
}

export async function removeDevice(userUid, deviceId) {
    const res = await pool.query("DELETE FROM sync_devices WHERE user_uid = $1 AND device_id = $2", [userUid, deviceId]);
    if (res.rowCount === 0) throw new AppError("Device not found", 404);
    return { removed: true };
}
