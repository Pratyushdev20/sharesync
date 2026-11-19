/**
 * End-to-end tests for the Sharing API (Feature 30).
 * Actors: OWNER (shares), BROTHER (recipient with a ShareSync account), STRANGER (no access),
 * and anonymous visitors using share links.
 *
 * Run: NODE_ENV=test node test_sharing_api.mjs
 */
import app from "./src/app.js";
import pool from "./src/config/db.js";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import env from "./src/config/env.js";
import { redactUrl } from "./src/middleware/logger.js";

const STAMP = Date.now();
const mk = (key, name) => ({
    uid: `test_share_${key}_${STAMP}`,
    name,
    email: `${key}_${STAMP}@example.com`,
    token: `token_share_${key}_${STAMP}`
});
const OWNER = mk("owner", "Owner Pratyush");
const BROTHER = mk("brother", "Brother Rahul");
const STRANGER = mk("stranger", "Stranger Eve");
const USERS = [OWNER, BROTHER, STRANGER];

let server, baseUrl;
const userIds = [];

let passed = 0;
let failed = 0;
function assert(condition, message) {
    if (condition) { console.log(`  ✅ PASS: ${message}`); passed++; }
    else { console.error(`  ❌ FAIL: ${message}`); failed++; }
}

// ---------- helpers ----------
function headers(user, extra = {}) {
    const h = { ...extra };
    if (user) h.Authorization = `Bearer ${user.token}`;
    return h;
}
async function api(method, url, user, body, extraHeaders = {}) {
    const opts = { method, headers: headers(user, extraHeaders) };
    if (body !== undefined) {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(baseUrl + url, opts);
    let data = null;
    const text = await res.text();
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers, raw: text };
}
async function upload(user, name, buffer, mime, folderId = null) {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mime }), name);
    if (folderId) form.append("folder_id", String(folderId));
    const res = await fetch(`${baseUrl}/api/files/upload`, { method: "POST", headers: headers(user), body: form });
    return { status: res.status, data: await res.json() };
}
async function download(url, user, extraHeaders = {}) {
    const res = await fetch(baseUrl + url, { headers: headers(user, extraHeaders) });
    if (!res.ok) return { status: res.status, data: await res.json().catch(() => null), headers: res.headers };
    return { status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: res.headers };
}
const pngBytes = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(200)]);
const secretText = Buffer.from("TOP SECRET family plans: plaintext must never appear on disk\n");
const insideText = Buffer.from("inside the family folder\n");

async function setup() {
    const auth = getAuth();
    auth.verifyIdToken = async (token) => {
        const u = USERS.find((x) => x.token === token);
        if (!u) throw new Error("invalid token");
        return { uid: u.uid, email: u.email, email_verified: true, name: u.name };
    };
    for (const u of USERS) {
        const r = await pool.query(
            "INSERT INTO users (name, email, firebase_uid) VALUES ($1, $2, $3) RETURNING id",
            [u.name, u.email, u.uid]
        );
        userIds.push(r.rows[0].id);
    }
    await new Promise((resolve) => {
        server = app.listen(0, () => {
            baseUrl = `http://localhost:${server.address().port}`;
            resolve();
        });
    });
}

async function teardown() {
    try {
        const uids = USERS.map((u) => u.uid);
        const files = await pool.query("SELECT id, storage_path FROM files WHERE owner_firebase_uid = ANY($1)", [uids]);
        for (const f of files.rows) {
            try { await fs.promises.unlink(path.resolve(env.uploadDir, f.storage_path)); } catch {}
        }
        await pool.query("DELETE FROM share_links WHERE created_by_uid = ANY($1)", [uids]);
        await pool.query("DELETE FROM files WHERE owner_firebase_uid = ANY($1)", [uids]);
        // delete folders deepest-first
        for (let i = 0; i < 10; i++) {
            await pool.query(
                `DELETE FROM folders f WHERE f.owner_firebase_uid = ANY($1)
                 AND NOT EXISTS (SELECT 1 FROM folders c WHERE c.parent_folder_id = f.id)`,
                [uids]
            );
        }
        await pool.query("DELETE FROM users WHERE id = ANY($1)", [userIds]);
        for (const u of USERS) {
            try { await fs.promises.rm(path.join(env.uploadDir, u.uid), { recursive: true, force: true }); } catch {}
        }
    } catch (err) {
        console.error("Teardown error:", err.message);
    }
    await pool.end();
    server?.close();
}

