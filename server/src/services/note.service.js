import pool from "../config/db.js";
import AppError from "../utils/AppError.js";
import { requireFolderAccess, requireNoteAccess } from "./access.service.js";
import { audienceForFolder, getUserName, publishChange } from "./events.service.js";
import { createNotifications } from "./notification.service.js";

/**
 * Notes & documents workspace.
 *
 * - Stored in PostgreSQL (`notes`), organised in workspace folders (or at the root).
 * - Permissions follow the folder: owner / editor can edit, viewer can read.
 *   Notes created inside a shared folder belong to the folder owner (creator is recorded).
 * - Conflict detection: every update must send `expected_version`; if the note changed on
 *   another device in the meantime the update is rejected with 409 CONFLICT and the current
 *   server copy, so the client can let the user choose.
 */

const LIST_FIELDS = `id, owner_firebase_uid, folder_id, kind, title, version, created_by_uid, updated_by_uid,
                     created_at, updated_at, LEFT(content, 200) AS preview, octet_length(content) AS size`;

function toPublic(note, permission) {
    const out = {
        id: String(note.id),
        folder_id: note.folder_id === null ? null : String(note.folder_id),
        kind: note.kind,
        title: note.title,
        version: note.version,
        created_at: note.created_at,
        updated_at: note.updated_at,
    };
    if (note.content !== undefined) out.content = note.content;
    if (note.preview !== undefined) out.preview = note.preview;
    if (note.size !== undefined) out.size = Number(note.size);
    if (permission) out.access = permission;
    return out;
}

async function noteAudience(note) {
    return audienceForFolder(note.folder_id, note.owner_firebase_uid);
}

/** Notifies other people with access when a note changes inside a shared folder. */
async function notifyShared(note, actorUid, verb) {
    const audience = await noteAudience(note);
    audience.delete(actorUid);
    if (audience.size === 0) return;
    const actorName = await getUserName(actorUid);
    await createNotifications([...audience].map((userUid) => ({
        userUid,
        actorUid,
        type: `note.${verb}`,
        title: `${actorName} ${verb} a note`,
        body: `"${note.title}"`,
        resourceType: "note",
        resourceId: note.id,
        data: { folderId: note.folder_id === null ? null : String(note.folder_id) },
    })));
}

export async function createNote(callerUid, { title, content = "", kind = "note", folder_id = null }) {
    let ownerUid = callerUid;
    if (folder_id !== null) {
        let access;
        try {
            access = await requireFolderAccess(callerUid, folder_id, "editor", "create notes in this folder");
        } catch (err) {
            if (err.statusCode === 404) throw new AppError("Folder not found", 404);
            throw err;
        }
        ownerUid = access.folder.owner_firebase_uid;
    }

    const res = await pool.query(
        `INSERT INTO notes (owner_firebase_uid, folder_id, kind, title, content, created_by_uid, updated_by_uid)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         RETURNING id, owner_firebase_uid, folder_id, kind, title, content, version, created_at, updated_at`,
        [ownerUid, folder_id, kind, title, content, callerUid]
    );
    const note = res.rows[0];
    const permission = ownerUid === callerUid ? "owner" : "editor";

    await publishChange({
        audience: await noteAudience(note),
        actorUid: callerUid,
        eventType: "note.created",
        resourceType: "note",
        resourceId: note.id,
        folderId: note.folder_id,
        ownerUid,
        payload: { title: note.title, version: note.version, kind: note.kind },
    });
    await notifyShared(note, callerUid, "created");

    return toPublic(note, permission);
}

/**
 * Lists notes (without full content; `preview` holds the first 200 characters).
 * - folder_id = id     → notes in that folder (requires viewer access; works for shared folders)
 * - folder_id = "root" → the caller's notes that are not in a folder
 * - no folder_id       → all of the caller's own notes
 */
