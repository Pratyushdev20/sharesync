import pool from "../config/db.js";
import AppError from "../utils/AppError.js";



export async function getUsers(firebaseUid = null) {
    if (firebaseUid) {
        const result = await pool.query(
            "SELECT id, name, email, created_at, firebase_uid FROM users WHERE firebase_uid = $1",
            [firebaseUid]
        );
        return result.rows;
    }
    const result = await pool.query(
        "SELECT id, name, email, created_at, firebase_uid FROM users"
    );
    return result.rows;
}

export async function createUser(userData) {
    const { name, email, firebase_uid } = userData;
    const result = await pool.query(
        "INSERT INTO users (name, email, firebase_uid) VALUES ($1, $2, $3) RETURNING id, name, email, created_at, firebase_uid",
        [name, email, firebase_uid || null]
    );
    return result.rows[0];
}

export async function getUserByEmail(email) {
    if (!email) return null;
    const result = await pool.query(
        "SELECT id, name, email, created_at, firebase_uid FROM users WHERE email = $1",
        [email]
    );
    return result.rows[0];
}

export async function getUserById(userId) {
    const isNumeric = /^\d+$/.test(String(userId));
    const query = isNumeric
        ? "SELECT id, name, email, created_at, firebase_uid FROM users WHERE id = $1 OR firebase_uid = $2"
        : "SELECT id, name, email, created_at, firebase_uid FROM users WHERE firebase_uid = $1";
    const params = isNumeric ? [userId, String(userId)] : [userId];
    const user = await pool.query(query, params);
    return user.rows[0];
}

export async function updateUser(userId, userdata) {
    const { name, email } = userdata;
    if (!name && !email) {
        throw new AppError("Nothing to update", 400);
    }

    let query;
    let params;

    if (name && email) {
        query = "UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING id, name, email, created_at, firebase_uid";
        params = [name, email, userId];
    } else if (name) {
        query = "UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email, created_at, firebase_uid";
        params = [name, userId];
    } else {
        query = "UPDATE users SET email = $1 WHERE id = $2 RETURNING id, name, email, created_at, firebase_uid";
        params = [email, userId];
    }

    const result = await pool.query(query, params);
    return result.rows[0];
}

/**
 * Deletes a user account and ALL data it owns, atomically:
 * notes, files (DB rows; stored objects are removed after commit), folders (deepest first,
 * because of the parent RESTRICT constraint), shares given and received, links, notifications,
 * change feed, devices and push tokens. The Firebase Authentication account itself is managed
 * by Firebase and is not deleted here.
 */
export async function deleteUser(userId) {
    const client = await pool.connect();
    let storagePaths = [];
    let deleted;
    try {
        await client.query("BEGIN");
        const userRes = await client.query(
            "SELECT id, name, email, created_at, firebase_uid FROM users WHERE id = $1 FOR UPDATE",
            [userId]
        );
        if (userRes.rows.length === 0) {
            await client.query("ROLLBACK");
            return undefined;
        }
        deleted = userRes.rows[0];
        const uid = deleted.firebase_uid;

        const files = await client.query(
            "SELECT storage_path FROM files WHERE owner_id = $1 OR (owner_firebase_uid IS NOT NULL AND owner_firebase_uid = $2)",
            [userId, uid]
        );
        storagePaths = files.rows.map((r) => r.storage_path).filter(Boolean);

        if (uid) {
            await client.query("DELETE FROM notes WHERE owner_firebase_uid = $1", [uid]);
            await client.query("DELETE FROM file_shares WHERE shared_by_uid = $1 OR shared_with_uid = $1", [uid]);
            await client.query("DELETE FROM folder_shares WHERE shared_by_uid = $1 OR shared_with_uid = $1", [uid]);
            await client.query("DELETE FROM share_links WHERE created_by_uid = $1", [uid]);
            await client.query("DELETE FROM notifications WHERE user_uid = $1", [uid]);
            await client.query("DELETE FROM sync_events WHERE user_uid = $1", [uid]);
            await client.query("DELETE FROM sync_devices WHERE user_uid = $1", [uid]);
            await client.query("DELETE FROM push_tokens WHERE user_uid = $1", [uid]);
        }
        await client.query(
            "DELETE FROM files WHERE owner_id = $1 OR (owner_firebase_uid IS NOT NULL AND owner_firebase_uid = $2)",
            [userId, uid]
        );
        // Folders reference their parent with ON DELETE RESTRICT: remove leaves first
        for (let i = 0; i < 1000; i++) {
            const res = await client.query(
                `DELETE FROM folders f
                 WHERE (f.owner_id = $1 OR (f.owner_firebase_uid IS NOT NULL AND f.owner_firebase_uid = $2))
                   AND NOT EXISTS (SELECT 1 FROM folders c WHERE c.parent_folder_id = f.id)`,
                [userId, uid]
            );
            if (res.rowCount === 0) break;
        }
        await client.query("DELETE FROM users WHERE id = $1", [userId]);
        await client.query("COMMIT");
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        client.release();
    }

    // Remove stored (encrypted) objects only after the database commit succeeded
    const { default: storageService } = await import("./storage.service.js");
    for (const p of storagePaths) {
        await storageService.deleteFile(p);
    }
    return deleted;
}

