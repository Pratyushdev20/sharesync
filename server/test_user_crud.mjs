import app from "./src/app.js";
import pool from "./src/config/db.js";
import { getAuth } from "firebase-admin/auth";

let server;
let port;
let baseUrl;

// Two distinct test users to test ownership & isolation
const USER_A = {
    firebase_uid: "test_crud_user_A_" + Date.now(),
    name: "User Alice",
    email: "alice_" + Date.now() + "@example.com",
    token: "token_user_A"
};

const USER_B = {
    firebase_uid: "test_crud_user_B_" + Date.now(),
    name: "User Bob",
    email: "bob_" + Date.now() + "@example.com",
    token: "token_user_B"
};

let userAId;
let userBId;

async function setup() {
    return new Promise((resolve) => {
        server = app.listen(0, async () => {
            port = server.address().port;
            baseUrl = `http://localhost:${port}`;
            console.log(`Test server started on ${baseUrl}`);

            // Insert User B directly into DB (representing another user's pre-existing record)
            const resB = await pool.query(
                "INSERT INTO users (name, email, password_hash, firebase_uid) VALUES ($1, $2, $3, $4) RETURNING id",
                [USER_B.name, USER_B.email, "secret_hash_b", USER_B.firebase_uid]
            );
            userBId = resB.rows[0].id;
            console.log(`Pre-created User B in DB with id: ${userBId}, uid: ${USER_B.firebase_uid}`);

            resolve();
        });
    });
}