export async function listNotes(callerUid, { folder_id, q, kind } = {}) {
    const params = [];
    const where = [];
    let permission = "owner";

    if (folder_id === "root") {
        params.push(callerUid);
        where.push(`owner_firebase_uid = $${params.length} AND folder_id IS NULL`);
    } else if (folder_id) {
        const access = await requireFolderAccess(callerUid, folder_id, "viewer", "view notes in this folder");
        permission = access.permission;
        params.push(folder_id);
        where.push(`folder_id = $${params.length}`);
    } else {
        params.push(callerUid);
        where.push(`owner_firebase_uid = $${params.length}`);
    }
    if (kind) {
        params.push(kind);
        where.push(`kind = $${params.length}`);
    }
    if (q) {
        params.push(`%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
        where.push(`(title ILIKE $${params.length} OR content ILIKE $${params.length})`);
    }

    const res = await pool.query(
        `SELECT ${LIST_FIELDS} FROM notes WHERE ${where.join(" AND ")} ORDER BY updated_at DESC, id DESC LIMIT 500`,
        params
    );
    return res.rows.map((n) => toPublic(n, n.owner_firebase_uid === callerUid ? "owner" : permission));
}

export async function getNote(callerUid, noteId) {
    const { note, permission } = await requireNoteAccess(callerUid, noteId, "viewer", "view this note");
    return toPublic(note, permission);
}

/**
 * Updates title / content / kind / folder with optimistic concurrency.
 * Moving a note to another folder is owner-only and the target must be the owner's folder.
 */
export async function updateNote(callerUid, noteId, { title, content, kind, folder_id, expected_version }) {
    const { note, permission } = await requireNoteAccess(callerUid, noteId, "editor", "edit this note");

    let targetFolder = note.folder_id;
    if (folder_id !== undefined && String(folder_id ?? "") !== String(note.folder_id ?? "")) {
        if (permission !== "owner") {
            throw new AppError("Forbidden: Only the owner can move this note", 403);
        }
        if (folder_id !== null) {
            const { folder } = await requireFolderAccess(callerUid, folder_id, "owner", "move notes into this folder");
            targetFolder = folder.id;
        } else {
            targetFolder = null;
        }
    }

    const res = await pool.query(
        `UPDATE notes SET
            title = COALESCE($1, title),
            content = COALESCE($2, content),
            kind = COALESCE($3, kind),
            folder_id = $4,
            version = version + 1,
            updated_by_uid = $5,
            updated_at = CURRENT_TIMESTAMP
         WHERE id = $6 AND version = $7
         RETURNING id, owner_firebase_uid, folder_id, kind, title, content, version, created_at, updated_at`,
        [title ?? null, content ?? null, kind ?? null, targetFolder, callerUid, noteId, expected_version]
    );

    if (res.rows.length === 0) {
        // Someone else changed it first: return the current server copy for conflict resolution
        const current = await pool.query(
            `SELECT id, owner_firebase_uid, folder_id, kind, title, content, version, created_at, updated_at
             FROM notes WHERE id = $1`,
            [noteId]
        );
        if (current.rows.length === 0) throw new AppError("Note not found", 404);
        const err = new AppError(
            "This note was changed on another device. Review the latest version before saving.",
            409,
            "CONFLICT"
        );
        err.details = { current: toPublic(current.rows[0], permission) };
        throw err;
    }

    const updated = res.rows[0];
    const audience = await noteAudience(updated);
    if (String(note.folder_id ?? "") !== String(updated.folder_id ?? "")) {
        (await noteAudience(note)).forEach((uid) => audience.add(uid));
    }
    await publishChange({
        audience,
        actorUid: callerUid,
        eventType: "note.updated",
        resourceType: "note",
        resourceId: updated.id,
        folderId: updated.folder_id,
        ownerUid: updated.owner_firebase_uid,
        payload: { title: updated.title, version: updated.version, previousFolderId: note.folder_id === null ? null : String(note.folder_id) },
    });

    return toPublic(updated, permission);
}

export async function deleteNote(callerUid, noteId, { expected_version } = {}) {
    const { note } = await requireNoteAccess(callerUid, noteId, "editor", "delete this note");
    const audience = await noteAudience(note);

    const params = [noteId];
    let sql = "DELETE FROM notes WHERE id = $1";
    if (expected_version !== undefined && expected_version !== null) {
        params.push(expected_version);
        sql += " AND version = $2";
    }
    const res = await pool.query(sql, params);
    if (res.rowCount === 0) {
        throw new AppError("This note was changed on another device. Reload it before deleting.", 409, "CONFLICT");
    }

    await publishChange({
        audience,
        actorUid: callerUid,
        eventType: "note.deleted",
        resourceType: "note",
        resourceId: note.id,
        folderId: note.folder_id,
        ownerUid: note.owner_firebase_uid,
        payload: { title: note.title },
    });
    await notifyShared(note, callerUid, "deleted");

    return { id: String(note.id), title: note.title };
}