export async function getUserByFirebaseUid(firebaseUid, email = null) {
    let result = await pool.query(
        "SELECT id, name, email, created_at, firebase_uid FROM users WHERE firebase_uid = $1",
        [firebaseUid]
    );

    // If user is not yet associated by firebase_uid, check if they exist by email and link them
    if (!result.rows[0] && email) {
        result = await pool.query(
            "UPDATE users SET firebase_uid = $1 WHERE email = $2 AND firebase_uid IS NULL RETURNING id, name, email, created_at, firebase_uid",
            [firebaseUid, email]
        );
    }

    return result.rows[0];
}
/**
 * Profile + usage statistics for the signed-in user (only their own data).
 */
export async function getProfile(firebaseUid) {
    const userRes = await pool.query(
        "SELECT id, name, email, created_at FROM users WHERE firebase_uid = $1",
        [firebaseUid]
    );
    if (userRes.rows.length === 0) return null;
    const stats = await pool.query(
        `SELECT
            (SELECT COUNT(*) FROM files WHERE owner_firebase_uid = $1)::int AS files,
            (SELECT COALESCE(SUM(size), 0) FROM files WHERE owner_firebase_uid = $1)::bigint AS bytes,
            (SELECT COUNT(*) FROM folders WHERE owner_firebase_uid = $1)::int AS folders,
            (SELECT COUNT(*) FROM notes WHERE owner_firebase_uid = $1)::int AS notes,
            ((SELECT COUNT(*) FROM file_shares WHERE shared_by_uid = $1) +
             (SELECT COUNT(*) FROM folder_shares WHERE shared_by_uid = $1))::int AS shares_given,
            ((SELECT COUNT(*) FROM file_shares WHERE shared_with_uid = $1) +
             (SELECT COUNT(*) FROM folder_shares WHERE shared_with_uid = $1))::int AS shares_received,
            (SELECT COUNT(*) FROM share_links WHERE created_by_uid = $1 AND is_active = true
                AND (expires_at IS NULL OR expires_at > NOW()))::int AS active_links,
            (SELECT COUNT(*) FROM sync_devices WHERE user_uid = $1)::int AS devices`,
        [firebaseUid]
    );
    const s = stats.rows[0];
    return {
        ...userRes.rows[0],
        stats: {
            files: s.files,
            storageBytes: Number(s.bytes),
            folders: s.folders,
            notes: s.notes,
            sharesGiven: s.shares_given,
            sharesReceived: s.shares_received,
            activeLinks: s.active_links,
            devices: s.devices,
        },
    };
}

export async function updateProfileName(firebaseUid, name) {
    const res = await pool.query(
        "UPDATE users SET name = $1 WHERE firebase_uid = $2 RETURNING id, name, email, created_at",
        [name, firebaseUid]
    );
    return res.rows[0];
}
