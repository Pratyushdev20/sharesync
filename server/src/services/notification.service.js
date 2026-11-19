import pool from "../config/db.js";
import env from "../config/env.js";
import AppError from "../utils/AppError.js";
import log from "../utils/log.js";
import { emitToUsers } from "../realtime/socket.js";

/**
 * Notifications: stored in PostgreSQL (history + read/unread), delivered in real time over
 * Socket.IO, and optionally forwarded to mobile push through pluggable transports.
 */

const PUBLIC_FIELDS = "id, type, title, body, resource_type, resource_id, data, read_at, created_at";

function toPublic(row) {
    return {
        id: String(row.id),
        type: row.type,
        title: row.title,
        body: row.body,
        resource_type: row.resource_type,
        resource_id: row.resource_id === null ? null : String(row.resource_id),
        data: row.data || {},
        read: row.read_at !== null,
        read_at: row.read_at,
        created_at: row.created_at,
    };
}

// ---------------------------------------------------------------------------
// Delivery transports (extensible: add email, web push, ... here)
// ---------------------------------------------------------------------------

/** Expo push service (free). Enabled with PUSH_ENABLED=true; tokens registered by the mobile app. */
const expoPushTransport = {
    name: "expo-push",
    enabled: () => env.pushEnabled,
    async deliver(notifications) {
        const uids = [...new Set(notifications.map((n) => n.user_uid))];
        const tokens = await pool.query("SELECT user_uid, token FROM push_tokens WHERE user_uid = ANY($1)", [uids]);
        if (tokens.rows.length === 0) return;
        const messages = [];
        for (const n of notifications) {
            for (const t of tokens.rows.filter((row) => row.user_uid === n.user_uid)) {
                messages.push({
                    to: t.token,
                    title: n.title,
                    body: n.body,
                    data: { notificationId: String(n.id), type: n.type, resourceType: n.resource_type, resourceId: n.resource_id },
                });
            }
        }
        for (let i = 0; i < messages.length; i += 100) {
            const batch = messages.slice(i, i + 100);
            try {
                const res = await fetch("https://exp.host/--/api/v2/push/send", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        ...(env.expoAccessToken ? { Authorization: `Bearer ${env.expoAccessToken}` } : {}),
                    },
                    body: JSON.stringify(batch),
                });
                if (!res.ok) {
                    log.warn("push.send_failed", { status: res.status });
                    continue;
                }
                const result = await res.json();
                if (Array.isArray(result?.data)) {
                    for (let j = 0; j < result.data.length; j++) {
                        const ticket = result.data[j];
                        if (ticket?.status === "error" && ticket?.details?.error === "DeviceNotRegistered") {
                            const deadToken = batch[j]?.to;
                            if (deadToken) {
                                log.info("push.token_pruned", { token: deadToken });
                                await pool.query("DELETE FROM push_tokens WHERE token = $1", [deadToken]).catch(() => {});
                            }
                        }
                    }
                }
            } catch (err) {
                log.warn("push.deliver_exception", { err });
            }
        }
    },
};

const transports = [expoPushTransport];

/** Registers an additional delivery transport ({ name, enabled(), deliver(rows) }). */
export function registerTransport(transport) {
    transports.push(transport);
}

/**
 * Creates notifications, emits them in real time, and hands them to enabled transports.
 * Never throws: a failed notification must not fail the action that triggered it.
 * @param {Array<{userUid, type, title, body?, resourceType?, resourceId?, actorUid?, data?}>} items
 */