async function run() {
    await setup();

    // ------------------------------------------------------------------
    console.log("\nSETUP: owner builds Family/Photos with files");
    const family = await api("POST", "/api/folders", OWNER, { name: "Family" });
    const familyId = family.data.data.id;
    const photos = await api("POST", "/api/folders", OWNER, { name: "Photos", parent_folder_id: familyId });
    const photosId = photos.data.data.id;
    const priv = await api("POST", "/api/folders", OWNER, { name: "Private" });
    const privateId = priv.data.data.id;
    const photo = await upload(OWNER, "photo.png", pngBytes, "image/png", photosId);
    const photoId = photo.data.data.id;
    const inside = await upload(OWNER, "inside.txt", insideText, "text/plain", familyId);
    const insideId = inside.data.data.id;
    const secret = await upload(OWNER, "secret.txt", secretText, "text/plain");
    const secretId = secret.data.data.id;
    const privFile = await upload(OWNER, "private.txt", Buffer.from("private\n"), "text/plain", privateId);
    const privFileId = privFile.data.data.id;
    assert(family.status === 201 && photos.status === 201 && photo.status === 201 && secret.status === 201 && inside.status === 201 && privFile.status === 201,
        "Owner created folders and uploaded files");

    // ------------------------------------------------------------------
    console.log("\nTEST 1: Encryption at rest");
    {
        const row = (await pool.query("SELECT storage_path, is_encrypted FROM files WHERE id = $1", [secretId])).rows[0];
        const disk = await fs.promises.readFile(path.resolve(env.uploadDir, row.storage_path));
        assert(row.is_encrypted === true, "File is flagged as encrypted in the database");
        assert(disk.subarray(0, 4).toString() === "SSE1", "Stored file starts with the encryption header");
        assert(!disk.includes(Buffer.from("TOP SECRET")), "Plaintext does NOT appear in the stored file");
        assert(disk.length === secretText.length + 48, "Stored size = plaintext + 48 bytes of crypto overhead");
        const dl = await download(`/api/files/${secretId}/download`, OWNER);
        assert(dl.status === 200 && dl.body.equals(secretText), "Owner download returns the exact original bytes");
        assert(dl.headers.get("cache-control") === "private, no-store", "Download is marked no-store (not cached)");
        assert(dl.headers.get("x-content-type-options") === "nosniff", "Download has nosniff header");

        const prow = (await pool.query("SELECT storage_path FROM files WHERE id = $1", [photoId])).rows[0];
        const pdisk = await fs.promises.readFile(path.resolve(env.uploadDir, prow.storage_path));
        assert(!pdisk.includes(pngBytes.subarray(8, 40)), "Binary file content is also encrypted on disk");
    }

    console.log("\nTEST 2: Tamper detection (modified encrypted file is never delivered)");
    {
        const t = await upload(OWNER, "tamper.txt", Buffer.from("x".repeat(5000)), "text/plain");
        const row = (await pool.query("SELECT storage_path FROM files WHERE id = $1", [t.data.data.id])).rows[0];
        const p = path.resolve(env.uploadDir, row.storage_path);
        const buf = await fs.promises.readFile(p);
        buf[100] ^= 0xff;
        await fs.promises.writeFile(p, buf);
        let delivered = false;
        try {
            const res = await fetch(`${baseUrl}/api/files/${t.data.data.id}/download`, { headers: headers(OWNER) });
            const body = Buffer.from(await res.arrayBuffer());
            delivered = res.status === 200 && body.length === 5000;
        } catch {
            delivered = false;
        }
        assert(!delivered, "Tampered file download is aborted (integrity check failed)");

        // Large multi-chunk file: exact round trip, then tamper near the start
        const big = Buffer.from("ShareSync line of text 0123456789\n".repeat(100000)); // ~3.4 MB
        const b = await upload(OWNER, "big.txt", big, "text/plain");
        const bdl = await download(`/api/files/${b.data.data.id}/download`, OWNER);
        assert(bdl.status === 200 && bdl.body.equals(big), "3.4 MB encrypted file round-trips byte-for-byte");
        const brow = (await pool.query("SELECT storage_path FROM files WHERE id = $1", [b.data.data.id])).rows[0];
        const bp = path.resolve(env.uploadDir, brow.storage_path);
        const bbuf = await fs.promises.readFile(bp);
        bbuf[64] ^= 0x01;
        await fs.promises.writeFile(bp, bbuf);
        let bigDelivered = false;
        try {
            const res = await fetch(`${baseUrl}/api/files/${b.data.data.id}/download`, { headers: headers(OWNER) });
            const body = Buffer.from(await res.arrayBuffer());
            bigDelivered = body.length === big.length;
        } catch {
            bigDelivered = false;
        }
        assert(!bigDelivered, "Tampered large file is never delivered complete");
    }

    console.log("\nTEST 3: Legacy plaintext files still download");
    {
        const dir = path.join(env.uploadDir, OWNER.uid);
        await fs.promises.mkdir(dir, { recursive: true });
        await fs.promises.writeFile(path.join(dir, "legacy_plain.txt"), "legacy content\n");
        const ins = await pool.query(
            `INSERT INTO files (name, size, mime_type, storage_path, owner_id, owner_firebase_uid, is_encrypted)
             VALUES ('legacy.txt', 15, 'text/plain', $1, $2, $3, false) RETURNING id`,
            [`${OWNER.uid}/legacy_plain.txt`, userIds[0], OWNER.uid]
        );
        const dl = await download(`/api/files/${ins.rows[0].id}/download`, OWNER);
        assert(dl.status === 200 && dl.body.toString() === "legacy content\n", "Unencrypted legacy file downloads correctly");
    }

    // ------------------------------------------------------------------
    console.log("\nTEST 4: No access before sharing");
    {
        assert((await api("GET", `/api/folders/${familyId}`, BROTHER)).status === 403, "Brother cannot open Family before sharing (403)");
        assert((await download(`/api/files/${photoId}/download`, BROTHER)).status === 403, "Brother cannot download photo before sharing (403)");
        assert((await api("GET", `/api/files?folder_id=${photosId}`, STRANGER)).status === 403, "Stranger cannot list Photos (403)");
    }

    console.log("\nTEST 5: Share validation");
    let shareId;
    {
        const r = await api("POST", "/api/shares", OWNER, { resourceType: "folder", resourceId: familyId, email: BROTHER.email, permission: "viewer" });
        assert(r.status === 201, `Owner shares Family with brother by email (got ${r.status})`);
        assert(r.data.data.permission === "viewer" && r.data.data.recipientName === BROTHER.name, "Share returns recipient and permission");
        shareId = r.data.data.id;

        const upper = await api("POST", "/api/shares", OWNER, { resourceType: "folder", resourceId: familyId, email: BROTHER.email.toUpperCase() });
        assert(upper.status === 409, `Duplicate share (email in different case) rejected 409 (got ${upper.status})`);
        const self = await api("POST", "/api/shares", OWNER, { resourceType: "folder", resourceId: familyId, email: OWNER.email });
        assert(self.status === 400, `Sharing with yourself rejected 400 (got ${self.status})`);
        const unknown = await api("POST", "/api/shares", OWNER, { resourceType: "folder", resourceId: familyId, email: "nobody_" + STAMP + "@example.com" });
        assert(unknown.status === 404 && unknown.data.code === "RECIPIENT_NOT_FOUND", "Unknown email -> 404 RECIPIENT_NOT_FOUND");
        const badPerm = await api("POST", "/api/shares", OWNER, { resourceType: "folder", resourceId: familyId, email: STRANGER.email, permission: "admin" });
        assert(badPerm.status === 400, "Invalid permission rejected 400");
        const badType = await api("POST", "/api/shares", OWNER, { resourceType: "users", resourceId: 1, email: STRANGER.email });
        assert(badType.status === 400, "Invalid resource type rejected 400");
        const notMine = await api("POST", "/api/shares", STRANGER, { resourceType: "folder", resourceId: familyId, email: STRANGER.email });
        assert(notMine.status === 403, "Stranger cannot share the owner's folder (403)");
        const reshare = await api("POST", "/api/shares", BROTHER, { resourceType: "folder", resourceId: familyId, email: STRANGER.email });
        assert(reshare.status === 403, "Recipient cannot re-share someone else's folder (403)");
        const noAuth = await api("POST", "/api/shares", null, { resourceType: "folder", resourceId: familyId, email: STRANGER.email });
        assert(noAuth.status === 401, "Sharing without login rejected 401");
    }

    console.log("\nTEST 6: Brother sees it in 'Shared with me'");
    {
        const r = await api("GET", "/api/shares/with-me", BROTHER);
        const f = r.data.data.folders.find((x) => String(x.folder_id) === String(familyId));
        assert(r.status === 200 && f, "Family appears in brother's Shared with me");
        assert(f && f.permission === "viewer" && f.owner_name === OWNER.name, "Shows permission and owner name");
        assert(!r.raw.includes("storage_path"), "No storage paths leaked");
        const s = await api("GET", "/api/shares/with-me", STRANGER);
        assert(s.data.data.folders.length === 0 && s.data.data.files.length === 0, "Stranger's Shared with me is empty");
    }

    console.log("\nTEST 7: Viewer permissions (view + download only)");
    {
        const fr = await api("GET", `/api/folders/${familyId}`, BROTHER);
        assert(fr.status === 200 && fr.data.data.access === "viewer", "Brother opens Family with access=viewer");
        assert(fr.data.data.subfolders.some((x) => String(x.id) === String(photosId)), "Sees subfolder Photos");
        const sub = await api("GET", `/api/folders?parent_folder_id=${familyId}`, BROTHER);
        assert(sub.status === 200 && sub.data.data.length === 1, "Lists Family's subfolders");
        const files = await api("GET", `/api/files?folder_id=${photosId}`, BROTHER);
        assert(files.status === 200 && files.data.data.some((x) => String(x.id) === String(photoId)), "Inherited access: lists files in nested Photos");
        const meta = await api("GET", `/api/files/${photoId}`, BROTHER);
        assert(meta.status === 200 && meta.data.data.access === "viewer", "File metadata shows access=viewer");
        const dl = await download(`/api/files/${photoId}/download`, BROTHER);
        assert(dl.status === 200 && dl.body.equals(pngBytes), "Brother downloads the exact photo bytes");

        assert((await api("PATCH", `/api/files/${photoId}`, BROTHER, { name: "hacked.png" })).status === 403, "Viewer cannot rename file (403)");
        assert((await api("DELETE", `/api/files/${photoId}`, BROTHER)).status === 403, "Viewer cannot delete file (403)");
        assert((await upload(BROTHER, "evil.txt", Buffer.from("x\n"), "text/plain", familyId)).status === 403, "Viewer cannot upload into folder (403)");
        assert((await api("POST", "/api/folders", BROTHER, { name: "Sub", parent_folder_id: familyId })).status === 403, "Viewer cannot create subfolder (403)");
        assert((await api("PATCH", `/api/folders/${familyId}`, BROTHER, { name: "Renamed" })).status === 403, "Viewer cannot rename folder (403)");
        assert((await api("PATCH", `/api/files/${photoId}/move`, BROTHER, { target_folder_id: null })).status === 403, "Viewer cannot move file (403)");
        assert((await download(`/api/files/${secretId}/download`, BROTHER)).status === 403, "Brother still cannot access unshared root file (403)");
        assert((await api("GET", `/api/folders/${privateId}`, BROTHER)).status === 403, "Brother cannot open owner's other folder (403)");
        assert((await api("GET", `/api/folders/${familyId}`, STRANGER)).status === 403, "Stranger still has no access (403)");
        const brotherRoot = await api("GET", "/api/folders?parent_folder_id=root", BROTHER);
        assert(brotherRoot.data.data.length === 0, "Shared folder does not pollute brother's own root");
    }

    console.log("\nTEST 8: Owner manages access");
    {
        const acc = await api("GET", `/api/shares/resource/folder/${familyId}`, OWNER);
        assert(acc.status === 200 && acc.data.data.people.some((p) => p.email === BROTHER.email), "Owner sees brother in 'who has access'");
        assert((await api("GET", `/api/shares/resource/folder/${familyId}`, BROTHER)).status === 403, "Non-owner cannot view access list (403)");
        assert((await api("PATCH", `/api/shares/folder/${shareId}`, STRANGER, { permission: "editor" })).status === 403, "Stranger cannot change the share (403)");
        assert((await api("PATCH", `/api/shares/folder/${shareId}`, BROTHER, { permission: "editor" })).status === 403, "Recipient cannot upgrade own permission (403)");
        const up = await api("PATCH", `/api/shares/folder/${shareId}`, OWNER, { permission: "editor" });
        assert(up.status === 200 && up.data.data.permission === "editor", "Owner upgrades brother to editor");
    }

    console.log("\nTEST 9: Editor permissions");
    let brotherFileId;
    {
        const u = await upload(BROTHER, "from_brother.txt", Buffer.from("hello from brother\n"), "text/plain", familyId);
        assert(u.status === 201, `Editor uploads into shared folder (got ${u.status})`);
        brotherFileId = u.data.data.id;
        const row = (await pool.query("SELECT owner_firebase_uid, uploaded_by_uid, is_encrypted FROM files WHERE id = $1", [brotherFileId])).rows[0];
        assert(row.owner_firebase_uid === OWNER.uid && row.uploaded_by_uid === BROTHER.uid, "Upload belongs to folder owner, uploader recorded");
        assert(row.is_encrypted === true, "Editor upload is encrypted too");
        const ownerList = await api("GET", `/api/files?folder_id=${familyId}`, OWNER);
        assert(ownerList.data.data.some((f) => String(f.id) === String(brotherFileId)), "Owner sees brother's upload");
        assert((await api("PATCH", `/api/files/${insideId}`, BROTHER, { name: "inside-renamed.txt" })).status === 200, "Editor renames a file (200)");
        const sub = await api("POST", "/api/folders", BROTHER, { name: "BrotherSub", parent_folder_id: familyId });
        assert(sub.status === 201 && sub.data.data.owner_firebase_uid === OWNER.uid, "Editor creates subfolder owned by folder owner");
        assert((await api("DELETE", `/api/folders/${sub.data.data.id}`, BROTHER)).status === 200, "Editor deletes empty subfolder");
        assert((await api("DELETE", `/api/files/${brotherFileId}`, BROTHER)).status === 200, "Editor deletes a file");
        const del = await api("DELETE", `/api/folders/${photosId}`, BROTHER);
        assert(del.status === 400, "Non-empty folder still protected (400)");
        assert((await api("PATCH", `/api/files/${photoId}/move`, BROTHER, { target_folder_id: null })).status === 403, "Editor cannot move files out (owner only, 403)");
        assert((await api("POST", "/api/shares", BROTHER, { resourceType: "file", resourceId: photoId, email: STRANGER.email })).status === 403, "Editor cannot re-share (403)");
        assert((await upload(BROTHER, "x.txt", Buffer.from("x\n"), "text/plain", privateId)).status === 403, "Editor rights do not extend to other folders (403)");
    }

    console.log("\nTEST 10: Revoke");
    {
        const r = await api("DELETE", `/api/shares/folder/${shareId}`, STRANGER);
        assert(r.status === 403, "Stranger cannot revoke (403)");
        const ok = await api("DELETE", `/api/shares/folder/${shareId}`, OWNER);
        assert(ok.status === 200, "Owner revokes brother's access");
        assert((await api("GET", `/api/folders/${familyId}`, BROTHER)).status === 403, "Brother loses folder access immediately (403)");
        assert((await download(`/api/files/${photoId}/download`, BROTHER)).status === 403, "Brother loses file access too (403)");
        const w = await api("GET", "/api/shares/with-me", BROTHER);
        assert(w.data.data.folders.length === 0, "Removed from brother's Shared with me");
    }

    console.log("\nTEST 11: Single-file share");
    {
        const r = await api("POST", "/api/shares", OWNER, { resourceType: "file", resourceId: photoId, email: BROTHER.email });
        assert(r.status === 201, "Owner sends photo.png directly to brother");
        assert((await download(`/api/files/${photoId}/download`, BROTHER)).status === 200, "Brother downloads that file");
        assert((await api("GET", `/api/folders/${photosId}`, BROTHER)).status === 403, "File share does NOT open its parent folder (403)");
        assert((await download(`/api/files/${insideId}/download`, BROTHER)).status === 403, "Other files stay private (403)");
        const w = await api("GET", "/api/shares/with-me", BROTHER);
        assert(w.data.data.files.some((f) => String(f.file_id) === String(photoId)), "Photo listed in Shared with me");
    }

    // ------------------------------------------------------------------
    console.log("\nTEST 12: Public link (anyone with the link)");
    let token, linkId;
    {
        const r = await api("POST", "/api/shares/links", OWNER, { resourceType: "file", resourceId: secretId, expiresInHours: 24, permission: "editor" });
        assert(r.status === 201, `Owner creates link (got ${r.status})`);
        token = r.data.data.token;
        linkId = r.data.data.id;
        assert(/^[0-9a-f]{64}$/.test(token), "Token is 256-bit random hex");
        assert(r.data.data.path === `/s/${token}`, "Response contains app path for the link");
        assert(r.data.data.permission === "viewer", "Links are always view-only (editor request ignored)");
        const row = (await pool.query("SELECT token_hash FROM share_links WHERE id = $1", [linkId])).rows[0];
        assert(row.token_hash !== token && row.token_hash === crypto.createHash("sha256").update(token).digest("hex"), "Only the SHA-256 hash of the token is stored");

        const info = await api("GET", `/api/public/links/${token}`, null);
        assert(info.status === 200 && info.data.data.resource.name === "secret.txt", "Anonymous visitor opens link info");
        assert(!info.raw.includes("storage_path") && !info.raw.includes("token_hash") && !info.raw.includes(OWNER.uid), "Link info leaks no internal data");
        const dl = await download(`/api/public/links/${token}/download`, null);
        assert(dl.status === 200 && dl.body.equals(secretText), "Anonymous visitor downloads exact file via link");
        const other = await download(`/api/public/links/${token}/download?file_id=${photoId}`, null);
        assert(other.status === 404, "File link cannot be pointed at another file (404)");
        assert((await api("POST", `/api/public/links/${token}`, null, {})).status === 404, "No write operations exist on links (POST 404)");
        assert((await api("DELETE", `/api/public/links/${token}`, null)).status === 404, "No delete via link (404)");

        assert((await api("POST", "/api/shares/links", STRANGER, { resourceType: "file", resourceId: secretId })).status === 403, "Stranger cannot create link for owner's file (403)");
        assert((await api("POST", "/api/shares/links", OWNER, { resourceType: "file", resourceId: secretId, expiresInHours: 0 })).status === 400, "Expiry 0 rejected (400)");
        assert((await api("POST", "/api/shares/links", OWNER, { resourceType: "file", resourceId: secretId, expiresInHours: 999999 })).status === 400, "Expiry > 1 year rejected (400)");
        assert((await api("POST", "/api/shares/links", OWNER, { resourceType: "file", resourceId: secretId, password: "ab" })).status === 400, "Too-short password rejected (400)");
        assert((await api("GET", "/api/public/links/not-a-token", null)).status === 400, "Malformed token rejected (400)");
        assert((await api("GET", `/api/public/links/${"0".repeat(64)}`, null)).status === 404, "Unknown token rejected (404)");
    }

    console.log("\nTEST 13: Password-protected link");
    {
        const r = await api("POST", "/api/shares/links", OWNER, { resourceType: "file", resourceId: secretId, password: "family123" });
        const t = r.data.data.token;
        assert(r.status === 201 && r.data.data.hasPassword === true, "Owner creates password link");
        const row = (await pool.query("SELECT password_hash FROM share_links WHERE id = $1", [r.data.data.id])).rows[0];
        assert(row.password_hash.startsWith("scrypt$") && !row.password_hash.includes("family123"), "Password stored as scrypt hash only");
        const none = await api("GET", `/api/public/links/${t}`, null);
        assert(none.status === 401 && none.data.code === "PASSWORD_REQUIRED", "No password -> 401 PASSWORD_REQUIRED");
        assert(!none.raw.includes("secret.txt"), "File name hidden until password is given");
        const wrong = await api("GET", `/api/public/links/${t}`, null, undefined, { "X-Share-Password": "wrong" });
        assert(wrong.status === 403 && wrong.data.code === "PASSWORD_INCORRECT", "Wrong password -> 403 PASSWORD_INCORRECT");
        const right = await api("GET", `/api/public/links/${t}`, null, undefined, { "X-Share-Password": "family123" });
        assert(right.status === 200, "Correct password opens link");
        const dlNo = await download(`/api/public/links/${t}/download`, null);
        assert(dlNo.status === 401, "Download without password blocked (401)");
        const dl = await download(`/api/public/links/${t}/download`, null, { "X-Share-Password": "family123" });
        assert(dl.status === 200 && dl.body.equals(secretText), "Download with password works");
    }

    console.log("\nTEST 14: Sign-in-required link");
    {
        const r = await api("POST", "/api/shares/links", OWNER, { resourceType: "file", resourceId: secretId, requireSignIn: true });
        const t = r.data.data.token;
        assert(r.data.data.isAnonymousAllowed === false, "Link requires sign-in");
        const anon = await api("GET", `/api/public/links/${t}`, null);
        assert(anon.status === 401 && anon.data.code === "SIGN_IN_REQUIRED", "Anonymous -> 401 SIGN_IN_REQUIRED");
        assert((await api("GET", `/api/public/links/${t}`, BROTHER)).status === 200, "Signed-in user opens it");
        const bad = await fetch(`${baseUrl}/api/public/links/${t}`, { headers: { Authorization: "Bearer forged" } });
        assert(bad.status === 401, "Forged login token is rejected, not treated as anonymous (401)");
    }

    console.log("\nTEST 15: Folder link stays inside the shared folder");
    {
        const r = await api("POST", "/api/shares/links", OWNER, { resourceType: "folder", resourceId: familyId });
        const t = r.data.data.token;
        const root = await api("GET", `/api/public/links/${t}/contents`, null);
        assert(root.status === 200 && root.data.data.folder.is_link_root === true, "Anonymous visitor lists shared folder");
        assert(root.data.data.folder.parent_folder_id === null, "Parent outside the share is hidden");
        assert(root.data.data.subfolders.some((f) => String(f.id) === String(photosId)), "Sees subfolder");
        const sub = await api("GET", `/api/public/links/${t}/contents?folder_id=${photosId}`, null);
        assert(sub.status === 200 && sub.data.data.files.some((f) => String(f.id) === String(photoId)), "Browses into nested subfolder");
        const outside = await api("GET", `/api/public/links/${t}/contents?folder_id=${privateId}`, null);
        assert(outside.status === 404, "Cannot browse a folder outside the shared tree (404)");
        const dl = await download(`/api/public/links/${t}/download?file_id=${photoId}`, null);
        assert(dl.status === 200 && dl.body.equals(pngBytes), "Downloads file inside the shared tree");
        assert((await download(`/api/public/links/${t}/download?file_id=${secretId}`, null)).status === 404, "Root file outside the tree blocked (404)");
        assert((await download(`/api/public/links/${t}/download?file_id=${privFileId}`, null)).status === 404, "File in another folder blocked (404)");
        assert((await download(`/api/public/links/${t}/download`, null)).status === 400, "Folder link download needs file_id (400)");
    }

    console.log("\nTEST 16: Revoked and expired links");
    {
        assert((await api("DELETE", `/api/shares/links/${linkId}`, STRANGER)).status === 403, "Stranger cannot revoke link (403)");
        assert((await api("DELETE", `/api/shares/links/${linkId}`, OWNER)).status === 200, "Owner revokes link");
        assert((await api("GET", `/api/public/links/${token}`, null)).status === 410, "Revoked link -> 410 Gone");
        assert((await download(`/api/public/links/${token}/download`, null)).status === 410, "Revoked link cannot download (410)");

        const e = await api("POST", "/api/shares/links", OWNER, { resourceType: "file", resourceId: secretId, expiresInHours: 1 });
        await pool.query("UPDATE share_links SET expires_at = NOW() - INTERVAL '1 minute' WHERE id = $1", [e.data.data.id]);
        assert((await api("GET", `/api/public/links/${e.data.data.token}`, null)).status === 410, "Expired link -> 410 Gone");
    }

    console.log("\nTEST 17: Shared-by-me and access list never expose secrets");
    {
        const byMe = await api("GET", "/api/shares/by-me", OWNER);
        assert(byMe.status === 200 && byMe.data.data.links.length >= 4, "Owner sees their links");
        assert(byMe.data.data.links.some((l) => l.has_password === true), "Shows which links have a password");
        assert(!byMe.raw.includes("token_hash") && !byMe.raw.includes("password_hash") && !byMe.raw.includes("scrypt$"), "No token or password hashes in response");
        const acc = await api("GET", `/api/shares/resource/file/${secretId}`, OWNER);
        assert(acc.status === 200 && acc.data.data.links.length >= 4, "Access list includes links");
        assert(!acc.raw.includes("token_hash") && !acc.raw.includes("password_hash"), "Access list has no hashes");
        assert(acc.data.data.links.some((l) => l.is_active === false) && acc.data.data.links.some((l) => l.is_expired === true), "Access list shows revoked and expired state");
    }

    console.log("\nTEST 18: Log redaction and cascade cleanup");
    {
        const logged = redactUrl(`/api/public/links/${"a1".repeat(32)}/download`);
        assert(!logged.includes("a1".repeat(32)) && logged.includes("[redacted]"), "Share tokens are redacted from request logs");
        assert((await api("DELETE", `/api/files/${photoId}`, OWNER)).status === 200, "Owner deletes shared photo");
        const s = await pool.query("SELECT COUNT(*)::int c FROM file_shares WHERE file_id = $1", [photoId]);
        assert(s.rows[0].c === 0, "Its shares are removed automatically");
        assert((await download(`/api/files/${photoId}/download`, BROTHER)).status === 404, "Brother gets 404 for the deleted file");
    }

    console.log("\nTEST 18b: Web app CORS for share links");
    {
        const pre = await fetch(`${baseUrl}/api/public/links/${"a".repeat(64)}`, {
            method: "OPTIONS",
            headers: {
                Origin: "http://localhost:8081",
                "Access-Control-Request-Method": "GET",
                "Access-Control-Request-Headers": "authorization,x-share-password"
            }
        });
        const allowHeaders = (pre.headers.get("access-control-allow-headers") || "").toLowerCase();
        assert(pre.status === 204 && allowHeaders.includes("x-share-password"), "Preflight allows the X-Share-Password header");
        assert((pre.headers.get("access-control-expose-headers") || "").includes("Content-Disposition"), "Download filename header is readable by the web app");
        const evil = await fetch(`${baseUrl}/api/public/links/${"a".repeat(64)}`, { headers: { Origin: "https://evil.example" } });
        assert(evil.status === 403, "Unknown website cannot call link API from a browser (403)");
    }

    console.log("\nTEST 19: Brute-force protection on links (runs last)");
    {
        process.env.TEST_RATE_LIMITS = "1";
        const r = await api("POST", "/api/shares/links", OWNER, { resourceType: "file", resourceId: secretId, password: "correct-horse" });
        const t = r.data.data.token;
        const codes = [];
        for (let i = 0; i < 12; i++) {
            codes.push((await api("GET", `/api/public/links/${t}`, null, undefined, { "X-Share-Password": "guess" + i })).status);
        }
        assert(codes.slice(0, 10).every((c) => c === 403), "First 10 wrong guesses are rejected normally");
        assert(codes.slice(10).every((c) => c === 429), "After 10 failures the IP is blocked (429)");
        const right = await api("GET", `/api/public/links/${t}`, null, undefined, { "X-Share-Password": "correct-horse" });
        assert(right.status === 429, "Even the right password is blocked while locked out");
        delete process.env.TEST_RATE_LIMITS;
    }
}

run()
    .catch((err) => {
        console.error("Test run crashed:", err);
        failed++;
    })
    .finally(async () => {
        await teardown();
        console.log(`\nSHARING API TESTS: ${passed} passed, ${failed} failed`);
        process.exit(failed > 0 ? 1 : 0);
    });
