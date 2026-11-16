import app from "./src/app.js";
import pool from "./src/config/db.js";
import { getAuth } from "firebase-admin/auth";

let server;
let port;
let baseUrl;

// We will insert a test user into the DB to test the valid token flow
const TEST_USER = {
    name: "Test Auth User",
    email: "test_auth_user_" + Date.now() + "@example.com",
    password_hash: "hash_secret_never_leak",
    firebase_uid: "test_firebase_uid_" + Date.now()
};

async function setup() {
    return new Promise((resolve) => {
        server = app.listen(0, async () => {
            port = server.address().port;
            baseUrl = `http://localhost:${port}`;
            console.log(`Test server started on ${baseUrl}`);

            // Insert test user into PostgreSQL
            const res = await pool.query(
                "INSERT INTO users (name, email, password_hash, firebase_uid) VALUES ($1, $2, $3, $4) RETURNING *",
                [TEST_USER.name, TEST_USER.email, TEST_USER.password_hash, TEST_USER.firebase_uid]
            );
            TEST_USER.id = res.rows[0].id;
            console.log(`Test user created in DB with id: ${TEST_USER.id}, firebase_uid: ${TEST_USER.firebase_uid}`);
            resolve();
        });
    });
}

async function teardown() {
    try {
        if (TEST_USER.id) {
            await pool.query("DELETE FROM users WHERE id = $1", [TEST_USER.id]);
            console.log(`Test user ${TEST_USER.id} cleaned up from DB.`);
        }
    } catch (e) {
        console.error("Cleanup error:", e.message);
    }
    await pool.end();
    if (server) {
        server.close();
    }
}

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

