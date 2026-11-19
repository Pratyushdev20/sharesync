/**
 * Tests: Google Sign-In session endpoint and profile management.
 * Run: NODE_ENV=test node test_profile_google.mjs
 */
import fs from "fs";
import path from "path";
import { getAuth } from "firebase-admin/auth";
import app from "./src/app.js";
import pool from "./src/config/db.js";
import env from "./src/config/env.js";

const STAMP = Date.now();
const now = () => Math.floor(Date.now() / 1000);

// token -> decoded claims
const TOKENS = new Map();
function tokenFor(key, claims) {
    const t = `token_pg_${key}_${STAMP}`;
    TOKENS.set(t, claims);
    return t;
}

const GOOGLE_NEW = { uid: `test_pg_google_${STAMP}`, email: `pg_google_${STAMP}@gmail.com`, name: "Gina Google" };
const PASSWORD_USER = { uid: `test_pg_pass_${STAMP}`, email: `pg_pass_${STAMP}@example.com`, name: "Paul Password" };
const SQUATTER = { uid: `test_pg_squat_${STAMP}`, email: PASSWORD_USER.email, name: "Other Google" };
const UNVERIFIED = { uid: `test_pg_unv_${STAMP}`, email: `pg_unv_${STAMP}@example.com` };

const T = {
    googleNew: tokenFor("gnew", { uid: GOOGLE_NEW.uid, email: GOOGLE_NEW.email, email_verified: true, name: GOOGLE_NEW.name, auth_time: now(), firebase: { sign_in_provider: "google.com" } }),
    googleNewStale: tokenFor("gstale", { uid: GOOGLE_NEW.uid, email: GOOGLE_NEW.email, email_verified: true, auth_time: now() - 3600, firebase: { sign_in_provider: "google.com" } }),
    password: tokenFor("pass", { uid: PASSWORD_USER.uid, email: PASSWORD_USER.email, email_verified: false, auth_time: now(), firebase: { sign_in_provider: "password" } }),
    squatter: tokenFor("squat", { uid: SQUATTER.uid, email: SQUATTER.email, email_verified: true, name: SQUATTER.name, auth_time: now(), firebase: { sign_in_provider: "google.com" } }),
    unverified: tokenFor("unv", { uid: UNVERIFIED.uid, email: UNVERIFIED.email, email_verified: false, auth_time: now(), firebase: { sign_in_provider: "password" } }),
    noAuthTime: tokenFor("noat", { uid: PASSWORD_USER.uid, email: PASSWORD_USER.email, email_verified: false, firebase: { sign_in_provider: "password" } }),
};

let server, baseUrl;
let passed = 0;
let failed = 0;
const deletedFirebaseUids = [];

function assert(c, m) {
    if (c) { console.log(`  ✅ PASS: ${m}`); passed++; }
    else { console.error(`  ❌ FAIL: ${m}`); failed++; }
}

async function api(method, url, token, body) {
    const opts = { method, headers: {} };
    if (token) opts.headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) {
        opts.headers["Content-Type"] = "application/json";
        opts.body = JSON.stringify(body);
    }
    const res = await fetch(baseUrl + url, opts);
    const text = await res.text();
    let data;
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, raw: text };
}

async function upload(token, name, buffer) {
    const form = new FormData();
    form.append("file", new Blob([buffer], { type: "text/plain" }), name);
    const res = await fetch(`${baseUrl}/api/files/upload`, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form });
    return { status: res.status, data: await res.json() };
}

async function setup() {
    const auth = getAuth();
    auth.verifyIdToken = async (t) => {
        const c = TOKENS.get(t);
        if (!c) throw new Error("invalid");
        return { ...c, exp: now() + 3600 };
    };
    auth.deleteUser = async (uid) => { deletedFirebaseUids.push(uid); };
    await pool.query("INSERT INTO users (name, email, firebase_uid) VALUES ($1, $2, $3)", [PASSWORD_USER.name, PASSWORD_USER.email, PASSWORD_USER.uid]);
    await new Promise((resolve) => { server = app.listen(0, resolve); });
    baseUrl = `http://localhost:${server.address().port}`;
}

