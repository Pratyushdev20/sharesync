/**
 * End-to-end tests for Features D–H:
 * real-time sync, change feed / offline catch-up, devices, conflict detection, notes,
 * notifications, activity log, health checks, validation, security, S3 storage driver,
 * account deletion and migrations on a fresh database.
 *
 * Run: NODE_ENV=test node test_phase_dh.mjs
 */
import http from "http";
import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { io as ioClient } from "socket.io-client";
import { getAuth } from "firebase-admin/auth";
import app from "./src/app.js";
import pool from "./src/config/db.js";
import env from "./src/config/env.js";
import { initRealtime, closeRealtime } from "./src/realtime/socket.js";
import { StorageService, S3Driver, LocalDriver } from "./src/services/storage.service.js";
import log from "./src/utils/log.js";
import { pruneSyncEvents } from "./src/services/events.service.js";

const STAMP = Date.now();
const mk = (key, name) => ({
    uid: `test_dh_${key}_${STAMP}`,
    name,
    email: `dh_${key}_${STAMP}@example.com`,
    token: `token_dh_${key}_${STAMP}`,
});
const OWNER = mk("owner", "Owner Pratyush");
const BROTHER = mk("brother", "Brother Rahul");
const STRANGER = mk("stranger", "Stranger Eve");
const DOOMED = mk("doomed", "Doomed Dan");
const USERS = [OWNER, BROTHER, STRANGER, DOOMED];
const SHORT_TOKEN = `token_dh_short_${STAMP}`;

let server, baseUrl;
const userIds = {};
const sockets = [];

let passed = 0;
let failed = 0;
function assert(condition, message) {
    if (condition) { console.log(`  ✅ PASS: ${message}`); passed++; }
    else { console.error(`  ❌ FAIL: ${message}`); failed++; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- helpers
function headers(user, extra = {}) {
    const h = { ...extra };
    if (user) h.Authorization = `Bearer ${user.token}`;
    return h;
}
async function api(method, url, user, body, extraHeaders = {}) {
    const opts = { method, headers: headers(user, extraHeaders) };
    if (body !== undefined) {
        opts.headers["Content-Type"] = "application/json";
        opts.body = typeof body === "string" ? body : JSON.stringify(body);
    }
    const res = await fetch(baseUrl + url, opts);
    const text = await res.text();
    let data;
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
async function replaceContent(user, fileId, buffer, mime, expectedVersion) {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: mime }), "x.txt");
    if (expectedVersion !== undefined) form.append("expected_version", String(expectedVersion));
    const res = await fetch(`${baseUrl}/api/files/${fileId}/content`, { method: "PUT", headers: headers(user), body: form });
    return { status: res.status, data: await res.json() };
}
async function download(url, user) {
    const res = await fetch(baseUrl + url, { headers: headers(user) });
    if (!res.ok) return { status: res.status };
    return { status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: res.headers };
}

/** Connects a "device" and records every event it receives. */
function connectDevice(token, deviceId = `dev_${Math.random().toString(36).slice(2, 12)}`) {
    return new Promise((resolve) => {
        const socket = ioClient(baseUrl, {
            path: "/socket.io",
            auth: { token, deviceId, platform: "web" },
            transports: ["websocket"],
            reconnection: false,
            timeout: 5000,
        });
        const device = { socket, events: [], notifications: [], readEvents: [], connected: false, error: null, deviceId, expired: false };
        socket.on("sync:event", (e) => device.events.push(e));
        socket.on("notification:new", (n) => device.notifications.push(n));
        socket.on("notification:read", (n) => device.readEvents.push(n));
        socket.on("auth:expired", () => { device.expired = true; });
        socket.on("connect", () => { device.connected = true; resolve(device); });
        socket.on("connect_error", (err) => { device.error = err.message; resolve(device); });
        sockets.push(socket);
    });
}
async function waitFor(fn, ms = 3000) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
        if (fn()) return true;
        await sleep(25);
    }
    return fn();
}

