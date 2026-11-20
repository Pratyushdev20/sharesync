/**
 * Deployment readiness tests:
 *  - production config validation (refuses unsafe settings)
 *  - DATABASE_URL connection support
 *  - upload concurrency limiter (memory guard) incl. slot release
 *  - S3 provider-side encryption header is opt-in
 *  - render.yaml sanity
 *
 * Run: NODE_ENV=test node test_deployment.mjs
 */
import fs from "fs";
import http from "http";
import { spawnSync } from "child_process";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

let passed = 0;
let failed = 0;
function assert(c, m) {
    if (c) { console.log(`  ✅ PASS: ${m}`); passed++; }
    else { console.error(`  ❌ FAIL: ${m}`); failed++; }
}

/** Runs validateEnv() in a child process with the given env; returns the problem list. */
function problemsWith(extraEnv) {
    const code = 'const { validateEnv } = await import("./src/config/env.js"); process.stdout.write(JSON.stringify(validateEnv()));';
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
        env: { ...process.env, ...extraEnv },
        encoding: "utf8",
    });
    try { return JSON.parse(r.stdout); } catch { return [`could not run: ${r.stderr}`]; }
}

const PROD_OK = {
    NODE_ENV: "production",
    DATABASE_URL: "postgres://u:p@db.internal:5432/sharesync",
    CORS_ORIGINS: "https://app.example.com",
    STORAGE_DRIVER: "s3",
    S3_BUCKET: "b",
    S3_ACCESS_KEY_ID: "k",
    S3_SECRET_ACCESS_KEY: "s",
};

console.log("\nTEST 1: Production configuration validation");
{
    assert(problemsWith(PROD_OK).length === 0, "Correct production config passes");
    const local = problemsWith({ ...PROD_OK, STORAGE_DRIVER: "local" });
    assert(local.some((p) => p.includes("lose uploaded files")), "Local disk storage refused in production (files would be lost on Render)");
    assert(problemsWith({ ...PROD_OK, STORAGE_DRIVER: "local", ALLOW_LOCAL_STORAGE: "true" }).length === 0, "Local storage allowed only with explicit persistent-disk opt-in");
    assert(problemsWith({ ...PROD_OK, CORS_ORIGINS: "" }).some((p) => p.includes("CORS_ORIGINS must be set")), "Missing CORS_ORIGINS refused");
    assert(problemsWith({ ...PROD_OK, CORS_ORIGINS: "http://app.example.com" }).some((p) => p.includes("https://")), "Plain http origin refused");
    assert(problemsWith({ ...PROD_OK, CORS_ORIGINS: "http://localhost:8081" }).some((p) => p.includes("localhost")), "localhost origin refused");
    assert(problemsWith({ ...PROD_OK, DATABASE_URL: "mysql://x" }).some((p) => p.includes("DATABASE_URL")), "Non-PostgreSQL DATABASE_URL refused");
    assert(problemsWith({ ...PROD_OK, STORAGE_DRIVER: "s3", S3_BUCKET: "" }).some((p) => p.includes("S3_BUCKET")), "S3 without bucket refused");
    assert(problemsWith({ ...PROD_OK, FILE_ENCRYPTION_KEY: "" }).some((p) => p.includes("FILE_ENCRYPTION_KEY")), "Missing encryption key refused");
    const noDb = problemsWith({ ...PROD_OK, DATABASE_URL: "", DB_HOST: "", DB_USER: "", DB_NAME: "" });
    assert(noDb.some((p) => p.includes("DB_HOST") && p.includes("DATABASE_URL")), "Missing database settings refused with a hint");
    assert(problemsWith({ NODE_ENV: "development" }).length === 0, "Local development config still works");
}

console.log("\nTEST 2: DATABASE_URL support");
{
    const e = process.env;
    const url = `postgres://${encodeURIComponent(e.DB_USER)}:${encodeURIComponent(e.DB_PASSWORD || "")}@${e.DB_HOST}:${e.DB_PORT || 5432}/${e.DB_NAME}`;
    const code = 'const { default: p } = await import("./src/config/db.js"); const r = await p.query("SELECT current_database() AS d"); process.stdout.write(r.rows[0].d); await p.end();';
    const r = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
        env: { ...process.env, DATABASE_URL: url, DB_HOST: "wrong-host-on-purpose.invalid", DB_USER: "nobody" },
        encoding: "utf8",
        timeout: 20000,
    });
    assert(r.status === 0 && r.stdout === e.DB_NAME, "Connects through DATABASE_URL (takes precedence over DB_*)");
    const bad = spawnSync(process.execPath, ["--input-type=module", "-e", code], {
        env: { ...process.env, DATABASE_URL: "postgres://nobody:wrong@127.0.0.1:1/none" },
        encoding: "utf8",
        timeout: 20000,
    });
    assert(bad.status !== 0, "A wrong DATABASE_URL fails instead of silently using DB_*");
}

