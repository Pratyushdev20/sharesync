import app from "./src/app.js";
import pool from "./src/config/db.js";
import { getAuth } from "firebase-admin/auth";

let server;
let port;
let baseUrl;

const USER_A = {
    firebase_uid: "test_folder_user_A_" + Date.now(),
    name: "Folder User Alice",
    email: "alice_folder_" + Date.now() + "@example.com",
    token: "token_folder_user_A"
};

const USER_B = {
    firebase_uid: "test_folder_user_B_" + Date.now(),
    name: "Folder User Bob",
    email: "bob_folder_" + Date.now() + "@example.com",
    token: "token_folder_user_B"
};

let userAId;
let userBId;
let createdFolderIds = [];
let createdFileIds = [];

async function setup() {
    return new Promise((resolve) => {
        server = app.listen(0, async () => {
            port = server.address().port;
            baseUrl = `http://localhost:${port}`;
            console.log(`Test server running at ${baseUrl}`);

            // Pre-create users in DB
            const resA = await pool.query(
                "INSERT INTO users (name, email, firebase_uid) VALUES ($1, $2, $3) RETURNING id",
                [USER_A.name, USER_A.email, USER_A.firebase_uid]
            );
            userAId = resA.rows[0].id;

            const resB = await pool.query(
                "INSERT INTO users (name, email, firebase_uid) VALUES ($1, $2, $3) RETURNING id",
                [USER_B.name, USER_B.email, USER_B.firebase_uid]
            );
            userBId = resB.rows[0].id;

            resolve();
        });
    });
}