// ---------------------------------------------------------------- setup / teardown
async function setup() {
    const auth = getAuth();
    auth.verifyIdToken = async (token) => {
        if (token === SHORT_TOKEN) {
            return { uid: OWNER.uid, email: OWNER.email, email_verified: true, exp: Math.floor(Date.now() / 1000) + 2 };
        }
        const u = USERS.find((x) => x.token === token);
        if (!u) throw new Error("invalid token");
        return { uid: u.uid, email: u.email, email_verified: true, name: u.name, exp: Math.floor(Date.now() / 1000) + 3600 };
    };
    for (const u of USERS) {
        const r = await pool.query("INSERT INTO users (name, email, firebase_uid) VALUES ($1, $2, $3) RETURNING id", [u.name, u.email, u.uid]);
        userIds[u.uid] = r.rows[0].id;
    }
    server = http.createServer(app);
    initRealtime(server);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${server.address().port}`;
}

async function teardown() {
    for (const s of sockets) s.close();
    try {
        const uids = USERS.map((u) => u.uid);
        const files = await pool.query("SELECT storage_path FROM files WHERE owner_firebase_uid = ANY($1)", [uids]);
        for (const f of files.rows) {
            try { await fs.promises.unlink(path.resolve(env.uploadDir, f.storage_path)); } catch {}
        }
        await pool.query("DELETE FROM notes WHERE owner_firebase_uid = ANY($1)", [uids]);
        await pool.query("DELETE FROM share_links WHERE created_by_uid = ANY($1)", [uids]);
        await pool.query("DELETE FROM files WHERE owner_firebase_uid = ANY($1)", [uids]);
        for (let i = 0; i < 10; i++) {
            await pool.query(
                `DELETE FROM folders f WHERE f.owner_firebase_uid = ANY($1)
                 AND NOT EXISTS (SELECT 1 FROM folders c WHERE c.parent_folder_id = f.id)`, [uids]);
        }
        for (const t of ["notifications", "sync_events", "sync_devices", "push_tokens"]) {
            await pool.query(`DELETE FROM ${t} WHERE user_uid = ANY($1)`, [uids]);
        }
        await pool.query("DELETE FROM activity_log WHERE actor_uid = ANY($1) OR owner_uid = ANY($1)", [uids]);
        await pool.query("DELETE FROM users WHERE firebase_uid = ANY($1)", [uids]);
        for (const u of USERS) {
            await fs.promises.rm(path.join(env.uploadDir, u.uid), { recursive: true, force: true }).catch(() => {});
        }
    } catch (err) {
        console.error("Teardown error:", err.message);
    }
    await closeRealtime();
    await pool.end();
    server?.close();
}

// ---------------------------------------------------------------- tests
async function run() {
    await setup();

    console.log("\nTEST 1: Health, request ids, error format");
    {
        const live = await api("GET", "/api/health", null);
        assert(live.status === 200 && live.data.success === true, "Liveness probe returns success:true");
        const ready = await api("GET", "/api/health/ready", null);
        assert(ready.status === 200 && ready.data.data.status === "ready", "Readiness probe reports ready");
        assert(ready.data.data.checks.database.ok && ready.data.data.checks.storage.ok && ready.data.data.checks.encryptionKey.ok && ready.data.data.checks.migrations.ok,
            "Readiness checks database, migrations, storage and encryption key");
        assert(ready.data.data.checks.realtime.ok === true, "Readiness reports real-time channel running");
        assert(!ready.raw.includes(process.env.DB_PASSWORD || "#nopw#") && !ready.raw.includes(process.env.DB_HOST || "#nohost#"),
            "Readiness exposes no credentials or hostnames");
        assert(/^[0-9a-f-]{36}$/.test(live.headers.get("x-request-id") || ""), "Every response carries an X-Request-Id");
        const notFound = await api("GET", "/api/does-not-exist", OWNER);
        assert(notFound.status === 404 && notFound.data.code === "NOT_FOUND" && notFound.data.requestId, "Unknown route -> JSON 404 with code and requestId");
        const bad = await api("POST", "/api/notes", OWNER, "{not json");
        assert(bad.status === 400 && bad.data.message === "Request body is not valid JSON", "Malformed JSON -> 400 with safe message");
        const boom = await api("GET", "/error", null);
        assert(boom.status === 500 && boom.data.message === "Internal server error" && !boom.raw.includes("stack"), "500 errors hide internals");
    }

    console.log("\nTEST 2: Authentication on every new endpoint");
    {
        for (const [m, u] of [["GET", "/api/notes"], ["GET", "/api/notifications"], ["GET", "/api/sync/changes"], ["GET", "/api/sync/devices"], ["GET", "/api/sync/activity"]]) {
            const noAuth = await api(m, u, null);
            const badAuth = await fetch(baseUrl + u, { headers: { Authorization: "Bearer forged.token.value" } });
            assert(noAuth.status === 401 && badAuth.status === 401, `${m} ${u} requires a valid Firebase token (401)`);
        }
        const dev = await connectDevice("forged-token-123");
        assert(!dev.connected && dev.error === "UNAUTHORIZED", "Real-time connection with invalid token is refused");
        const none = await connectDevice("");
        assert(!none.connected, "Real-time connection without token is refused");
    }

    console.log("\nTEST 3: Real-time sync across devices");
    const laptop = await connectDevice(OWNER.token, `laptop_${STAMP}`);
    const phone = await connectDevice(OWNER.token, `phone_${STAMP}`);
    const brotherPhone = await connectDevice(BROTHER.token, `bro_${STAMP}`);
    const strangerPc = await connectDevice(STRANGER.token, `eve_${STAMP}`);
    assert(laptop.connected && phone.connected && brotherPhone.connected && strangerPc.connected, "Four devices connected with valid tokens");

    const cursor0 = (await api("GET", "/api/sync/cursor", OWNER)).data.data.cursor;
    const fam = await api("POST", "/api/folders", OWNER, { name: "Family" });
    const familyId = String(fam.data.data.id);
    assert(fam.data.data.version === 1, "New folder starts at version 1");
    assert(await waitFor(() => phone.events.some((e) => e.type === "folder.created" && e.resourceId === familyId)),
        "Folder created on laptop appears on phone instantly");
    assert(laptop.events.some((e) => e.type === "folder.created"), "Originating device receives the event too (multi-tab)");
    await sleep(150);
    assert(!brotherPhone.events.some((e) => e.resourceId === familyId) && !strangerPc.events.some((e) => e.resourceId === familyId),
        "Users without access receive nothing");

    const up = await upload(OWNER, "plan.txt", Buffer.from("v1 of the plan\n"), "text/plain", familyId);
    const planId = String(up.data.data.id);
    assert(up.status === 201 && up.data.data.version === 1, "Upload returns version 1");
    assert(await waitFor(() => phone.events.some((e) => e.type === "file.created" && e.resourceId === planId && e.folderId === familyId)),
        "File upload pushed to other device with its folder id");

    console.log("\nTEST 4: Sharing pushes events + notifications to the recipient");
    const share = await api("POST", "/api/shares", OWNER, { resourceType: "folder", resourceId: familyId, email: BROTHER.email, permission: "viewer" });
    const shareId = String(share.data.data.id);
    assert(share.status === 201, "Owner shares Family with brother");
    assert(await waitFor(() => brotherPhone.events.some((e) => e.type === "share.created" && e.resourceId === familyId)),
        "Brother's device gets share.created in real time (Shared tab refreshes)");
    assert(await waitFor(() => brotherPhone.notifications.some((n) => n.type === "share.created")), "Brother gets a real-time notification");
    const bn = brotherPhone.notifications.find((n) => n.type === "share.created");
    assert(bn && bn.title.includes(OWNER.name) && bn.body.includes("Family") && bn.read === false, "Notification names who shared what, unread");

    await api("PATCH", `/api/files/${planId}`, OWNER, { name: "plan-final.txt" });
    assert(await waitFor(() => brotherPhone.events.some((e) => e.type === "file.updated" && e.resourceId === planId)),
        "After sharing, brother receives changes inside the shared folder");
    assert(!strangerPc.events.some((e) => e.resourceId === planId), "Stranger still receives nothing");

    console.log("\nTEST 5: Offline catch-up via change feed");
    {
        phone.socket.close(); // phone goes offline
        await api("POST", "/api/folders", OWNER, { name: "Trips", parent_folder_id: familyId });
        await upload(OWNER, "offline1.txt", Buffer.from("made while phone offline\n"), "text/plain", familyId);
        const feed = await api("GET", `/api/sync/changes?since=${cursor0}`, OWNER);
        const types = feed.data.data.events.map((e) => e.type);
        assert(feed.status === 200 && types.includes("folder.created") && types.includes("file.created") && types.includes("file.updated"),
            "Reconnecting device fetches everything it missed since its cursor");
        const ids = feed.data.data.events.map((e) => BigInt(e.id));
        assert(ids.every((v, i) => i === 0 || v > ids[i - 1]), "Events come back in order");
        assert(BigInt(feed.data.data.cursor) === ids[ids.length - 1], "Response returns the new cursor");
        const page = await api("GET", `/api/sync/changes?since=${cursor0}&limit=2`, OWNER);
        assert(page.data.data.events.length === 2 && page.data.data.hasMore === true, "Change feed paginates (hasMore)");
        const latest = await api("GET", `/api/sync/changes?since=${feed.data.data.cursor}`, OWNER);
        assert(latest.data.data.events.length === 0, "Nothing new after the latest cursor");
        const strangerFeed = await api("GET", `/api/sync/changes?since=${cursor0}`, STRANGER);
        assert(strangerFeed.data.data.events.every((e) => e.resourceId !== familyId && e.resourceId !== planId), "Change feed is per-user (no leaks)");
        const badCursor = await api("GET", "/api/sync/changes?since=abc", OWNER);
        assert(badCursor.status === 400 && badCursor.data.code === "VALIDATION_ERROR", "Invalid cursor rejected (400)");
        // Simulate retention: an event older than the retention window gets pruned
        const old = await pool.query(
            `INSERT INTO sync_events (user_uid, event_type, resource_type, created_at)
             VALUES ($1, 'file.created', 'file', NOW() - INTERVAL '400 days') RETURNING id::text`, [DOOMED.uid]);
        const pruned = await pruneSyncEvents({ olderThanDays: 365 });
        assert(pruned >= 1, "Retention pruning removes old change-feed entries");
        const staleCursor = String(BigInt(old.rows[0].id) - 1n);
        const ancient = await api("GET", `/api/sync/changes?since=${staleCursor}`, DOOMED);
        assert(ancient.data.data.reset === true, "Cursor older than retained history -> reset:true (full reload)");
        await api("POST", "/api/folders", OWNER, { name: "AfterPrune", parent_folder_id: familyId });
        const recentCursor = (await api("GET", "/api/sync/cursor", OWNER)).data.data.cursor;
        const fresh = await api("GET", `/api/sync/changes?since=${recentCursor}`, OWNER);
        assert(fresh.data.data.reset === false, "Cursors newer than the prune watermark are not reset");
    }

    console.log("\nTEST 6: Devices");
    {
        const reg = await api("POST", "/api/sync/devices", OWNER, { deviceId: `phone_${STAMP}`, platform: "android", deviceName: "Pixel" });
        assert(reg.status === 200 && reg.data.data.device_name === "Pixel", "Device registers with name/platform");
        const list = await api("GET", "/api/sync/devices", OWNER);
        assert(list.data.data.length >= 2 && list.data.data.some((d) => d.device_id === `laptop_${STAMP}`), "Socket connections are tracked as devices");
        assert((await api("DELETE", `/api/sync/devices/laptop_${STAMP}`, STRANGER)).status === 404, "Cannot remove another user's device (404)");
        assert((await api("POST", "/api/sync/devices", OWNER, { deviceId: "../../etc" })).status === 400, "Malicious device id rejected (400)");
        assert((await api("DELETE", `/api/sync/devices/phone_${STAMP}`, OWNER)).status === 200, "Owner removes own device");
    }

    console.log("\nTEST 7: Token expiry closes real-time connection");
    {
        const shortDev = await connectDevice(SHORT_TOKEN);
        assert(shortDev.connected, "Device connects with short-lived token");
        assert(await waitFor(() => shortDev.expired && !shortDev.socket.connected, 5000), "Socket is closed when the ID token expires");
    }

    console.log("\nTEST 8: File conflict detection (multi-device edits)");
    {
        const stale = await api("PATCH", `/api/files/${planId}`, OWNER, { name: "plan-from-phone.txt", expected_version: 1 });
        assert(stale.status === 409 && stale.data.code === "CONFLICT" && stale.data.details.currentVersion === 2,
            "Rename based on an old version -> 409 CONFLICT with current version");
        const ok = await api("PATCH", `/api/files/${planId}`, OWNER, { name: "plan-v3.txt", expected_version: 2 });
        assert(ok.status === 200 && ok.data.data.version === 3, "Rename with the current version succeeds (version 3)");

        const oldPath = (await pool.query("SELECT storage_path FROM files WHERE id = $1", [planId])).rows[0].storage_path;
        const newContent = Buffer.from("v2 of the plan, edited on laptop\n");
        const rep = await replaceContent(OWNER, planId, newContent, "text/plain", 3);
        assert(rep.status === 200 && rep.data.data.version === 4, "Upload new version -> version 4");
        const dl = await download(`/api/files/${planId}/download`, OWNER);
        assert(dl.status === 200 && dl.body.equals(newContent) && dl.headers.get("x-file-version") === "4", "Download returns new content and X-File-Version");
        assert(!fs.existsSync(path.resolve(env.uploadDir, oldPath)), "Previous stored version removed");
        const conflict = await replaceContent(OWNER, planId, Buffer.from("phone edit\n"), "text/plain", 3);
        assert(conflict.status === 409 && conflict.data.code === "CONFLICT", "Second device uploading over a newer version -> 409");
        const still = await download(`/api/files/${planId}/download`, OWNER);
        assert(still.body.equals(newContent), "Conflicting upload did not overwrite data");
        assert((await replaceContent(BROTHER, planId, Buffer.from("x\n"), "text/plain", 4)).status === 403, "Viewer cannot upload a new version (403)");
        assert((await replaceContent(STRANGER, planId, Buffer.from("x\n"), "text/plain", 4)).status === 403, "Stranger cannot upload a new version (403)");
        const delStale = await api("DELETE", `/api/files/${planId}?expected_version=1`, OWNER);
        assert(delStale.status === 409, "Delete based on old version -> 409");
        const folderStale = await api("PATCH", `/api/folders/${familyId}`, OWNER, { name: "Fam", expected_version: 99 });
        assert(folderStale.status === 409 && folderStale.data.code === "CONFLICT", "Folder rename conflict detected");
    }

    console.log("\nTEST 9: Notes CRUD and validation");
    let noteId;
    {
        const c = await api("POST", "/api/notes", OWNER, { title: "  Shopping list  ", content: "milk\neggs" });
        assert(c.status === 201 && c.data.data.title === "Shopping list" && c.data.data.version === 1 && c.data.data.access === "owner", "Create note (title trimmed, version 1)");
        noteId = c.data.data.id;
        const g = await api("GET", `/api/notes/${noteId}`, OWNER);
        assert(g.status === 200 && g.data.data.content === "milk\neggs", "Read note");
        const u = await api("PATCH", `/api/notes/${noteId}`, OWNER, { content: "milk\neggs\nbread", expected_version: 1 });
        assert(u.status === 200 && u.data.data.version === 2, "Edit note -> version 2");
        const list = await api("GET", "/api/notes", OWNER);
        assert(list.data.data.some((n) => n.id === noteId && n.preview.startsWith("milk") && n.content === undefined), "List returns previews, not full content");
        const search = await api("GET", "/api/notes?q=bread", OWNER);
        assert(search.data.data.length === 1 && search.data.data[0].id === noteId, "Search finds note by content");
        const doc = await api("POST", "/api/notes", OWNER, { title: "Trip plan", kind: "document", content: "# Day 1", folder_id: familyId });
        assert(doc.status === 201 && doc.data.data.kind === "document" && doc.data.data.folder_id === familyId, "Create document inside a folder");
        const inFolder = await api("GET", `/api/notes?folder_id=${familyId}`, OWNER);
        assert(inFolder.data.data.length === 1 && inFolder.data.data[0].title === "Trip plan", "List notes of a folder");
        const rootOnly = await api("GET", "/api/notes?folder_id=root", OWNER);
        assert(rootOnly.data.data.every((n) => n.folder_id === null), "List root notes only");

        assert((await api("POST", "/api/notes", OWNER, { title: "   " })).status === 400, "Empty title rejected (400)");
        assert((await api("POST", "/api/notes", OWNER, { title: "x", owner_firebase_uid: BROTHER.uid })).status === 400, "Unknown/forbidden fields rejected (400, no mass assignment)");
        assert((await api("POST", "/api/notes", OWNER, { title: "x", kind: "spreadsheet" })).status === 400, "Invalid kind rejected (400)");
        assert((await api("PATCH", `/api/notes/${noteId}`, OWNER, { content: "no version" })).status === 400, "Update without expected_version rejected (400)");
        const big = await api("POST", "/api/notes", OWNER, { title: "big", content: "a".repeat(600_000) });
        assert(big.status === 400 || big.status === 413, "Oversized note rejected");
        const ctl = await api("POST", "/api/notes", OWNER, { title: "ctl\u0000\u0007name", content: "a\u0000b" });
        assert(ctl.status === 201 && ctl.data.data.title === "ctlname", "Control characters stripped from input");
        assert((await api("POST", "/api/notes", OWNER, { title: "x", folder_id: "999999999" })).status === 404, "Note in non-existent folder -> 404");
        assert((await api("GET", "/api/notes/abc", OWNER)).status === 400, "Invalid note id -> 400");
    }

    console.log("\nTEST 10: Note conflicts across devices");
    {
        const phoneEdit = await api("PATCH", `/api/notes/${noteId}`, OWNER, { content: "phone version", expected_version: 2 });
        assert(phoneEdit.status === 200 && phoneEdit.data.data.version === 3, "Phone saves first (version 3)");
        const laptopEdit = await api("PATCH", `/api/notes/${noteId}`, OWNER, { content: "laptop version", expected_version: 2 });
        assert(laptopEdit.status === 409 && laptopEdit.data.code === "CONFLICT", "Laptop saving an older version -> 409 CONFLICT");
        assert(laptopEdit.data.details?.current?.content === "phone version" && laptopEdit.data.details.current.version === 3,
            "Conflict response includes the latest server copy for resolution");
        const resolved = await api("PATCH", `/api/notes/${noteId}`, OWNER, { content: "merged version", expected_version: 3 });
        assert(resolved.status === 200 && resolved.data.data.version === 4, "Client resolves conflict and saves (version 4)");
        assert(await waitFor(() => laptop.events.some((e) => e.type === "note.updated" && e.resourceId === noteId && e.payload.version === 4)),
            "Note changes sync to other devices in real time");
        assert((await api("DELETE", `/api/notes/${noteId}?expected_version=2`, OWNER)).status === 409, "Deleting a stale note -> 409");
    }

    console.log("\nTEST 11: Note permissions (IDOR, viewer, editor)");
    let familyNoteId;
    {
        familyNoteId = (await api("GET", `/api/notes?folder_id=${familyId}`, OWNER)).data.data[0].id;
        assert((await api("GET", `/api/notes/${noteId}`, BROTHER)).status === 403, "Root note is private: brother cannot read it by id (IDOR 403)");
        assert((await api("GET", `/api/notes/${noteId}`, STRANGER)).status === 403, "Stranger cannot read note by id (403)");
        assert((await api("PATCH", `/api/notes/${noteId}`, STRANGER, { content: "hacked", expected_version: 4 })).status === 403, "Stranger cannot edit (403)");
        assert((await api("DELETE", `/api/notes/${noteId}`, STRANGER)).status === 403, "Stranger cannot delete (403)");
        const bl = await api("GET", "/api/notes", BROTHER);
        assert(bl.data.data.length === 0, "Brother's own notes list does not include owner's notes");
        const view = await api("GET", `/api/notes/${familyNoteId}`, BROTHER);
        assert(view.status === 200 && view.data.data.access === "viewer", "Viewer reads note in shared folder");
        assert((await api("GET", `/api/notes?folder_id=${familyId}`, BROTHER)).data.data.length === 1, "Viewer lists notes in shared folder");
        assert((await api("PATCH", `/api/notes/${familyNoteId}`, BROTHER, { content: "x", expected_version: 1 })).status === 403, "Viewer cannot edit (403)");
        assert((await api("POST", "/api/notes", BROTHER, { title: "x", folder_id: familyId })).status === 403, "Viewer cannot create notes in shared folder (403)");
        assert((await api("GET", `/api/notes?folder_id=${familyId}`, STRANGER)).status === 403, "Stranger cannot list folder notes (403)");

        await api("PATCH", `/api/shares/folder/${shareId}`, OWNER, { permission: "editor" });
        assert(await waitFor(() => brotherPhone.notifications.some((n) => n.type === "share.updated")), "Brother notified of permission change");
        const ed = await api("PATCH", `/api/notes/${familyNoteId}`, BROTHER, { content: "# Day 1\nBeach", expected_version: 1 });
        assert(ed.status === 200 && ed.data.data.access === "editor", "Editor edits note in shared folder");
        const bnote = await api("POST", "/api/notes", BROTHER, { title: "Brother idea", folder_id: familyId });
        assert(bnote.status === 201, "Editor creates note in shared folder");
        const row = (await pool.query("SELECT owner_firebase_uid, created_by_uid FROM notes WHERE id = $1", [bnote.data.data.id])).rows[0];
        assert(row.owner_firebase_uid === OWNER.uid && row.created_by_uid === BROTHER.uid, "Note owned by folder owner, creator recorded");
        assert(await waitFor(() => laptop.notifications.some((n) => n.type === "note.created")), "Owner notified when brother adds a note");
        assert((await api("PATCH", `/api/notes/${familyNoteId}`, BROTHER, { folder_id: null, expected_version: 2 })).status === 403,
            "Editor cannot move a note out of the shared folder (403)");
        const del = await api("DELETE", `/api/folders/${familyId}`, OWNER);
        assert(del.status === 400, "Folder with notes cannot be deleted (400)");
    }

    console.log("\nTEST 12: Notifications API");
    {
        await upload(BROTHER, "brother-upload.txt", Buffer.from("from brother\n"), "text/plain", familyId);
        assert(await waitFor(() => laptop.notifications.some((n) => n.type === "file.created" && n.title.includes(BROTHER.name))),
            "Owner notified when brother uploads into shared folder");
        const list = await api("GET", "/api/notifications", BROTHER);
        assert(list.status === 200 && list.data.data.notifications.length >= 2 && list.data.data.unreadCount >= 2, "Notification history with unread count");
        const first = list.data.data.notifications[0];
        assert(!list.raw.includes("user_uid") && !list.raw.includes("actor_uid"), "Notification payload exposes no internal user ids");
        const count = await api("GET", "/api/notifications/unread-count", BROTHER);
        assert(count.data.data.unreadCount === list.data.data.unreadCount, "Unread count endpoint matches");
        assert((await api("PATCH", `/api/notifications/${first.id}/read`, STRANGER, {})).status === 404, "Cannot mark someone else's notification (404, no IDOR)");
        assert((await api("DELETE", `/api/notifications/${first.id}`, STRANGER)).status === 404, "Cannot delete someone else's notification (404)");
        const mr = await api("PATCH", `/api/notifications/${first.id}/read`, BROTHER, {});
        assert(mr.status === 200 && mr.data.data.notification.read === true && mr.data.data.unreadCount === count.data.data.unreadCount - 1, "Mark one as read");
        assert(await waitFor(() => brotherPhone.readEvents.some((e) => e.ids?.includes(first.id))), "Read state syncs to other devices");
        const unreadOnly = await api("GET", "/api/notifications?unread=true", BROTHER);
        assert(unreadOnly.data.data.notifications.every((n) => !n.read), "Filter unread only");
        const mu = await api("PATCH", `/api/notifications/${first.id}/read`, BROTHER, { read: false });
        assert(mu.data.data.notification.read === false, "Mark as unread again");
        const all = await api("POST", "/api/notifications/read-all", BROTHER, {});
        assert(all.status === 200 && all.data.data.unreadCount === 0, "Mark all as read");
        assert((await api("GET", "/api/notifications/unread-count", BROTHER)).data.data.unreadCount === 0, "Unread count now 0");
        const page = await api("GET", "/api/notifications?limit=1", BROTHER);
        assert(page.data.data.notifications.length === 1 && page.data.data.hasMore === true && page.data.data.nextBefore, "History paginates");
        const page2 = await api("GET", `/api/notifications?limit=1&before=${page.data.data.nextBefore}`, BROTHER);
        assert(page2.data.data.notifications[0].id !== page.data.data.notifications[0].id, "Next page returns older items");
        const ok = await api("POST", "/api/notifications/push-tokens", BROTHER, { token: "ExponentPushToken[abcdefghijklmnop123]", platform: "android" });
        assert(ok.status === 200 && ok.data.data.registered === true, "Push token registered (delivery off unless PUSH_ENABLED)");
        assert((await api("POST", "/api/notifications/push-tokens", BROTHER, { token: "not-a-push-token-at-all" })).status === 400, "Invalid push token rejected");
        assert((await api("DELETE", `/api/notifications/${first.id}`, BROTHER)).status === 200, "Delete own notification");
    }

    console.log("\nTEST 13: Revocation stops real-time access");
    {
        await api("DELETE", `/api/shares/folder/${shareId}`, OWNER);
        assert(await waitFor(() => brotherPhone.events.some((e) => e.type === "share.revoked")), "Brother's device told access was revoked");
        assert(await waitFor(() => brotherPhone.notifications.some((n) => n.type === "share.revoked")), "Brother notified of revocation");
        const before = brotherPhone.events.length;
        await upload(OWNER, "after-revoke.txt", Buffer.from("secret again\n"), "text/plain", familyId);
        await sleep(300);
        assert(brotherPhone.events.length === before, "No more events for the revoked folder");
        assert((await api("GET", `/api/notes/${familyNoteId}`, BROTHER)).status === 403, "Revoked user can no longer read notes (403)");
    }

    console.log("\nTEST 14: Activity log");
    {
        const act = await api("GET", `/api/sync/activity/file/${planId}`, OWNER);
        const actions = act.data.data.map((a) => a.action);
        assert(act.status === 200 && actions.includes("file.created") && actions.includes("file.updated") && actions.includes("file.downloaded"),
            "File history shows upload, edits and downloads");
        assert(act.data.data.every((a) => a.actor_name) && !act.raw.includes("actor_uid"), "History shows names, not internal ids");
        assert((await api("GET", `/api/sync/activity/file/${planId}`, STRANGER)).status === 403, "Stranger cannot read file history (403)");
        assert((await api("GET", `/api/sync/activity/folder/${familyId}`, BROTHER)).status === 403, "Revoked user cannot read history (403)");
        const mine = await api("GET", "/api/sync/activity", OWNER);
        assert(mine.data.data.length > 5 && mine.data.data.some((a) => a.action === "share.revoked"), "Personal activity feed");
        assert((await api("GET", "/api/sync/activity/user/1", OWNER)).status === 400, "Invalid activity resource type -> 400");
    }

    console.log("\nTEST 15: S3-compatible storage driver (in-memory S3 for the test)");
    {
        const objects = new Map();
        const fakeS3 = {
            async send(cmd) {
                const name = cmd.constructor.name;
                const { Key, Body } = cmd.input;
                if (name === "PutObjectCommand") { objects.set(Key, Buffer.from(Body)); return {}; }
                if (name === "GetObjectCommand") {
                    if (!objects.has(Key)) { const e = new Error("NoSuchKey"); e.name = "NoSuchKey"; throw e; }
                    const { Readable } = await import("stream");
                    return { Body: Readable.from([objects.get(Key)]), ContentLength: objects.get(Key).length };
                }
                if (name === "DeleteObjectCommand") { objects.delete(Key); return {}; }
                if (name === "HeadObjectCommand") { if (!objects.has(Key)) throw new Error("NotFound"); return {}; }
                if (name === "HeadBucketCommand") return {};
                throw new Error("unexpected " + name);
            },
        };
        const s3Store = new StorageService({ driver: "s3", s3: new S3Driver({ client: fakeS3, bucket: "test", prefix: "t/" }), local: new LocalDriver() });
        const secret = Buffer.from("cloud secret: never stored as plaintext\n".repeat(2000));
        const saved = await s3Store.saveFile({ ownerUid: OWNER.uid, filename: "../evil name.txt", buffer: secret });
        assert(saved.storagePath.startsWith("s3:t/") && !saved.storagePath.includes(".."), "Stored under s3: prefix with a sanitized key");
        const stored = objects.get(saved.storagePath.slice(3));
        assert(stored && !stored.includes(Buffer.from("cloud secret")), "Object store only ever receives ciphertext");
        const { stream, size } = await s3Store.getFileStream(saved.storagePath, { encrypted: true });
        const chunks = [];
        for await (const c of stream) chunks.push(c);
        assert(Buffer.concat(chunks).equals(secret) && size === secret.length, "Round-trip through S3 driver decrypts exactly");
        stored[200] ^= 0xff;
        let tamperOk = false;
        try {
            const t = await s3Store.getFileStream(saved.storagePath, { encrypted: true });
            const parts = [];
            for await (const c of t.stream) parts.push(c);
        } catch { tamperOk = true; }
        assert(tamperOk, "Tampered object in S3 is detected");
        assert((await s3Store.check()).driver === "s3", "S3 readiness check");
        await s3Store.deleteFile(saved.storagePath);
        assert(!objects.has(saved.storagePath.slice(3)), "Delete removes the object");
        let traversal = false;
        try { await s3Store.getFileStream("s3:../other-bucket/key", { encrypted: true }); } catch { traversal = true; }
        assert(traversal, "Path traversal in S3 keys rejected");
        const local = await s3Store.saveFile.call(new StorageService({ driver: "local" }), { ownerUid: OWNER.uid, filename: "mixed.txt", buffer: Buffer.from("local\n") });
        const mixed = await s3Store.getFileStream(local.storagePath, { encrypted: true });
        const mparts = [];
        for await (const c of mixed.stream) mparts.push(c);
        assert(Buffer.concat(mparts).toString() === "local\n", "With S3 active, older local files remain readable");
        await new StorageService({ driver: "local" }).deleteFile(local.storagePath);
    }

    console.log("\nTEST 16: Structured logging redaction");
    {
        const s = log.sanitize({ authorization: "Bearer abc", password: "pw", nested: { token: "t", ok: 1 }, url: `/s/${"ab".repeat(32)}` });
        assert(s.authorization === "[redacted]" && s.password === "[redacted]" && s.nested.token === "[redacted]" && s.nested.ok === 1,
            "Secrets redacted from log fields");
        assert(!s.url.includes("ab".repeat(32)), "Tokens inside strings are masked");
    }

    console.log("\nTEST 17: Account deletion removes all owned data");
    {
        const f = await api("POST", "/api/folders", DOOMED, { name: "Top" });
        const sub = await api("POST", "/api/folders", DOOMED, { name: "Sub", parent_folder_id: f.data.data.id });
        const file = await upload(DOOMED, "d.txt", Buffer.from("doomed\n"), "text/plain", sub.data.data.id);
        await api("POST", "/api/notes", DOOMED, { title: "n", folder_id: sub.data.data.id });
        await api("POST", "/api/shares", DOOMED, { resourceType: "folder", resourceId: f.data.data.id, email: STRANGER.email });
        const sp = (await pool.query("SELECT storage_path FROM files WHERE id = $1", [file.data.data.id])).rows[0].storage_path;
        const dbId = userIds[DOOMED.uid];
        assert((await api("DELETE", `/api/users/${dbId}`, STRANGER)).status === 403, "Cannot delete another user's account (403)");
        const del = await api("DELETE", `/api/users/${dbId}`, DOOMED);
        assert(del.status === 200, `Account deletion succeeds even with nested folders, files and notes (got ${del.status})`);
        const left = await pool.query(
            `SELECT (SELECT COUNT(*) FROM folders WHERE owner_firebase_uid = $1)::int f,
                    (SELECT COUNT(*) FROM files WHERE owner_firebase_uid = $1)::int fi,
                    (SELECT COUNT(*) FROM notes WHERE owner_firebase_uid = $1)::int n,
                    (SELECT COUNT(*) FROM folder_shares WHERE shared_by_uid = $1)::int s,
                    (SELECT COUNT(*) FROM users WHERE firebase_uid = $1)::int u`, [DOOMED.uid]);
        const r = left.rows[0];
        assert(r.f + r.fi + r.n + r.s + r.u === 0, "No folders, files, notes, shares or user row left");
        assert(!fs.existsSync(path.resolve(env.uploadDir, sp)), "Stored file removed from disk");
    }

    console.log("\nTEST 18: Database integrity constraints");
    {
        let e1 = null;
        try { await pool.query("INSERT INTO notes (owner_firebase_uid, title, created_by_uid, updated_by_uid, kind) VALUES ('x', 't', 'x', 'x', 'bad')"); } catch (e) { e1 = e.code; }
        assert(e1 === "23514", "DB rejects invalid note kind (CHECK)");
        let e2 = null;
        try { await pool.query("INSERT INTO notes (owner_firebase_uid, title, created_by_uid, updated_by_uid, folder_id) VALUES ('x', 't', 'x', 'x', 999999999)"); } catch (e) { e2 = e.code; }
        assert(e2 === "23503", "DB rejects note in non-existent folder (FK)");
        let e3 = null;
        try { await pool.query(`DELETE FROM folders WHERE id = $1`, [familyId]); } catch (e) { e3 = e.code; }
        assert(e3 === "23503" || e3 === "23001", "DB refuses to delete a folder that still has notes (FK RESTRICT)");
        let e4 = null;
        try { await pool.query("INSERT INTO notifications (user_uid, type, title, resource_type) VALUES ('x','t','t','users')"); } catch (e) { e4 = e.code; }
        assert(e4 === "23514", "DB rejects invalid notification resource type");
    }

    console.log("\nTEST 19: Migrations build a fresh database from scratch and are re-runnable");
    {
        const dbName = `sharesync_migtest_${STAMP}`;
        await pool.query(`CREATE DATABASE ${dbName}`);
        try {
            const envVars = { ...process.env, DB_NAME: dbName };
            const r1 = spawnSync(process.execPath, ["migrate.mjs"], { env: envVars, encoding: "utf8" });
            const total = fs.readdirSync("migrations").filter((f) => /^\d{3}_.+\.mjs$/.test(f)).length;
            assert(r1.status === 0 && r1.stdout.includes(`Applied ${total} migration(s)`), `All ${total} migrations apply cleanly to an empty database`);
            const r2 = spawnSync(process.execPath, ["migrate.mjs"], { env: envVars, encoding: "utf8" });
            assert(r2.status === 0 && r2.stdout.includes("up to date"), "Second run is a no-op");
            const pg = (await import("pg")).default;
            const c = new pg.Client({ user: process.env.DB_USER, host: process.env.DB_HOST, database: dbName, password: process.env.DB_PASSWORD, port: Number(process.env.DB_PORT) || 5432 });
            await c.connect();
            const t = await c.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'");
            await c.end();
            const names = t.rows.map((x) => x.table_name);
            const expected = ["users", "folders", "files", "file_shares", "folder_shares", "share_links", "notes", "notifications", "activity_log", "sync_events", "sync_devices", "push_tokens", "sync_state", "schema_migrations"];
            assert(expected.every((n) => names.includes(n)), "Fresh database contains every table");
        } finally {
            await pool.query(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
        }
    }
}

run()
    .catch((err) => {
        console.error("Test run crashed:", err);
        failed++;
    })
    .finally(async () => {
        await teardown();
        console.log(`\nPHASE D-H TESTS: ${passed} passed, ${failed} failed`);
        process.exit(failed > 0 ? 1 : 0);
    });