async function runTests() {
    console.log("\n=========================================");
    console.log("RUNNING AUTH LOGIN SECURITY TESTS");
    console.log("=========================================\n");

    try {
        await setup();

        // -------------------------------------------------------------
        // TEST 1: Missing token (no Authorization header, no body token)
        // -------------------------------------------------------------
        console.log("TEST 1: Missing Token");
        {
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({})
            });
            const data = await res.json();
            assert(res.status === 401, `Status is 401 (got ${res.status})`);
            assert(data.success === false, "Response success is false");
            assert(data.message.includes("Authorization token missing"), `Message indicates missing token (got "${data.message}")`);
        }

        // -------------------------------------------------------------
        // TEST 2: Attempting login with raw firebase_uid in body (NO token)
        // -------------------------------------------------------------
        console.log("\nTEST 2: Raw firebase_uid in request body without token");
        {
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ firebase_uid: TEST_USER.firebase_uid })
            });
            const data = await res.json();
            assert(res.status === 401, `Status is 401 - raw firebase_uid is rejected (got ${res.status})`);
            assert(data.success === false, "Response success is false");
            assert(data.message.includes("Authorization token missing"), "Raw firebase_uid cannot authenticate");
        }

        // -------------------------------------------------------------
        // TEST 3: Invalid authorization format (not 'Bearer <token>')
        // -------------------------------------------------------------
        console.log("\nTEST 3: Invalid Authorization header format");
        {
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Basic invalid_format_token"
                }
            });
            const data = await res.json();
            assert(res.status === 401, `Status is 401 (got ${res.status})`);
            assert(data.success === false, "Response success is false");
            assert(data.message.includes("Invalid authorization format"), `Message indicates invalid format (got "${data.message}")`);
        }

        // -------------------------------------------------------------
        // TEST 4: Invalid / Malformed token string
        // -------------------------------------------------------------
        console.log("\nTEST 4: Invalid Firebase ID token");
        {
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer completely_fake_invalid_jwt_token"
                }
            });
            const data = await res.json();
            assert(res.status === 401, `Status is 401 (got ${res.status})`);
            assert(data.success === false, "Response success is false");
            assert(data.message.includes("Invalid or expired token"), `Message indicates invalid/expired token (got "${data.message}")`);
        }

        // -------------------------------------------------------------
        // TEST 5: Expired / Simulated token failure via verifyIdToken
        // -------------------------------------------------------------
        console.log("\nTEST 5: Expired Token Simulation");
        {
            const originalVerify = getAuth().verifyIdToken;
            // Mock verifyIdToken throwing expired error
            getAuth().verifyIdToken = async () => {
                const err = new Error("Firebase ID token has expired");
                err.code = "auth/id-token-expired";
                throw err;
            };

            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer expired_token_string"
                }
            });
            const data = await res.json();
            assert(res.status === 401, `Status is 401 for expired token (got ${res.status})`);
            assert(data.success === false, "Response success is false");
            assert(data.message.includes("Invalid or expired token"), `Message indicates invalid/expired (got "${data.message}")`);

            // Restore
            getAuth().verifyIdToken = originalVerify;
        }

        // -------------------------------------------------------------
        // TEST 6: Valid token via Authorization header
        // -------------------------------------------------------------
        console.log("\nTEST 6: Valid Token via Authorization Header");
        {
            const originalVerify = getAuth().verifyIdToken;
            // Mock verifyIdToken returning decoded token with TEST_USER.firebase_uid
            getAuth().verifyIdToken = async (tok) => {
                if (tok === "valid_mock_token_123") {
                    return {
                        uid: TEST_USER.firebase_uid,
                        email: TEST_USER.email,
                        email_verified: true
                    };
                }
                throw new Error("Invalid token");
            };

            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer valid_mock_token_123"
                }
            });
            const data = await res.json();
            assert(res.status === 200, `Status is 200 OK (got ${res.status})`);
            assert(data.success === true, "Response success is true");
            assert(data.message === "Login successful", `Message is 'Login successful' (got "${data.message}")`);
            assert(data.data && data.data.firebase_uid === TEST_USER.firebase_uid, "Returned user has matching verified firebase_uid");
            assert(data.data.email === TEST_USER.email, "Returned user has matching email");
            assert(data.data.password_hash === undefined, "Security: password_hash is NOT exposed in response");

            getAuth().verifyIdToken = originalVerify;
        }

        // -------------------------------------------------------------
        // TEST 7: Valid token via request body { idToken: "..." }
        // -------------------------------------------------------------
        console.log("\nTEST 7: Valid Token via Body { idToken }");
        {
            const originalVerify = getAuth().verifyIdToken;
            getAuth().verifyIdToken = async (tok) => {
                if (tok === "valid_body_token_456") {
                    return {
                        uid: TEST_USER.firebase_uid,
                        email: TEST_USER.email
                    };
                }
                throw new Error("Invalid token");
            };

            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ idToken: "valid_body_token_456" })
            });
            const data = await res.json();
            assert(res.status === 200, `Status is 200 OK (got ${res.status})`);
            assert(data.success === true, "Response success is true");
            assert(data.data.firebase_uid === TEST_USER.firebase_uid, "User authenticated via body idToken");

            getAuth().verifyIdToken = originalVerify;
        }

        // -------------------------------------------------------------
        // TEST 8: Anti-tampering — User cannot spoof another user's UID in body
        // -------------------------------------------------------------
        console.log("\nTEST 8: Anti-tampering (Request Parameter / Body Spoofing)");
        {
            const originalVerify = getAuth().verifyIdToken;
            getAuth().verifyIdToken = async () => {
                return {
                    uid: TEST_USER.firebase_uid,
                    email: TEST_USER.email
                };
            };

            // Malicious attacker sends body: { firebase_uid: "victim_uid", id: 9999 }
            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer valid_mock_token_123"
                },
                body: JSON.stringify({
                    firebase_uid: "victim_attacker_cannot_impersonate",
                    id: "9999",
                    email: "victim@example.com"
                })
            });
            const data = await res.json();
            assert(res.status === 200, `Status is 200 OK`);
            assert(data.data.firebase_uid === TEST_USER.firebase_uid, "Attacker UID ignored; strictly returns verified user's data");
            assert(data.data.firebase_uid !== "victim_attacker_cannot_impersonate", "Spoofed UID in body had zero effect");

            getAuth().verifyIdToken = originalVerify;
        }

        // -------------------------------------------------------------
        // TEST 9: Valid token for non-existent user in DB
        // -------------------------------------------------------------
        console.log("\nTEST 9: Valid Token for Non-Existent PostgreSQL User");
        {
            const originalVerify = getAuth().verifyIdToken;
            getAuth().verifyIdToken = async () => {
                return {
                    uid: "unknown_uid_never_in_postgres",
                    email: "unknown_user_never_registered@example.com"
                };
            };

            const res = await fetch(`${baseUrl}/api/auth/login`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer valid_mock_token_123"
                }
            });
            const data = await res.json();
            assert(res.status === 404, `Status is 404 Not Found (got ${res.status})`);
            assert(data.success === false, "Response success is false");
            assert(data.message === "User not found", `Message is 'User not found' (got "${data.message}")`);

            getAuth().verifyIdToken = originalVerify;
        }

        // -------------------------------------------------------------
        // TEST 10: Backward compatibility with /auth/login mount path
        // -------------------------------------------------------------
        console.log("\nTEST 10: /auth/login Mount Path Compatibility");
        {
            const res = await fetch(`${baseUrl}/auth/login`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({})
            });
            const data = await res.json();
            assert(res.status === 401, `Status is 401 on /auth/login (got ${res.status})`);
            assert(data.message.includes("Authorization token missing"), "Both /api/auth/login and /auth/login work");
        }

    } catch (err) {
        console.error("Test execution error:", err);
        failed++;
    } finally {
        await teardown();
    }

    console.log("\n=========================================");
    console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
    console.log("=========================================\n");

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests();