async function teardown() {
    try {
        if (createdFileIds.length > 0) {
            await pool.query("DELETE FROM files WHERE id = ANY($1)", [createdFileIds]);
        }
        if (createdFolderIds.length > 0) {
            // Delete in reverse order to handle nesting safely
            for (const fId of createdFolderIds.reverse()) {
                await pool.query("DELETE FROM folders WHERE id = $1", [fId]);
            }
        }
        if (userAId) {
            await pool.query("DELETE FROM users WHERE id = $1", [userAId]);
        }
        if (userBId) {
            await pool.query("DELETE FROM users WHERE id = $1", [userBId]);
        }
    } catch (err) {
        console.error("Teardown error:", err.message);
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
    console.log("RUNNING FOLDER MANAGEMENT API TESTS");
    console.log("=========================================\n");

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
        // SECTION 1: AUTHENTICATION ENFORCEMENT (401)
        // -------------------------------------------------------------
        console.log("\n--- SECTION 1: Authentication Enforcement (401) ---");
        {
            // Missing token
            const r1 = await fetch(`${baseUrl}/api/folders`);
            assert(r1.status === 401, `GET /api/folders returns 401 without auth (got ${r1.status})`);

            const r2 = await fetch(`${baseUrl}/api/folders`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Documents" })
            });
            assert(r2.status === 401, `POST /api/folders returns 401 without auth (got ${r2.status})`);

            const r3 = await fetch(`${baseUrl}/api/folders/1`);
            assert(r3.status === 401, `GET /api/folders/:id returns 401 without auth (got ${r3.status})`);

            const r4 = await fetch(`${baseUrl}/api/folders/1`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "Renamed" })
            });
            assert(r4.status === 401, `PATCH /api/folders/:id returns 401 without auth (got ${r4.status})`);

            const r5 = await fetch(`${baseUrl}/api/folders/1`, { method: "DELETE" });
            assert(r5.status === 401, `DELETE /api/folders/:id returns 401 without auth (got ${r5.status})`);

            // Invalid token
            const r6 = await fetch(`${baseUrl}/api/folders`, {
                headers: { Authorization: "Bearer bad_token" }
            });
            assert(r6.status === 401, `GET /api/folders returns 401 with invalid token (got ${r6.status})`);
        }

        // -------------------------------------------------------------
        // SECTION 2: INPUT VALIDATION (400)
        // -------------------------------------------------------------
        console.log("\n--- SECTION 2: Input Validation (400) ---");
        {
            // Missing name
            const r1 = await fetch(`${baseUrl}/api/folders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({})
            });
            assert(r1.status === 400, `POST /api/folders returns 400 for missing name (got ${r1.status})`);

            // Whitespace name
            const r2 = await fetch(`${baseUrl}/api/folders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "   " })
            });
            assert(r2.status === 400, `POST /api/folders returns 400 for whitespace name (got ${r2.status})`);

            // Invalid characters (traversal / path separator)
            const r3 = await fetch(`${baseUrl}/api/folders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "foo/bar" })
            });
            assert(r3.status === 400, `POST /api/folders returns 400 for name containing slash (got ${r3.status})`);

            // Dot names
            const r4 = await fetch(`${baseUrl}/api/folders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: ".." })
            });
            assert(r4.status === 400, `POST /api/folders returns 400 for name '..' (got ${r4.status})`);

            // Invalid parent ID
            const r5 = await fetch(`${baseUrl}/api/folders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "Sub", parent_folder_id: "not_a_number" })
            });
            assert(r5.status === 400, `POST /api/folders returns 400 for non-numeric parent_folder_id (got ${r5.status})`);

            // Invalid folder ID in route params
            const r6 = await fetch(`${baseUrl}/api/folders/invalid_id`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r6.status === 400, `GET /api/folders/invalid_id returns 400 for bad ID (got ${r6.status})`);

            const r7 = await fetch(`${baseUrl}/api/folders/invalid_id`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "New" })
            });
            assert(r7.status === 400, `PATCH /api/folders/invalid_id returns 400 for bad ID (got ${r7.status})`);

            const r8 = await fetch(`${baseUrl}/api/folders/invalid_id`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r8.status === 400, `DELETE /api/folders/invalid_id returns 400 for bad ID (got ${r8.status})`);
        }

        // -------------------------------------------------------------
        // SECTION 3: FOLDER CREATION & NESTED FOLDERS
        // -------------------------------------------------------------
        console.log("\n--- SECTION 3: Folder Creation & Nested Folders ---");
        let rootFolderA;
        let subfolderA;
        let subSubfolderA;
        let rootFolderB;
        {
            // USER_A creates root folder "Documents"
            const r1 = await fetch(`${baseUrl}/api/folders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "Documents" })
            });
            const d1 = await r1.json();
            assert(r1.status === 201, `POST /api/folders returns 201 for root folder (got ${r1.status})`);
            assert(d1.success === true, "Response has success: true");
            assert(d1.data && d1.data.name === "Documents", `Created folder name is 'Documents' (got ${d1.data?.name})`);
            assert(d1.data.parent_folder_id === null, "Root folder parent_folder_id is null");
            assert(d1.data.owner_firebase_uid === USER_A.firebase_uid, "Folder owner_firebase_uid matches User A");
            rootFolderA = d1.data;
            createdFolderIds.push(rootFolderA.id);

            // USER_A creates subfolder "Projects" under "Documents"
            const r2 = await fetch(`${baseUrl}/api/folders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "Projects", parent_folder_id: rootFolderA.id })
            });
            const d2 = await r2.json();
            assert(r2.status === 201, `POST /api/folders returns 201 for subfolder (got ${r2.status})`);
            assert(String(d2.data.parent_folder_id) === String(rootFolderA.id), `Subfolder parent_folder_id matches root (got ${d2.data?.parent_folder_id})`);
            subfolderA = d2.data;
            createdFolderIds.push(subfolderA.id);

            // USER_A creates deep nested subfolder "ShareSync" under "Projects"
            const r3 = await fetch(`${baseUrl}/api/folders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "ShareSync", parent_folder_id: subfolderA.id })
            });
            const d3 = await r3.json();
            assert(r3.status === 201, `POST /api/folders returns 201 for deep nested folder (got ${r3.status})`);
            subSubfolderA = d3.data;
            createdFolderIds.push(subSubfolderA.id);

            // Duplicate root folder name for USER_A -> 409
            const r4 = await fetch(`${baseUrl}/api/folders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "Documents" })
            });
            assert(r4.status === 409, `POST /api/folders returns 409 for duplicate root name (got ${r4.status})`);

            // Duplicate subfolder name inside "Documents" -> 409
            const r5 = await fetch(`${baseUrl}/api/folders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "Projects", parent_folder_id: rootFolderA.id })
            });
            assert(r5.status === 409, `POST /api/folders returns 409 for duplicate subfolder name (got ${r5.status})`);

            // Creating nested folder under non-existent parent -> 404
            const r6 = await fetch(`${baseUrl}/api/folders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "Ghost", parent_folder_id: 999999 })
            });
            assert(r6.status === 404, `POST /api/folders returns 404 for non-existent parent (got ${r6.status})`);

            // USER_B creates their own root folder "BobFiles"
            const r7 = await fetch(`${baseUrl}/api/folders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${USER_B.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "BobFiles" })
            });
            assert(r7.status === 201, `User B can create their own root folder (got ${r7.status})`);
            const d7 = await r7.json();
            rootFolderB = d7.data;
            createdFolderIds.push(rootFolderB.id);

            // Cross-user parent ownership violation: USER_B tries to create folder inside USER_A's "Documents" -> 403
            const r8 = await fetch(`${baseUrl}/api/folders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${USER_B.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "Infiltrator", parent_folder_id: rootFolderA.id })
            });
            assert(r8.status === 403, `POST /api/folders returns 403 when creating under another user's parent (got ${r8.status})`);
        }

        // -------------------------------------------------------------
        // SECTION 4: LIST FOLDERS & QUERY FILTERING
        // -------------------------------------------------------------
        console.log("\n--- SECTION 4: List Folders & Query Filtering ---");
        {
            // USER_A lists all folders
            const r1 = await fetch(`${baseUrl}/api/folders`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            const d1 = await r1.json();
            assert(r1.status === 200, `GET /api/folders returns 200 (got ${r1.status})`);
            assert(Array.isArray(d1.data), "GET /api/folders returns an array");
            const namesA = d1.data.map(f => f.name);
            assert(namesA.includes("Documents") && namesA.includes("Projects") && namesA.includes("ShareSync"),
                "User A sees all their folders");
            assert(!namesA.includes("BobFiles"), "User A does NOT see User B's folder");

            // USER_A filters by root folders: ?parent_folder_id=root
            const r2 = await fetch(`${baseUrl}/api/folders?parent_folder_id=root`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            const d2 = await r2.json();
            assert(r2.status === 200, "GET /api/folders?parent_folder_id=root returns 200");
            const rootNames = d2.data.map(f => f.name);
            assert(rootNames.includes("Documents") && !rootNames.includes("Projects"),
                "Root filter returns only root folders");

            // USER_A filters by subfolders of "Documents": ?parent_folder_id=${rootFolderA.id}
            const r3 = await fetch(`${baseUrl}/api/folders?parent_folder_id=${rootFolderA.id}`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            const d3 = await r3.json();
            assert(r3.status === 200, `GET children of parent returns 200`);
            assert(d3.data.length === 1 && d3.data[0].name === "Projects",
                "Subfolder query returns exactly 'Projects'");

            // USER_B attempts to query children of USER_A's folder -> 403 Forbidden
            const r4 = await fetch(`${baseUrl}/api/folders?parent_folder_id=${rootFolderA.id}`, {
                headers: { Authorization: `Bearer ${USER_B.token}` }
            });
            assert(r4.status === 403, `GET with another user's parent_folder_id returns 403 (got ${r4.status})`);
        }

        // -------------------------------------------------------------
        // SECTION 5: GET FOLDER BY ID & STRICT OWNERSHIP
        // -------------------------------------------------------------
        console.log("\n--- SECTION 5: Get Folder By ID & Strict Ownership ---");
        {
            // USER_A gets "Documents" by ID
            const r1 = await fetch(`${baseUrl}/api/folders/${rootFolderA.id}`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            const d1 = await r1.json();
            assert(r1.status === 200, `GET /api/folders/:id returns 200 for owner (got ${r1.status})`);
            assert(d1.data && d1.data.name === "Documents", "Returns correct folder name");
            assert(Array.isArray(d1.data.subfolders), "Includes subfolders array");
            assert(d1.data.subfolders.some(sf => sf.name === "Projects"), "Subfolders contains 'Projects'");

            // USER_B tries to access USER_A's folder -> 403 Forbidden
            const r2 = await fetch(`${baseUrl}/api/folders/${rootFolderA.id}`, {
                headers: { Authorization: `Bearer ${USER_B.token}` }
            });
            assert(r2.status === 403, `GET /api/folders/:id returns 403 for non-owner (got ${r2.status})`);

            // Non-existent folder ID -> 404 Not Found
            const r3 = await fetch(`${baseUrl}/api/folders/999999`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r3.status === 404, `GET /api/folders/999999 returns 404 for missing folder (got ${r3.status})`);
        }

        // -------------------------------------------------------------
        // SECTION 6: RENAME FOLDER (200, 403, 404, 409)
        // -------------------------------------------------------------
        console.log("\n--- SECTION 6: Rename Folder ---");
        {
            // USER_A creates second subfolder "Personal" under "Documents"
            const rCreate = await fetch(`${baseUrl}/api/folders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "Personal", parent_folder_id: rootFolderA.id })
            });
            const dCreate = await rCreate.json();
            const personalFolder = dCreate.data;
            createdFolderIds.push(personalFolder.id);

            // USER_A renames "Projects" to "Work Projects"
            const r1 = await fetch(`${baseUrl}/api/folders/${subfolderA.id}`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "Work Projects" })
            });
            const d1 = await r1.json();
            assert(r1.status === 200, `PATCH /api/folders/:id returns 200 for rename (got ${r1.status})`);
            assert(d1.data.name === "Work Projects", `Folder name updated to 'Work Projects' (got ${d1.data.name})`);

            // PUT route alias also works
            const rPut = await fetch(`${baseUrl}/api/folders/${subfolderA.id}`, {
                method: "PUT",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "Work Projects" })
            });
            assert(rPut.status === 200, `PUT /api/folders/:id also succeeds (got ${rPut.status})`);

            // Renaming to same name is idempotent
            assert(rPut.status === 200, "Idempotent rename succeeds");

            // Name collision: USER_A tries to rename "Personal" to "Work Projects" -> 409
            const r2 = await fetch(`${baseUrl}/api/folders/${personalFolder.id}`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "Work Projects" })
            });
            assert(r2.status === 409, `PATCH /api/folders/:id returns 409 for name collision in same parent (got ${r2.status})`);

            // USER_B tries to rename USER_A's folder -> 403 Forbidden
            const r3 = await fetch(`${baseUrl}/api/folders/${subfolderA.id}`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${USER_B.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "Hacked Name" })
            });
            assert(r3.status === 403, `PATCH /api/folders/:id returns 403 for non-owner (got ${r3.status})`);

            // Renaming non-existent folder -> 404
            const r4 = await fetch(`${baseUrl}/api/folders/999999`, {
                method: "PATCH",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "Phantom" })
            });
            assert(r4.status === 404, `PATCH /api/folders/999999 returns 404 for missing folder (got ${r4.status})`);
        }

        // -------------------------------------------------------------
        // SECTION 7: UNSAFE DELETION REJECTION (400)
        // -------------------------------------------------------------
        console.log("\n--- SECTION 7: Unsafe Deletion Prevention ---");
        let folderWithFile;
        {
            // USER_A tries to delete "Documents" (has subfolders "Work Projects" and "Personal") -> 400
            const r1 = await fetch(`${baseUrl}/api/folders/${rootFolderA.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            const d1 = await r1.json();
            assert(r1.status === 400, `DELETE returns 400 when folder contains subfolders (got ${r1.status})`);
            assert(d1.message.includes("contains subfolders"), `Error message mentions subfolders: "${d1.message}"`);

            // Create a test folder and insert a file into it to test file containment rejection
            const rCreateFolder = await fetch(`${baseUrl}/api/folders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "FileContainer" })
            });
            const dCreateFolder = await rCreateFolder.json();
            folderWithFile = dCreateFolder.data;
            createdFolderIds.push(folderWithFile.id);

            // Insert file linked to this folder
            const resFile = await pool.query(
                `INSERT INTO files (name, size, mime_type, storage_path, owner_id, folder_id)
                 VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                ["test.pdf", 1024, "application/pdf", "/test/path/test.pdf", userAId, folderWithFile.id]
            );
            createdFileIds.push(resFile.rows[0].id);

            // Try to delete folder containing file -> 400
            const r2 = await fetch(`${baseUrl}/api/folders/${folderWithFile.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            const d2 = await r2.json();
            assert(r2.status === 400, `DELETE returns 400 when folder contains files (got ${r2.status})`);
            assert(d2.message.includes("contains files"), `Error message mentions files: "${d2.message}"`);
        }

        // -------------------------------------------------------------
        // SECTION 8: SAFE DELETION & OWNERSHIP (200, 403, 404)
        // -------------------------------------------------------------
        console.log("\n--- SECTION 8: Safe Deletion & Ownership ---");
        {
            // USER_B tries to delete USER_A's folder -> 403 Forbidden
            const r1 = await fetch(`${baseUrl}/api/folders/${subSubfolderA.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${USER_B.token}` }
            });
            assert(r1.status === 403, `DELETE returns 403 for non-owner (got ${r1.status})`);

            // USER_A deletes empty leaf subfolder "ShareSync" -> 200
            const r2 = await fetch(`${baseUrl}/api/folders/${subSubfolderA.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r2.status === 200, `DELETE returns 200 for empty leaf folder (got ${r2.status})`);

            // Deleting again -> 404
            const r3 = await fetch(`${baseUrl}/api/folders/${subSubfolderA.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r3.status === 404, `DELETE returns 404 for already deleted folder (got ${r3.status})`);
        }

        // -------------------------------------------------------------
        // SECTION 9: ROUTE ALIAS COMPATIBILITY (/folders vs /api/folders)
        // -------------------------------------------------------------
        console.log("\n--- SECTION 9: Route Alias Compatibility ---");
        {
            // /folders alias works
            const r1 = await fetch(`${baseUrl}/folders`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r1.status === 200, `GET /folders alias returns 200 (got ${r1.status})`);

            const r2 = await fetch(`${baseUrl}/folders`, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${USER_A.token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ name: "AliasTestFolder" })
            });
            assert(r2.status === 201, `POST /folders alias returns 201 (got ${r2.status})`);
            const d2 = await r2.json();
            createdFolderIds.push(d2.data.id);
        }

    } catch (err) {
        console.error("Test execution exception:", err);
        failed++;
    } finally {
        await teardown();
    }

    console.log("\n=========================================");
    console.log(`TOTAL FOLDER TESTS: ${passed} passed, ${failed} failed`);
    console.log("=========================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