async function teardown() {
    try {
        if (userAId) {
            await pool.query("DELETE FROM users WHERE id = $1", [userAId]);
        }
        if (userBId) {
            await pool.query("DELETE FROM users WHERE id = $1", [userBId]);
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
    console.log("RUNNING USER CRUD SECURITY TESTS");
    console.log("=========================================\n");

    const originalVerify = getAuth().verifyIdToken;

    // Mock verifyIdToken to recognise USER_A and USER_B
    getAuth().verifyIdToken = async (tok) => {
        if (tok === USER_A.token) {
            return { uid: USER_A.firebase_uid, email: USER_A.email };
        }
        if (tok === USER_B.token) {
            return { uid: USER_B.firebase_uid, email: USER_B.email };
        }
        throw new Error("Invalid or expired token");
    };

    try {
        await setup();

        // -------------------------------------------------------------
        // TEST 1: 401 Unauthorized on all routes without token
        // -------------------------------------------------------------
        console.log("TEST 1: 401 on unauthenticated access across all CRUD routes");
        {
            // GET /api/users
            const r1 = await fetch(`${baseUrl}/api/users`);
            assert(r1.status === 401, `GET /api/users returns 401 without auth (got ${r1.status})`);

            // POST /api/users
            const r2 = await fetch(`${baseUrl}/api/users`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Hacker" })
            });
            assert(r2.status === 401, `POST /api/users returns 401 without auth (got ${r2.status})`);

            // GET /api/users/:id
            const r3 = await fetch(`${baseUrl}/api/users/${userBId}`);
            assert(r3.status === 401, `GET /api/users/:id returns 401 without auth (got ${r3.status})`);

            // PATCH /api/users/:id
            const r4 = await fetch(`${baseUrl}/api/users/${userBId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Hacker" })
            });
            assert(r4.status === 401, `PATCH /api/users/:id returns 401 without auth (got ${r4.status})`);

            // DELETE /api/users/:id
            const r5 = await fetch(`${baseUrl}/api/users/${userBId}`, {
                method: "DELETE"
            });
            assert(r5.status === 401, `DELETE /api/users/:id returns 401 without auth (got ${r5.status})`);
        }

        // -------------------------------------------------------------
        // TEST 2: POST /api/users (Create user for User A)
        // -------------------------------------------------------------
        console.log("\nTEST 2: POST /api/users (Create User)");
        {
            // User A creates their own user
            const res = await fetch(`${baseUrl}/api/users`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${USER_A.token}`
                },
                body: JSON.stringify({
                    name: USER_A.name,
                    email: USER_A.email,
                    password_hash: "should_be_hidden"
                })
            });
            const data = await res.json();
            assert(res.status === 201, `Status is 201 Created (got ${res.status})`);
            assert(data.success === true, "Response success is true");
            assert(data.data.firebase_uid === USER_A.firebase_uid, "Created user bound to verified Firebase UID");
            assert(data.data.name === USER_A.name, "Name matches");
            assert(data.data.password_hash === undefined, "Security: password_hash is NOT exposed in response");
            userAId = data.data.id;
        }

        // -------------------------------------------------------------
        // TEST 3: POST /api/users - Impersonation prevention (403)
        // -------------------------------------------------------------
        console.log("\nTEST 3: POST /api/users - Reject spoofed firebase_uid (403)");
        {
            // User A tries to pass User B's firebase_uid in body
            const res = await fetch(`${baseUrl}/api/users`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${USER_A.token}`
                },
                body: JSON.stringify({
                    name: "Impersonator",
                    email: "spoof@example.com",
                    firebase_uid: USER_B.firebase_uid
                })
            });
            const data = await res.json();
            assert(res.status === 403, `Status is 403 Forbidden for mismatched firebase_uid (got ${res.status})`);
            assert(data.success === false, "Response success is false");
            assert(data.message.includes("Forbidden"), `Message indicates forbidden (got "${data.message}")`);
        }

        // -------------------------------------------------------------
        // TEST 4: GET /api/users (List - Ownership isolation)
        // -------------------------------------------------------------
        console.log("\nTEST 4: GET /api/users - Returns only authenticated user's records");
        {
            const res = await fetch(`${baseUrl}/api/users`, {
                headers: { "Authorization": `Bearer ${USER_A.token}` }
            });
            const data = await res.json();
            assert(res.status === 200, `Status is 200 OK (got ${res.status})`);
            assert(Array.isArray(data.data), "data is an array");
            assert(data.data.length === 1, `Returns exactly 1 user (got ${data.data.length})`);
            assert(data.data[0].id === userAId, "Only returns User A's record");
            assert(!data.data.some(u => u.id === userBId), "User B's record is completely hidden from User A");
            assert(data.data[0].password_hash === undefined, "Security: password_hash is NOT exposed in list");
        }

        // -------------------------------------------------------------
        // TEST 5: GET /api/users/:id (Read by ID - Ownership enforcement)
        // -------------------------------------------------------------
        console.log("\nTEST 5: GET /api/users/:id - Owner allowed (200), non-owner rejected (403)");
        {
            // User A accesses their own record
            const resOwner = await fetch(`${baseUrl}/api/users/${userAId}`, {
                headers: { "Authorization": `Bearer ${USER_A.token}` }
            });
            const dataOwner = await resOwner.json();
            assert(resOwner.status === 200, `Owner gets 200 OK (got ${resOwner.status})`);
            assert(dataOwner.data.id === userAId, "Owner receives their own record");
            assert(dataOwner.data.password_hash === undefined, "Security: password_hash is NOT exposed");

            // User A attempts to access User B's record
            const resOther = await fetch(`${baseUrl}/api/users/${userBId}`, {
                headers: { "Authorization": `Bearer ${USER_A.token}` }
            });
            const dataOther = await resOther.json();
            assert(resOther.status === 403, `User A accessing User B gets 403 Forbidden (got ${resOther.status})`);
            assert(dataOther.success === false, "Response success is false");
            assert(dataOther.message.includes("Forbidden"), `Message indicates forbidden (got "${dataOther.message}")`);

            // Non-existent ID -> 404
            const res404 = await fetch(`${baseUrl}/api/users/9999999`, {
                headers: { "Authorization": `Bearer ${USER_A.token}` }
            });
            const data404 = await res404.json();
            assert(res404.status === 404, `Non-existent ID gets 404 Not Found (got ${res404.status})`);
            assert(data404.message.includes("User not found"), `Message indicates user not found (got "${data404.message}")`);
        }

        // -------------------------------------------------------------
        // TEST 6: PATCH /api/users/:id (Update - Ownership enforcement)
        // -------------------------------------------------------------
        console.log("\nTEST 6: PATCH /api/users/:id - Owner updates (200), non-owner rejected (403)");
        {
            // User A attempts to update User B's record
            const resOther = await fetch(`${baseUrl}/api/users/${userBId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${USER_A.token}`
                },
                body: JSON.stringify({ name: "Alice Hacked Bob" })
            });
            const dataOther = await resOther.json();
            assert(resOther.status === 403, `User A updating User B gets 403 Forbidden (got ${resOther.status})`);
            assert(dataOther.success === false, "Response success is false");

            // User A updates their own record
            const updatedName = "Alice Updated Name";
            const resOwner = await fetch(`${baseUrl}/api/users/${userAId}`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${USER_A.token}`
                },
                body: JSON.stringify({ name: updatedName })
            });
            const dataOwner = await resOwner.json();
            assert(resOwner.status === 200, `Owner gets 200 OK on update (got ${resOwner.status})`);
            assert(dataOwner.data.name === updatedName, `Updated name reflected: "${dataOwner.data.name}"`);
            assert(dataOwner.data.password_hash === undefined, "Security: password_hash is NOT exposed");

            // Non-existent ID -> 404
            const res404 = await fetch(`${baseUrl}/api/users/9999999`, {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${USER_A.token}`
                },
                body: JSON.stringify({ name: "Ghost" })
            });
            assert(res404.status === 404, `PATCH non-existent ID gets 404 (got ${res404.status})`);
        }

        // -------------------------------------------------------------
        // TEST 7: DELETE /api/users/:id (Delete - Ownership enforcement)
        // -------------------------------------------------------------
        console.log("\nTEST 7: DELETE /api/users/:id - Owner deletes (200), non-owner rejected (403)");
        {
            // User A attempts to delete User B's record
            const resOther = await fetch(`${baseUrl}/api/users/${userBId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${USER_A.token}` }
            });
            const dataOther = await resOther.json();
            assert(resOther.status === 403, `User A deleting User B gets 403 Forbidden (got ${resOther.status})`);
            assert(dataOther.success === false, "Response success is false");

            // Non-existent ID -> 404
            const res404 = await fetch(`${baseUrl}/api/users/9999999`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${USER_A.token}` }
            });
            assert(res404.status === 404, `DELETE non-existent ID gets 404 (got ${res404.status})`);

            // User A deletes their own record
            const resOwner = await fetch(`${baseUrl}/api/users/${userAId}`, {
                method: "DELETE",
                headers: { "Authorization": `Bearer ${USER_A.token}` }
            });
            const dataOwner = await resOwner.json();
            assert(resOwner.status === 200, `Owner gets 200 OK on delete (got ${resOwner.status})`);
            assert(dataOwner.success === true, "Response success is true");
            assert(dataOwner.data.id === userAId, "Deleted user record returned");
            assert(dataOwner.data.password_hash === undefined, "Security: password_hash is NOT exposed");

            // Verify User A record is really deleted (subsequent GET returns 404)
            const resCheck = await fetch(`${baseUrl}/api/users/${userAId}`, {
                headers: { "Authorization": `Bearer ${USER_A.token}` }
            });
            assert(resCheck.status === 404, `Subsequent GET returns 404 Not Found (got ${resCheck.status})`);
            userAId = null; // Mark cleaned up
        }

        // -------------------------------------------------------------
        // TEST 8: Verify /users prefix compatibility
        // -------------------------------------------------------------
        console.log("\nTEST 8: Route mount compatibility with /users prefix");
        {
            const res = await fetch(`${baseUrl}/users/${userBId}`, {
                headers: { "Authorization": `Bearer ${USER_B.token}` }
            });
            const data = await res.json();
            assert(res.status === 200, `GET /users/:id returns 200 OK for owner (got ${res.status})`);
            assert(data.data.id === userBId, "User B retrieved via /users prefix");
        }

    } catch (err) {
        console.error("Test execution error:", err);
        failed++;
    } finally {
        getAuth().verifyIdToken = originalVerify;
        await teardown();
    }

    console.log("\n=========================================");
    console.log(`USER CRUD TESTS: ${passed} passed, ${failed} failed`);
    console.log("=========================================\n");

    if (failed > 0) {
        process.exit(1);
    } else {
        process.exit(0);
    }
}

runTests();