async function teardown() {
    const uids = [GOOGLE_NEW.uid, PASSWORD_USER.uid, SQUATTER.uid, UNVERIFIED.uid];
    try {
        const files = await pool.query("SELECT storage_path FROM files WHERE owner_firebase_uid = ANY($1)", [uids]);
        for (const f of files.rows) { try { await fs.promises.unlink(path.resolve(env.uploadDir, f.storage_path)); } catch {} }
        await pool.query("DELETE FROM notes WHERE owner_firebase_uid = ANY($1)", [uids]);
        await pool.query("DELETE FROM files WHERE owner_firebase_uid = ANY($1)", [uids]);
        await pool.query("DELETE FROM folders WHERE owner_firebase_uid = ANY($1)", [uids]);
        await pool.query("DELETE FROM users WHERE firebase_uid = ANY($1)", [uids]);
        for (const u of uids) await fs.promises.rm(path.join(env.uploadDir, u), { recursive: true, force: true }).catch(() => {});
    } catch (e) { console.error("teardown", e.message); }
    await pool.end();
    server?.close();
}

async function run() {
    await setup();

    console.log("\nTEST 1: Google Sign-In session (first sign-in creates the account)");
    {
        assert((await api("POST", "/api/auth/session", null)).status === 401, "Session requires a Firebase token (401)");
        assert((await api("POST", "/api/auth/session", "forged")).status === 401, "Forged token rejected (401)");
        const first = await api("POST", "/api/auth/session", T.googleNew, {});
        assert(first.status === 201 && first.data.created === true, "First Google sign-in creates a ShareSync account (201)");
        assert(first.data.data.email === GOOGLE_NEW.email && first.data.data.name === GOOGLE_NEW.name, "Account uses the verified Google email and name");
        assert(first.data.provider === "google.com", "Provider reported");
        assert(first.data.data.password_hash === undefined, "No password hash exposed");
        const again = await api("POST", "/api/auth/session", T.googleNew, {});
        assert(again.status === 200 && again.data.created === false && again.data.data.id === first.data.data.id, "Next sign-in returns the same account (no duplicate)");
        const rows = await pool.query("SELECT COUNT(*)::int c FROM users WHERE firebase_uid = $1", [GOOGLE_NEW.uid]);
        assert(rows.rows[0].c === 1, "Exactly one database row for the Google user");
    }

    console.log("\nTEST 2: Session safety rules");
    {
        const squat = await api("POST", "/api/auth/session", T.squatter, {});
        assert(squat.status === 409 && squat.data.code === "ACCOUNT_EXISTS", "Google account cannot take over an existing account with the same email (409)");
        const unv = await api("POST", "/api/auth/session", T.unverified, {});
        assert(unv.status === 404 && unv.data.code === "REGISTRATION_REQUIRED", "Unverified email is not auto-registered (404 REGISTRATION_REQUIRED)");
        const pass = await api("POST", "/api/auth/session", T.password, {});
        assert(pass.status === 200 && pass.data.created === false, "Existing password user signs in through the same endpoint");
        const hostile = await api("POST", "/api/auth/session", T.unverified, { name: "x" });
        assert(hostile.status === 404, "Supplying a name does not bypass verification");
    }

    console.log("\nTEST 3: Profile");
    {
        await upload(T.googleNew, "a.txt", Buffer.from("hello world\n"));
        await api("POST", "/api/folders", T.googleNew, { name: "Docs" });
        await api("POST", "/api/notes", T.googleNew, { title: "n1" });
        const me = await api("GET", "/api/users/me", T.googleNew);
        assert(me.status === 200 && me.data.data.email === GOOGLE_NEW.email, "GET /api/users/me returns own profile");
        const s = me.data.data.stats;
        assert(s.files === 1 && s.storageBytes === 12 && s.folders === 1 && s.notes === 1, "Usage stats are correct (files, bytes, folders, notes)");
        assert(me.data.data.provider === "google.com" && me.data.data.emailVerified === true, "Shows sign-in method and verification");
        assert(!me.raw.includes("firebase_uid") && !me.raw.includes("password_hash"), "No internal ids or hashes exposed");
        const other = await api("GET", "/api/users/me", T.password);
        assert(other.data.data.email === PASSWORD_USER.email && other.data.data.stats.files === 0, "Each user only sees their own profile");
        assert((await api("GET", "/api/users/me", T.unverified)).status === 404, "Profile of a non-registered user → 404");
    }

    console.log("\nTEST 4: Edit profile");
    {
        const ok = await api("PATCH", "/api/users/me", T.googleNew, { name: "  Gina G.  " });
        assert(ok.status === 200 && ok.data.data.name === "Gina G.", "Name updated and trimmed");
        assert((await api("PATCH", "/api/users/me", T.googleNew, { name: "   " })).status === 400, "Empty name rejected (400)");
        assert((await api("PATCH", "/api/users/me", T.googleNew, { name: "x".repeat(101) })).status === 400, "Name over 100 characters rejected (400)");
        const mass = await api("PATCH", "/api/users/me", T.googleNew, { name: "ok", email: "evil@example.com" });
        assert(mass.status === 400, "Email cannot be changed through profile (strict body, 400)");
        const ctl = await api("PATCH", "/api/users/me", T.googleNew, { name: "Gi\u0000na" });
        assert(ctl.status === 200 && ctl.data.data.name === "Gina", "Control characters stripped");
        assert((await api("PATCH", "/api/users/me", null, { name: "x" })).status === 401, "Requires authentication");
    }

    console.log("\nTEST 5: Account deletion");
    {
        const stale = await api("DELETE", "/api/users/me", T.googleNewStale);
        assert(stale.status === 401 && stale.data.code === "REAUTH_REQUIRED", "Old sign-in cannot delete the account (REAUTH_REQUIRED)");
        const noTime = await api("DELETE", "/api/users/me", T.noAuthTime);
        assert(noTime.status === 401 && noTime.data.code === "REAUTH_REQUIRED", "Token without auth_time cannot delete the account");
        const stillThere = await pool.query("SELECT COUNT(*)::int c FROM users WHERE firebase_uid = $1", [GOOGLE_NEW.uid]);
        assert(stillThere.rows[0].c === 1, "Nothing deleted after refused requests");
        const path0 = (await pool.query("SELECT storage_path FROM files WHERE owner_firebase_uid = $1", [GOOGLE_NEW.uid])).rows[0].storage_path;
        const del = await api("DELETE", "/api/users/me", T.googleNew);
        assert(del.status === 200 && del.data.data.dataDeleted === true && del.data.data.firebaseDeleted === true, "Recent sign-in deletes the account");
        assert(deletedFirebaseUids.includes(GOOGLE_NEW.uid) && !deletedFirebaseUids.includes(PASSWORD_USER.uid), "Firebase account deleted (only the caller's)");
        const left = await pool.query(
            `SELECT (SELECT COUNT(*) FROM users WHERE firebase_uid = $1)::int u,
                    (SELECT COUNT(*) FROM files WHERE owner_firebase_uid = $1)::int f,
                    (SELECT COUNT(*) FROM notes WHERE owner_firebase_uid = $1)::int n,
                    (SELECT COUNT(*) FROM folders WHERE owner_firebase_uid = $1)::int d`, [GOOGLE_NEW.uid]);
        const r = left.rows[0];
        assert(r.u + r.f + r.n + r.d === 0, "All data removed");
        assert(!fs.existsSync(path.resolve(env.uploadDir, path0)), "Stored file removed");
        const pw = await pool.query("SELECT COUNT(*)::int c FROM users WHERE firebase_uid = $1", [PASSWORD_USER.uid]);
        assert(pw.rows[0].c === 1, "Other users untouched");
    }
}

run()
    .catch((e) => { console.error("crashed", e); failed++; })
    .finally(async () => {
        await teardown();
        console.log(`\nPROFILE & GOOGLE TESTS: ${passed} passed, ${failed} failed`);
        process.exit(failed > 0 ? 1 : 0);
    });
