import app from "./src/app.js";
import pool from "./src/config/db.js";
import { getAuth } from "firebase-admin/auth";

let server;
let port;
let baseUrl;

const REG_USER_1 = {
  uid: "test_reg_uid_" + Date.now(),
  email: "new_reg_user_" + Date.now() + "@example.com",
  name: "New Registered User",
  token: "token_reg_valid_1"
};

const REG_USER_2 = {
  uid: "test_reg_uid_2_" + Date.now(),
  email: "new_reg_user_2_" + Date.now() + "@example.com",
  name: "Second Reg User",
  token: "token_reg_valid_2"
};

let createdUserIds = [];

async function setup() {
  return new Promise((resolve) => {
    server = app.listen(0, async () => {
      port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`Test server started on ${baseUrl}`);
      resolve();
    });
  });
}

async function teardown() {
  try {
    for (const id of createdUserIds) {
      await pool.query("DELETE FROM users WHERE id = $1", [id]);
    }
    // Also clean up by UIDs just in case
    await pool.query("DELETE FROM users WHERE firebase_uid IN ($1, $2)", [REG_USER_1.uid, REG_USER_2.uid]);
    console.log("Cleaned up test registration users from database.");
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
  console.log("\n=======================================================");
  console.log("RUNNING USER REGISTRATION & SYNC BACKEND TESTS");
  console.log("=======================================================\n");

  const originalVerify = getAuth().verifyIdToken;

  getAuth().verifyIdToken = async (tok) => {
    if (tok === REG_USER_1.token) {
      return { uid: REG_USER_1.uid, email: REG_USER_1.email };
    }
    if (tok === REG_USER_2.token) {
      return { uid: REG_USER_2.uid, email: REG_USER_2.email, name: REG_USER_2.name };
    }
    if (tok === "token_no_email") {
      return { uid: "uid_no_email_123" };
    }
    throw new Error("Invalid or expired token");
  };

  try {
    await setup();

    // -------------------------------------------------------------
    // TEST 1: Missing Token (401)
    // -------------------------------------------------------------
    console.log("TEST 1: Missing Firebase ID token on registration");
    {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Alice" }),
      });
      const data = await res.json();
      assert(res.status === 401, `Status is 401 Unauthorized (got ${res.status})`);
      assert(data.success === false, "Response success is false");
      assert(data.message.includes("Authorization token missing"), "Message indicates token missing");
    }

    // -------------------------------------------------------------
    // TEST 2: Invalid / Expired Token (401)
    // -------------------------------------------------------------
    console.log("\nTEST 2: Invalid Firebase ID token on registration");
    {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer invalid_token_xyz",
        },
        body: JSON.stringify({ name: "Alice" }),
      });
      const data = await res.json();
      assert(res.status === 401, `Status is 401 Unauthorized (got ${res.status})`);
      assert(data.success === false, "Response success is false");
      assert(data.message.includes("Invalid or expired token"), "Message indicates invalid/expired token");
    }

    // -------------------------------------------------------------
    // TEST 3: Missing Required Input Fields (400)
    // -------------------------------------------------------------
    console.log("\nTEST 3: Missing name field (400 Bad Request)");
    {
      // Missing name
      const res1 = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${REG_USER_1.token}`,
        },
        body: JSON.stringify({ name: "" }),
      });
      const data1 = await res1.json();
      assert(res1.status === 400, `Empty name rejected with 400 (got ${res1.status})`);
      assert(data1.message.includes("Name is required"), "Message indicates name is required");

      // Whitespace only
      const res2 = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${REG_USER_1.token}`,
        },
        body: JSON.stringify({ name: "   " }),
      });
      assert(res2.status === 400, "Whitespace-only name rejected with 400");

      // Token missing email
      const res3 = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer token_no_email",
        },
        body: JSON.stringify({ name: "No Email" }),
      });
      const data3 = await res3.json();
      assert(res3.status === 400, "Token without email rejected with 400");
      assert(data3.message.includes("verified email"), "Message indicates token lacks email");
    }

    // -------------------------------------------------------------
    // TEST 4: Successful Registration & DB Insertion (201)
    // -------------------------------------------------------------
    console.log("\nTEST 4: Successful registration & PostgreSQL synchronization");
    {
      const res = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${REG_USER_1.token}`,
        },
        body: JSON.stringify({
          name: REG_USER_1.name,
          // Attacker attempts to spoof email & UID in body
          email: "spoofed_email@attacker.com",
          firebase_uid: "spoofed_uid_12345",
          password_hash: "attacker_plain_password",
        }),
      });

      const data = await res.json();
      assert(res.status === 201, `Status is 201 Created (got ${res.status})`);
      assert(data.success === true, "Response success is true");
      assert(data.message === "User registered successfully", "Message confirmed");
      assert(data.data.name === REG_USER_1.name, "User name matches");
      assert(data.data.email === REG_USER_1.email, "User email taken strictly from verified token, ignoring spoofed body");
      assert(data.data.firebase_uid === REG_USER_1.uid, "User firebase_uid taken strictly from verified token, ignoring spoofed body");
      assert(data.data.password_hash === undefined, "Security: password_hash is NOT exposed in response");

      createdUserIds.push(data.data.id);

      // Verify in PostgreSQL directly that password_hash is NULL and credentials are secure
      const dbRow = await pool.query("SELECT * FROM users WHERE id = $1", [data.data.id]);
      assert(dbRow.rows.length === 1, "User record found in PostgreSQL database");
      assert(dbRow.rows[0].password_hash === null, "Security: password_hash in DB is NULL (no raw/hash passwords stored)");
      assert(dbRow.rows[0].firebase_uid === REG_USER_1.uid, "Database record bound to verified UID");
    }

    // -------------------------------------------------------------
    // TEST 5: Duplicate Registration Prevention (409 Conflict)
    // -------------------------------------------------------------
    console.log("\nTEST 5: Duplicate registration prevention (409 Conflict)");
    {
      // Attempt duplicate registration with same token / UID
      const resDuplicateUid = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${REG_USER_1.token}`,
        },
        body: JSON.stringify({ name: "Duplicate Attempt" }),
      });
      const dataDuplicateUid = await resDuplicateUid.json();
      assert(resDuplicateUid.status === 409, `Duplicate UID rejected with 409 (got ${resDuplicateUid.status})`);
      assert(dataDuplicateUid.success === false, "Duplicate UID response success is false");
      assert(dataDuplicateUid.message.includes("already exists"), `Message indicates duplicate: "${dataDuplicateUid.message}"`);

      // Attempt registration with new UID but collision with existing email
      const collisionToken = "token_collision";
      getAuth().verifyIdToken = async (tok) => {
        if (tok === collisionToken) {
          return { uid: "different_new_uid_999", email: REG_USER_1.email, name: "Colliding Email" };
        }
        if (tok === REG_USER_2.token) {
          return { uid: REG_USER_2.uid, email: REG_USER_2.email, name: REG_USER_2.name };
        }
        throw new Error("Invalid token");
      };

      const resCollisionEmail = await fetch(`${baseUrl}/api/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${collisionToken}`,
        },
        body: JSON.stringify({ name: "Collision User" }),
      });
      const dataCollisionEmail = await resCollisionEmail.json();
      assert(resCollisionEmail.status === 409, `Duplicate email rejected with 409 (got ${resCollisionEmail.status})`);
      assert(dataCollisionEmail.message.includes("already exists"), "Duplicate email message confirmed");
    }

    // -------------------------------------------------------------
    // TEST 6: Automatic Login of Newly Registered User
    // -------------------------------------------------------------
    console.log("\nTEST 6: Immediate login with newly registered user credentials");
    {
      // Restore verifyIdToken
      getAuth().verifyIdToken = async (tok) => {
        if (tok === REG_USER_1.token) {
          return { uid: REG_USER_1.uid, email: REG_USER_1.email };
        }
        throw new Error("Invalid token");
      };

      const resLogin = await fetch(`${baseUrl}/api/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${REG_USER_1.token}`,
        },
      });
      const dataLogin = await resLogin.json();
      assert(resLogin.status === 200, `Login returns 200 OK for newly registered user (got ${resLogin.status})`);
      assert(dataLogin.success === true, "Login success is true");
      assert(dataLogin.data.firebase_uid === REG_USER_1.uid, "Login returns the registered user profile");
    }

    // -------------------------------------------------------------
    // TEST 7: Register Mount Path Compatibility (/auth/register)
    // -------------------------------------------------------------
    console.log("\nTEST 7: Route mount compatibility (/auth/register)");
    {
      getAuth().verifyIdToken = async (tok) => {
        if (tok === REG_USER_2.token) {
          return { uid: REG_USER_2.uid, email: REG_USER_2.email, name: REG_USER_2.name };
        }
        throw new Error("Invalid token");
      };

      const res = await fetch(`${baseUrl}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${REG_USER_2.token}`,
        },
        body: JSON.stringify({ name: REG_USER_2.name }),
      });
      const data = await res.json();
      assert(res.status === 201, `Status is 201 on /auth/register alias (got ${res.status})`);
      assert(data.success === true, "Registration succeeded on /auth/register");
      createdUserIds.push(data.data.id);
    }

  } catch (err) {
    console.error("Test execution error:", err);
    failed++;
  } finally {
    getAuth().verifyIdToken = originalVerify;
    await teardown();
  }

  console.log("\n=======================================================");
  console.log(`TEST RESULTS: ${passed} passed, ${failed} failed`);
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests();
