/**
 * End-to-end tests for Native Push Notifications Integration:
 * - Token registration (POST /api/notifications/push-tokens)
 * - Validation (format, authentication, permissions)
 * - Duplicate handling & account switching
 * - Multiple devices per user
 * - Unregistration on logout (DELETE /api/notifications/push-tokens)
 * - Push transport delivery & stale token pruning on DeviceNotRegistered
 *
 * Run: NODE_ENV=test node test_push_notifications.mjs
 */
import http from "http";
import { getAuth } from "firebase-admin/auth";
import app from "./src/app.js";
import pool from "./src/config/db.js";
import env from "./src/config/env.js";
import { createNotifications, registerPushToken, unregisterPushToken } from "./src/services/notification.service.js";

const STAMP = Date.now();
const mk = (key, name) => ({
    uid: `test_push_${key}_${STAMP}`,
    name,
    email: `push_${key}_${STAMP}@example.com`,
    token: `token_push_${key}_${STAMP}`,
});

const USER_A = mk("userA", "User Alice");
const USER_B = mk("userB", "User Bob");
const USERS = [USER_A, USER_B];

let server, baseUrl;
let passed = 0;
let failed = 0;

function assert(condition, message) {
    if (condition) {
        console.log(`  ✅ PASS: ${message}`);
        passed++;
    } else {
        console.error(`  ❌ FAIL: ${message}`);
        failed++;
    }
}

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

async function setup() {
    const auth = getAuth();
    auth.verifyIdToken = async (token) => {
        const u = USERS.find((x) => x.token === token);
        if (!u) throw new Error("invalid token");
        return { uid: u.uid, email: u.email, email_verified: true, name: u.name, exp: Math.floor(Date.now() / 1000) + 3600 };
    };

    for (const u of USERS) {
        await pool.query(
            "INSERT INTO users (name, email, firebase_uid) VALUES ($1, $2, $3) ON CONFLICT (firebase_uid) DO NOTHING",
            [u.name, u.email, u.uid]
        );
    }

    server = http.createServer(app);
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://localhost:${server.address().port}`;
}

async function teardown() {
    try {
        const uids = USERS.map((u) => u.uid);
        await pool.query("DELETE FROM push_tokens WHERE user_uid = ANY($1)", [uids]);
        await pool.query("DELETE FROM notifications WHERE user_uid = ANY($1)", [uids]);
        await pool.query("DELETE FROM users WHERE firebase_uid = ANY($1)", [uids]);
    } catch (err) {
        console.error("Teardown error:", err.message);
    }
    await pool.end();
    server?.close();
}