console.log("\nTEST 3: Upload concurrency limiter (memory guard)");
{
    process.env.UPLOAD_CONCURRENCY = "1";
    process.env.UPLOAD_QUEUE_WAIT_MS = "800";
    const { default: app } = await import("./src/app.js"); // initializes Firebase Admin
    const { getAuth } = await import("firebase-admin/auth");
    const deployUid = `test_deploy_${Date.now()}`;
    getAuth().verifyIdToken = async (t) => {
        if (t !== "tok_deploy") throw new Error("bad");
        return { uid: deployUid, email: `deploy_${Date.now()}@example.com`, email_verified: true, exp: Math.floor(Date.now() / 1000) + 3600 };
    };
    const { default: pool } = await import("./src/config/db.js");
    const server = app.listen(0);
    const port = server.address().port;

    // 1) A slow upload holds the only slot: send headers + part of the body, never finish
    const boundary = "----slowupload";
    const slow = http.request({
        host: "127.0.0.1", port, method: "POST", path: "/api/files/upload",
        headers: { Authorization: "Bearer tok_deploy", "Content-Type": `multipart/form-data; boundary=${boundary}`, "Content-Length": 10_000_000 },
    });
    slow.on("error", () => {});
    slow.write(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="slow.txt"\r\nContent-Type: text/plain\r\n\r\n`);
    slow.write("x".repeat(1000));
    await new Promise((r) => setTimeout(r, 300));

    // 2) A second upload waits, then gets 503 SERVER_BUSY with Retry-After
    const form = new FormData();
    form.append("file", new Blob([Buffer.from("hello\n")], { type: "text/plain" }), "second.txt");
    const t0 = Date.now();
    const busy = await fetch(`http://127.0.0.1:${port}/api/files/upload`, { method: "POST", headers: { Authorization: "Bearer tok_deploy" }, body: form });
    const busyBody = await busy.json();
    assert(busy.status === 503 && busyBody.code === "SERVER_BUSY", "Upload beyond the limit gets 503 SERVER_BUSY");
    assert(busy.headers.get("retry-after") === "10", "Busy response tells the client when to retry");
    assert(Date.now() - t0 >= 700, "It waited in the queue before giving up");

    // 3) Abort the slow upload: its slot must be released
    slow.destroy();
    await new Promise((r) => setTimeout(r, 300));
    const form2 = new FormData();
    form2.append("file", new Blob([Buffer.from("after release\n")], { type: "text/plain" }), "after.txt");
    const ok = await fetch(`http://127.0.0.1:${port}/api/files/upload`, { method: "POST", headers: { Authorization: "Bearer tok_deploy" }, body: form2 });
    const okBody = await ok.json();
    assert(ok.status === 201, `Slot released after a client disconnect (next upload accepted, got ${ok.status})`);

    // 4) Queued upload gets the slot when the current one finishes (no 503)
    const make = (name) => {
        const f = new FormData();
        f.append("file", new Blob([Buffer.from(name)], { type: "text/plain" }), name);
        return fetch(`http://127.0.0.1:${port}/api/files/upload`, { method: "POST", headers: { Authorization: "Bearer tok_deploy" }, body: f });
    };
    const [a, b] = await Promise.all([make("q1.txt"), make("q2.txt")]);
    assert(a.status === 201 && b.status === 201, "Two quick uploads are queued and both succeed");

    // cleanup
    const uid = deployUid;
    void okBody;
    {
        const rows = await pool.query("SELECT storage_path FROM files WHERE owner_firebase_uid = $1", [uid]);
        const { default: storage } = await import("./src/services/storage.service.js");
        for (const r of rows.rows) await storage.deleteFile(r.storage_path);
        await pool.query("DELETE FROM files WHERE owner_firebase_uid = $1", [uid]);
        await pool.query("DELETE FROM users WHERE firebase_uid = $1", [uid]);
        await fs.promises.rm(`uploads/${uid}`, { recursive: true, force: true }).catch(() => {});
    }
    server.close();
    await pool.end();
}

console.log("\nTEST 4: S3 provider-side encryption header is opt-in");
{
    const { S3Driver } = await import("./src/services/storage.service.js");
    const sent = [];
    const fake = { send: async (cmd) => { sent.push(cmd.input); return {}; } };
    delete process.env.S3_SSE;
    await new S3Driver({ client: fake, bucket: "b", prefix: "t/" }).put("u", "a.txt", Buffer.from("x"));
    assert(sent[0].ServerSideEncryption === undefined, "No SSE header by default (Cloudflare R2 compatible)");
    process.env.S3_SSE = "true";
    await new S3Driver({ client: fake, bucket: "b", prefix: "t/" }).put("u", "a.txt", Buffer.from("x"));
    assert(sent[1].ServerSideEncryption === "AES256", "SSE header sent when S3_SSE=true");
    delete process.env.S3_SSE;
}

console.log("\nTEST 5: Deployment files");
{
    const yaml = fs.readFileSync("../render.yaml", "utf8");
    assert(/rootDir:\s*server/.test(yaml) && /startCommand:\s*npm start/.test(yaml), "render.yaml points at server/ with npm start");
    assert(/preDeployCommand:\s*npm run migrate/.test(yaml), "Migrations run before each deploy");
    assert(/healthCheckPath:\s*\/api\/health/.test(yaml), "Health check configured");
    assert(/numInstances:\s*1/.test(yaml), "Single instance (in-memory rate limits / realtime rooms)");
    const secretKeys = ["FIREBASE_PRIVATE_KEY", "FILE_ENCRYPTION_KEY", "S3_SECRET_ACCESS_KEY", "S3_ACCESS_KEY_ID", "FIREBASE_CLIENT_EMAIL"];
    assert(secretKeys.every((k) => new RegExp(`key: ${k}\\s*\\n\\s*sync: false`).test(yaml)), "Secrets are never stored in render.yaml (sync: false)");
    const pkg = JSON.parse(fs.readFileSync("package.json", "utf8"));
    assert(pkg.engines?.node && pkg.scripts.start === "node server.js" && pkg.scripts.migrate, "package.json pins Node and has start/migrate scripts");
    const git = spawnSync("git", ["check-ignore", "-q", ".env.production"], { encoding: "utf8" });
    assert(git.status === 0, ".env.production files are git-ignored");
}

console.log(`\nDEPLOYMENT TESTS: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