export async function createNotifications(items) {
    const list = items.filter((n) => n && n.userUid && n.userUid !== n.actorUid);
    if (list.length === 0) return [];
    try {
        const values = [];
        const params = [];
        list.forEach((n, i) => {
            const o = i * 8;
            values.push(`($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, $${o + 8})`);
            params.push(
                n.userUid,
                n.type,
                String(n.title).slice(0, 255),
                String(n.body || "").slice(0, 2000),
                n.resourceType || null,
                n.resourceId ?? null,
                n.actorUid || null,
                JSON.stringify(n.data || {})
            );
        });
        const res = await pool.query(
            `INSERT INTO notifications (user_uid, type, title, body, resource_type, resource_id, actor_uid, data)
             VALUES ${values.join(", ")}
             RETURNING user_uid, ${PUBLIC_FIELDS}`,
            params
        );

        for (const row of res.rows) {
            emitToUsers([row.user_uid], "notification:new", toPublic(row));
        }

        for (const transport of transports) {
            if (!transport.enabled()) continue;
            transport.deliver(res.rows).catch((err) => log.warn("notification.transport_failed", { err, transport: transport.name }));
        }
        return res.rows.map(toPublic);
    } catch (err) {
        log.error("notification.create_failed", { err });
        return [];
    }
}

export async function listNotifications(userUid, { limit = 30, before = null, unreadOnly = false } = {}) {
    const params = [userUid];
    let where = "user_uid = $1";
    if (unreadOnly) where += " AND read_at IS NULL";
    if (before) {
        params.push(before);
        where += ` AND id < $${params.length}`;
    }
    params.push(Math.min(Math.max(Number(limit) || 30, 1), 100) + 1);
    const res = await pool.query(
        `SELECT ${PUBLIC_FIELDS} FROM notifications WHERE ${where} ORDER BY id DESC LIMIT $${params.length}`,
        params
    );
    const pageSize = params[params.length - 1] - 1;
    const rows = res.rows.slice(0, pageSize).map(toPublic);
    return {
        notifications: rows,
        hasMore: res.rows.length > pageSize,
        nextBefore: rows.length ? rows[rows.length - 1].id : null,
        unreadCount: await unreadCount(userUid),
    };
}

export async function unreadCount(userUid) {
    const res = await pool.query(
        "SELECT COUNT(*)::int AS c FROM notifications WHERE user_uid = $1 AND read_at IS NULL",
        [userUid]
    );
    return res.rows[0].c;
}

/** Marks one notification read. 404 if it does not exist OR belongs to someone else (no IDOR). */
export async function markRead(userUid, notificationId, read = true) {
    const res = await pool.query(
        `UPDATE notifications SET read_at = ${read ? "COALESCE(read_at, CURRENT_TIMESTAMP)" : "NULL"}
         WHERE id = $1 AND user_uid = $2
         RETURNING ${PUBLIC_FIELDS}`,
        [notificationId, userUid]
    );
    if (res.rows.length === 0) throw new AppError("Notification not found", 404);
    const count = await unreadCount(userUid);
    emitToUsers([userUid], "notification:read", { ids: [String(notificationId)], unreadCount: count });
    return { notification: toPublic(res.rows[0]), unreadCount: count };
}

export async function markAllRead(userUid) {
    const res = await pool.query(
        "UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_uid = $1 AND read_at IS NULL",
        [userUid]
    );
    emitToUsers([userUid], "notification:read", { all: true, unreadCount: 0 });
    return { updated: res.rowCount, unreadCount: 0 };
}

export async function deleteNotification(userUid, notificationId) {
    const res = await pool.query("DELETE FROM notifications WHERE id = $1 AND user_uid = $2", [notificationId, userUid]);
    if (res.rowCount === 0) throw new AppError("Notification not found", 404);
    return { unreadCount: await unreadCount(userUid) };
}

/** Stores an Expo push token for the user (moves it if the device switched accounts). */
export async function registerPushToken(userUid, token, platform) {
    if (!/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$/.test(token)) {
        throw new AppError("Invalid push token", 400, "VALIDATION_ERROR");
    }
    await pool.query(
        `INSERT INTO push_tokens (user_uid, token, platform, last_used_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (token) DO UPDATE SET user_uid = EXCLUDED.user_uid, platform = EXCLUDED.platform, last_used_at = CURRENT_TIMESTAMP`,
        [userUid, token, platform || null]
    );
    return { registered: true, pushEnabled: env.pushEnabled };
}

export async function unregisterPushToken(userUid, token) {
    await pool.query("DELETE FROM push_tokens WHERE user_uid = $1 AND token = $2", [userUid, token]);
    return { removed: true };
}