async function run() {
    await setup();

    console.log("\nTEST 1: Authentication & Input Validation");
    {
        const noAuth = await api("POST", "/api/notifications/push-tokens", null, { token: "ExponentPushToken[abc123def456ghi789]" });
        assert(noAuth.status === 401, "Push token registration requires authentication (401)");

        const badAuth = await fetch(`${baseUrl}/api/notifications/push-tokens`, {
            method: "POST",
            headers: { Authorization: "Bearer forged-token", "Content-Type": "application/json" },
            body: JSON.stringify({ token: "ExponentPushToken[abc123def456ghi789]" }),
        });
        assert(badAuth.status === 401, "Push token registration with invalid token rejected (401)");

        const invalidFormat = await api("POST", "/api/notifications/push-tokens", USER_A, { token: "not-an-expo-token" });
        assert(invalidFormat.status === 400 && invalidFormat.data.code === "VALIDATION_ERROR", "Invalid token format rejected with VALIDATION_ERROR (400)");

        const emptyToken = await api("POST", "/api/notifications/push-tokens", USER_A, { token: "" });
        assert(emptyToken.status === 400, "Empty token rejected (400)");

        const maliciousToken = await api("POST", "/api/notifications/push-tokens", USER_A, { token: "'; DROP TABLE push_tokens;--" });
        assert(maliciousToken.status === 400, "Malicious token format rejected (400)");
    }

    console.log("\nTEST 2: Push Token Registration (Android and iOS)");
    const tokenAndroid = `ExponentPushToken[android_${STAMP}_abc123456789]`;
    const tokenIOS = `ExponentPushToken[ios_${STAMP}_xyz987654321]`;
    {
        const reg1 = await api("POST", "/api/notifications/push-tokens", USER_A, { token: tokenAndroid, platform: "android" });
        assert(reg1.status === 200 && reg1.data.data.registered === true, "Android push token successfully registered");

        const reg2 = await api("POST", "/api/notifications/push-tokens", USER_A, { token: tokenIOS, platform: "ios" });
        assert(reg2.status === 200 && reg2.data.data.registered === true, "iOS push token successfully registered for same user");

        const rows = await pool.query("SELECT token, platform, user_uid FROM push_tokens WHERE user_uid = $1", [USER_A.uid]);
        assert(rows.rows.length === 2, "Multiple push tokens associated with one user account");
        assert(rows.rows.some((r) => r.platform === "android") && rows.rows.some((r) => r.platform === "ios"), "Correct platforms recorded");
    }

    console.log("\nTEST 3: Duplicate Registration Handling (Idempotency)");
    {
        const dup = await api("POST", "/api/notifications/push-tokens", USER_A, { token: tokenAndroid, platform: "android" });
        assert(dup.status === 200 && dup.data.data.registered === true, "Re-registering same token succeeds idempotently");

        const rows = await pool.query("SELECT COUNT(*)::int as c FROM push_tokens WHERE user_uid = $1 AND token = $2", [USER_A.uid, tokenAndroid]);
        assert(rows.rows[0].c === 1, "Duplicate registration does not duplicate records in database");
    }

    console.log("\nTEST 4: Account Switching / Device Handoff");
    {
        // When User B logs in on the device that had tokenAndroid, the token transfers to User B
        const switchAcc = await api("POST", "/api/notifications/push-tokens", USER_B, { token: tokenAndroid, platform: "android" });
        assert(switchAcc.status === 200 && switchAcc.data.data.registered === true, "Token registration updates ownership to new authenticated user");

        const row = await pool.query("SELECT user_uid FROM push_tokens WHERE token = $1", [tokenAndroid]);
        assert(row.rows[0]?.user_uid === USER_B.uid, "Push token ownership successfully migrated to User B");

        const userARows = await pool.query("SELECT token FROM push_tokens WHERE user_uid = $1", [USER_A.uid]);
        assert(!userARows.rows.some((r) => r.token === tokenAndroid), "Old user no longer receives notifications on transferred device");
    }

    console.log("\nTEST 5: Push Token Unregistration (Logout)");
    {
        // User A unregisters their iOS token via body
        const unreg1 = await api("DELETE", "/api/notifications/push-tokens", USER_A, { token: tokenIOS });
        assert(unreg1.status === 200 && unreg1.data.data.removed === true, "Unregistering push token via body succeeds");

        const check1 = await pool.query("SELECT 1 FROM push_tokens WHERE token = $1", [tokenIOS]);
        assert(check1.rows.length === 0, "Unregistered token removed from database");

        // User B unregisters their Android token via path param
        const unreg2 = await api("DELETE", `/api/notifications/push-tokens/${encodeURIComponent(tokenAndroid)}`, USER_B);
        assert(unreg2.status === 200 && unreg2.data.data.removed === true, "Unregistering push token via path parameter succeeds");

        const check2 = await pool.query("SELECT 1 FROM push_tokens WHERE token = $1", [tokenAndroid]);
        assert(check2.rows.length === 0, "Unregistered token removed from database");
    }

    console.log("\nTEST 6: Expo Push Transport & DeviceNotRegistered Pruning");
    {
        const deadToken = `ExponentPushToken[dead_${STAMP}_000000000]`;
        await registerPushToken(USER_A.uid, deadToken, "android");

        // Mock global fetch for Expo Push API to simulate DeviceNotRegistered ticket
        const originalFetch = global.fetch;
        let pushPayloadSent = null;

        global.fetch = async (url, opts) => {
            if (typeof url === "string" && url.includes("exp.host/--/api/v2/push/send")) {
                pushPayloadSent = JSON.parse(opts.body);
                return {
                    ok: true,
                    status: 200,
                    json: async () => ({
                        data: [
                            {
                                status: "error",
                                message: `"${deadToken}" is not a registered push notification recipient`,
                                details: { error: "DeviceNotRegistered" },
                            },
                        ],
                    }),
                };
            }
            return originalFetch(url, opts);
        };

        try {
            // Enable push temporarily for test
            const origEnabled = env.pushEnabled;
            env.pushEnabled = true;

            await createNotifications([
                {
                    userUid: USER_A.uid,
                    type: "file.created",
                    title: "Test File",
                    body: "File created in shared folder",
                    resourceType: "file",
                    resourceId: 101,
                },
            ]);

            // Give async deliver transport a moment to finish
            await new Promise((r) => setTimeout(r, 200));

            assert(pushPayloadSent !== null && pushPayloadSent[0]?.to === deadToken, "Notification triggered delivery attempt to registered push token");

            const left = await pool.query("SELECT 1 FROM push_tokens WHERE token = $1", [deadToken]);
            assert(left.rows.length === 0, "Dead token pruned from push_tokens when Expo reports DeviceNotRegistered");

            env.pushEnabled = origEnabled;
        } finally {
            global.fetch = originalFetch;
        }
    }
}

run()
    .catch((err) => {
        console.error("Test suite crashed:", err);
        failed++;
    })
    .finally(async () => {
        await teardown();
        console.log(`\nPUSH NOTIFICATION TESTS: ${passed} passed, ${failed} failed\n`);
        process.exit(failed > 0 ? 1 : 0);
    });
