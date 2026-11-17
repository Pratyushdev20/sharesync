import app from "./src/app.js";
import pool from "./src/config/db.js";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import path from "path";
import env from "./src/config/env.js";

let server;
let port;
let baseUrl;

const USER_A = {
    firebase_uid: "test_file_user_A_" + Date.now(),
    name: "File User Alice",
    email: "alice_file_" + Date.now() + "@example.com",
    token: "token_file_user_A"
};

const USER_B = {
    firebase_uid: "test_file_user_B_" + Date.now(),
    name: "File User Bob",
    email: "bob_file_" + Date.now() + "@example.com",
    token: "token_file_user_B"
};

let userAId;
let userBId;
let folderAId;
let folderBId;
let createdFileIds = [];
let createdFolderIds = [];
let diskFilesToClean = [];

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

            // Pre-create folders for users
            const fResA = await pool.query(
                "INSERT INTO folders (name, owner_firebase_uid, owner_id) VALUES ($1, $2, $3) RETURNING id",
                ["AliceFolder", USER_A.firebase_uid, userAId]
            );
            folderAId = fResA.rows[0].id;
            createdFolderIds.push(folderAId);

            const fResB = await pool.query(
                "INSERT INTO folders (name, owner_firebase_uid, owner_id) VALUES ($1, $2, $3) RETURNING id",
                ["BobFolder", USER_B.firebase_uid, userBId]
            );
            folderBId = fResB.rows[0].id;
            createdFolderIds.push(folderBId);

            resolve();
        });
    });
}

async function teardown() {
    try {
        if (createdFileIds.length > 0) {
            // Get storage paths before deleting
            const pathsRes = await pool.query("SELECT storage_path FROM files WHERE id = ANY($1)", [createdFileIds]);
            for (const row of pathsRes.rows) {
                if (row.storage_path) {
                    const fullPath = path.resolve(env.uploadDir, row.storage_path);
                    try { await fs.promises.unlink(fullPath); } catch {}
                }
            }
            await pool.query("DELETE FROM files WHERE id = ANY($1)", [createdFileIds]);
        }
        if (createdFolderIds.length > 0) {
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
        for (const p of diskFilesToClean) {
            try { await fs.promises.unlink(p); } catch {}
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

/**
 * Helper to create a multipart/form-data boundary and payload
 */
function createMultipartPayload(fields, fileField) {
    const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
    const chunks = [];

    // Fields
    for (const [key, value] of Object.entries(fields)) {
        if (value !== undefined && value !== null) {
            chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`));
        }
    }

    // File
    if (fileField) {
        const { fieldname = "file", filename = "file.txt", contentType = "text/plain", data = Buffer.from("") } = fileField;
        chunks.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${fieldname}"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`));
        chunks.push(data);
        chunks.push(Buffer.from("\r\n"));
    }

    chunks.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(chunks);

    return {
        body,
        contentType: `multipart/form-data; boundary=${boundary}`
    };
}

async function runTests() {
    console.log("\n=========================================");
    console.log("RUNNING FILE MANAGEMENT API TESTS");
    console.log("=========================================\n");

    getAuth().verifyIdToken = async (tok) => {
        if (tok === USER_A.token) {
            return { uid: USER_A.firebase_uid, email: USER_A.email, name: USER_A.name };
        }
        if (tok === USER_B.token) {
            return { uid: USER_B.firebase_uid, email: USER_B.email, name: USER_B.name };
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
            const r1 = await fetch(`${baseUrl}/api/files`);
            assert(r1.status === 401, `GET /api/files returns 401 without auth (got ${r1.status})`);

            const r2 = await fetch(`${baseUrl}/api/files/upload`, { method: "POST" });
            assert(r2.status === 401, `POST /api/files/upload returns 401 without auth (got ${r2.status})`);

            const r3 = await fetch(`${baseUrl}/api/files/1`);
            assert(r3.status === 401, `GET /api/files/:id returns 401 without auth (got ${r3.status})`);

            const r4 = await fetch(`${baseUrl}/api/files/1/download`);
            assert(r4.status === 401, `GET /api/files/:id/download returns 401 without auth (got ${r4.status})`);

            const r5 = await fetch(`${baseUrl}/api/files/1`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name: "renamed.txt" })
            });
            assert(r5.status === 401, `PATCH /api/files/:id returns 401 without auth (got ${r5.status})`);

            const r6 = await fetch(`${baseUrl}/api/files/1/move`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ target_folder_id: 2 })
            });
            assert(r6.status === 401, `PATCH /api/files/:id/move returns 401 without auth (got ${r6.status})`);

            const r7 = await fetch(`${baseUrl}/api/files/1`, { method: "DELETE" });
            assert(r7.status === 401, `DELETE /api/files/:id returns 401 without auth (got ${r7.status})`);

            // Invalid token
            const r8 = await fetch(`${baseUrl}/api/files`, {
                headers: { Authorization: "Bearer bad_token" }
            });
            assert(r8.status === 401, `GET /api/files returns 401 with bad token (got ${r8.status})`);
        }

        // -------------------------------------------------------------
        // SECTION 2: INPUT & CONTENT VALIDATION (400)
        // -------------------------------------------------------------
        console.log("\n--- SECTION 2: Input & Content Validation (400) ---");
        {
            // Upload with no file attached
            const { body: bNoFile, contentType: cNoFile } = createMultipartPayload({ folder_id: "1" }, null);
            const r1 = await fetch(`${baseUrl}/api/files/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": cNoFile },
                body: bNoFile
            });
            assert(r1.status === 400, `POST /upload without file returns 400 (got ${r1.status})`);

            // Upload with empty file (0 bytes)
            const { body: bEmpty, contentType: cEmpty } = createMultipartPayload(
                {},
                { fieldname: "file", filename: "empty.txt", contentType: "text/plain", data: Buffer.alloc(0) }
            );
            const r2 = await fetch(`${baseUrl}/api/files/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": cEmpty },
                body: bEmpty
            });
            assert(r2.status === 400, `POST /upload with empty file returns 400 (got ${r2.status})`);

            // Upload with path traversal in filename
            const { body: bTrav, contentType: cTrav } = createMultipartPayload(
                {},
                { fieldname: "file", filename: "../../../etc/passwd", contentType: "text/plain", data: Buffer.from("root:x:0:0") }
            );
            const r3 = await fetch(`${baseUrl}/api/files/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": cTrav },
                body: bTrav
            });
            assert(r3.status === 400, `POST /upload with path traversal filename returns 400 (got ${r3.status})`);

            // Upload with invalid folder ID format
            const { body: bBadFolder, contentType: cBadFolder } = createMultipartPayload(
                { folder_id: "not_a_number" },
                { fieldname: "file", filename: "test.txt", contentType: "text/plain", data: Buffer.from("valid content") }
            );
            const r4 = await fetch(`${baseUrl}/api/files/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": cBadFolder },
                body: bBadFolder
            });
            assert(r4.status === 400, `POST /upload with non-numeric folder_id returns 400 (got ${r4.status})`);

            // Security: Upload malicious executable masquerading as a PDF
            // PE header: 'MZ' (0x4D, 0x5A)
            const fakePdfData = Buffer.from([0x4D, 0x5A, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00]);
            const { body: bExe, contentType: cExe } = createMultipartPayload(
                {},
                { fieldname: "file", filename: "invoice.pdf", contentType: "application/pdf", data: fakePdfData }
            );
            const r5 = await fetch(`${baseUrl}/api/files/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": cExe },
                body: bExe
            });
            assert(r5.status === 400, `POST /upload with executable disguised as PDF returns 400 (got ${r5.status})`);

            // Security: Content mismatch (GIF header disguised as PDF)
            const fakePdf2 = Buffer.from("GIF89a\x01\x00\x01\x00");
            const { body: bMismatch, contentType: cMismatch } = createMultipartPayload(
                {},
                { fieldname: "file", filename: "test.pdf", contentType: "application/pdf", data: fakePdf2 }
            );
            const r6 = await fetch(`${baseUrl}/api/files/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": cMismatch },
                body: bMismatch
            });
            assert(r6.status === 400, `POST /upload with MIME content mismatch returns 400 (got ${r6.status})`);

            // Invalid file ID in URL routes
            const r7 = await fetch(`${baseUrl}/api/files/invalid_id`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r7.status === 400, `GET /api/files/invalid_id returns 400 (got ${r7.status})`);

            const r8 = await fetch(`${baseUrl}/api/files/invalid_id/download`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r8.status === 400, `GET /api/files/invalid_id/download returns 400 (got ${r8.status})`);

            const r9 = await fetch(`${baseUrl}/api/files/invalid_id`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ name: "new.txt" })
            });
            assert(r9.status === 400, `PATCH /api/files/invalid_id returns 400 (got ${r9.status})`);

            const r10 = await fetch(`${baseUrl}/api/files/invalid_id`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r10.status === 400, `DELETE /api/files/invalid_id returns 400 (got ${r10.status})`);
        }

        // -------------------------------------------------------------
        // SECTION 3: FILE UPLOAD & PERMISSION VALIDATION
        // -------------------------------------------------------------
        console.log("\n--- SECTION 3: File Upload & Permissions (201, 403, 404, 409) ---");
        let rootFileA;
        let nestedFileA;
        let rootFileB;
        {
            // User A uploads valid root file "notes.txt"
            const textContent = "Hello from ShareSync secure file test!";
            const { body: bTxt, contentType: cTxt } = createMultipartPayload(
                {},
                { fieldname: "file", filename: "notes.txt", contentType: "text/plain", data: Buffer.from(textContent) }
            );
            const r1 = await fetch(`${baseUrl}/api/files/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": cTxt },
                body: bTxt
            });
            const d1 = await r1.json();
            assert(r1.status === 201, `User A uploads root file notes.txt (got ${r1.status})`);
            assert(d1.success === true, "Upload response has success: true");
            assert(d1.data && d1.data.name === "notes.txt", `File name is 'notes.txt' (got ${d1.data?.name})`);
            assert(d1.data.folder_id === null, "Root file has folder_id: null");
            assert(d1.data.storage_path === undefined, "storage_path is NEVER exposed to client");
            rootFileA = d1.data;
            createdFileIds.push(rootFileA.id);

            // User A uploads valid PDF into AliceFolder
            const pdfData = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");
            const { body: bPdf, contentType: cPdf } = createMultipartPayload(
                { folder_id: String(folderAId) },
                { fieldname: "file", filename: "report.pdf", contentType: "application/pdf", data: pdfData }
            );
            const r2 = await fetch(`${baseUrl}/api/files/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": cPdf },
                body: bPdf
            });
            const d2 = await r2.json();
            assert(r2.status === 201, `User A uploads file into AliceFolder (got ${r2.status})`);
            assert(String(d2.data.folder_id) === String(folderAId), "File folder_id matches AliceFolder");
            nestedFileA = d2.data;
            createdFileIds.push(nestedFileA.id);

            // Duplicate filename collision in ROOT (case-insensitive: "NOTES.TXT") -> 409
            const { body: bDupRoot, contentType: cDupRoot } = createMultipartPayload(
                {},
                { fieldname: "file", filename: "NOTES.TXT", contentType: "text/plain", data: Buffer.from("different content") }
            );
            const r3 = await fetch(`${baseUrl}/api/files/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": cDupRoot },
                body: bDupRoot
            });
            assert(r3.status === 409, `Duplicate case-insensitive filename in root returns 409 (got ${r3.status})`);

            // Duplicate filename collision in FOLDER (case-insensitive: "REPORT.PDF") -> 409
            const { body: bDupFolder, contentType: cDupFolder } = createMultipartPayload(
                { folder_id: String(folderAId) },
                { fieldname: "file", filename: "REPORT.PDF", contentType: "application/pdf", data: pdfData }
            );
            const r4 = await fetch(`${baseUrl}/api/files/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": cDupFolder },
                body: bDupFolder
            });
            assert(r4.status === 409, `Duplicate case-insensitive filename in folder returns 409 (got ${r4.status})`);

            // Upload into non-existent folder ID -> 404
            const { body: bGhost, contentType: cGhost } = createMultipartPayload(
                { folder_id: "999999" },
                { fieldname: "file", filename: "ghost.txt", contentType: "text/plain", data: Buffer.from("ghost") }
            );
            const r5 = await fetch(`${baseUrl}/api/files/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": cGhost },
                body: bGhost
            });
            assert(r5.status === 404, `Upload to non-existent folder returns 404 (got ${r5.status})`);

            // Cross-user folder access violation: User B tries to upload into User A's folder -> 403 Forbidden
            const { body: bCross, contentType: cCross } = createMultipartPayload(
                { folder_id: String(folderAId) },
                { fieldname: "file", filename: "infiltrate.txt", contentType: "text/plain", data: Buffer.from("hacked") }
            );
            const r6 = await fetch(`${baseUrl}/api/files/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${USER_B.token}`, "Content-Type": cCross },
                body: bCross
            });
            assert(r6.status === 403, `Upload to another user's folder returns 403 (got ${r6.status})`);

            // User B uploads root file with identical name "notes.txt" -> 201 (scoped to user, no conflict!)
            const { body: bBob, contentType: cBob } = createMultipartPayload(
                {},
                { fieldname: "file", filename: "notes.txt", contentType: "text/plain", data: Buffer.from("Bob's notes") }
            );
            const r7 = await fetch(`${baseUrl}/api/files/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${USER_B.token}`, "Content-Type": cBob },
                body: bBob
            });
            const d7 = await r7.json();
            assert(r7.status === 201, `User B can upload file with same name in their own root (got ${r7.status})`);
            rootFileB = d7.data;
            createdFileIds.push(rootFileB.id);
        }

        // -------------------------------------------------------------
        // SECTION 4: FILE LISTING & QUERY FILTERING
        // -------------------------------------------------------------
        console.log("\n--- SECTION 4: File Listing & Filtering ---");
        {
            // User A lists all files
            const r1 = await fetch(`${baseUrl}/api/files`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            const d1 = await r1.json();
            assert(r1.status === 200, `GET /api/files returns 200 (got ${r1.status})`);
            assert(Array.isArray(d1.data), "Returns array of files");
            const namesA = d1.data.map(f => f.name);
            assert(namesA.includes("notes.txt") && namesA.includes("report.pdf"), "User A sees their own files");
            assert(!d1.data.some(f => f.id === rootFileB.id), "User A does NOT see User B's files");

            // User A filters by root files: ?folder_id=root
            const r2 = await fetch(`${baseUrl}/api/files?folder_id=root`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            const d2 = await r2.json();
            assert(r2.status === 200, "GET ?folder_id=root returns 200");
            const rootNames = d2.data.map(f => f.name);
            assert(rootNames.includes("notes.txt") && !rootNames.includes("report.pdf"), "Root filter only returns root files");

            // User A filters by folder: ?folder_id=${folderAId}
            const r3 = await fetch(`${baseUrl}/api/files?folder_id=${folderAId}`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            const d3 = await r3.json();
            assert(r3.status === 200, "GET ?folder_id=<id> returns 200");
            assert(d3.data.length === 1 && d3.data[0].name === "report.pdf", "Folder filter only returns files in that folder");

            // User B attempts to list files in User A's folder -> 403 Forbidden
            const r4 = await fetch(`${baseUrl}/api/files?folder_id=${folderAId}`, {
                headers: { Authorization: `Bearer ${USER_B.token}` }
            });
            assert(r4.status === 403, `Querying another user's folder files returns 403 (got ${r4.status})`);

            // Querying non-existent folder -> 404
            const r5 = await fetch(`${baseUrl}/api/files?folder_id=999999`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r5.status === 404, `Querying non-existent folder files returns 404 (got ${r5.status})`);
        }

        // -------------------------------------------------------------
        // SECTION 5: FILE RETRIEVAL & DOWNLOAD
        // -------------------------------------------------------------
        console.log("\n--- SECTION 5: File Retrieval & Download ---");
        {
            // User A gets file metadata by ID
            const r1 = await fetch(`${baseUrl}/api/files/${rootFileA.id}`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            const d1 = await r1.json();
            assert(r1.status === 200, `GET /api/files/:id returns 200 for owner (got ${r1.status})`);
            assert(d1.data && d1.data.name === "notes.txt", "Returns correct file name");
            assert(d1.data.storage_path === undefined, "Never leaks internal storage_path");

            // User B tries to access User A's file metadata -> 403 Forbidden
            const r2 = await fetch(`${baseUrl}/api/files/${rootFileA.id}`, {
                headers: { Authorization: `Bearer ${USER_B.token}` }
            });
            assert(r2.status === 403, `GET /api/files/:id returns 403 for non-owner (got ${r2.status})`);

            // Non-existent file ID -> 404
            const r3 = await fetch(`${baseUrl}/api/files/999999`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r3.status === 404, `GET /api/files/999999 returns 404 (got ${r3.status})`);

            // User A downloads file
            const r4 = await fetch(`${baseUrl}/api/files/${rootFileA.id}/download`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            const downloadedContent = await r4.text();
            assert(r4.status === 200, `GET /api/files/:id/download returns 200 (got ${r4.status})`);
            assert(downloadedContent === "Hello from ShareSync secure file test!", "Downloaded content matches original upload");
            assert(r4.headers.get("content-disposition")?.includes("notes.txt"), "Content-Disposition includes filename");
            assert(r4.headers.get("content-type")?.includes("text/plain"), "Content-Type is text/plain");

            // User B attempts to download User A's file -> 403 Forbidden
            const r5 = await fetch(`${baseUrl}/api/files/${rootFileA.id}/download`, {
                headers: { Authorization: `Bearer ${USER_B.token}` }
            });
            assert(r5.status === 403, `Download returns 403 for non-owner (got ${r5.status})`);

            // Download non-existent file -> 404
            const r6 = await fetch(`${baseUrl}/api/files/999999/download`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r6.status === 404, `Download returns 404 for non-existent file (got ${r6.status})`);
        }

        // -------------------------------------------------------------
        // SECTION 6: FILE RENAME (200, 403, 404, 409)
        // -------------------------------------------------------------
        console.log("\n--- SECTION 6: File Rename ---");
        {
            // User A renames "notes.txt" to "my_notes.txt"
            const r1 = await fetch(`${baseUrl}/api/files/${rootFileA.id}`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ name: "my_notes.txt" })
            });
            const d1 = await r1.json();
            assert(r1.status === 200, `PATCH /api/files/:id renames file (got ${r1.status})`);
            assert(d1.data.name === "my_notes.txt", `File name updated to 'my_notes.txt' (got ${d1.data.name})`);

            // PUT alias also works
            const rPut = await fetch(`${baseUrl}/api/files/${rootFileA.id}`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ name: "my_notes.txt" })
            });
            assert(rPut.status === 200, `PUT /api/files/:id also succeeds (got ${rPut.status})`);

            // User A creates second root file "todo.txt"
            const { body: bTodo, contentType: cTodo } = createMultipartPayload(
                {},
                { fieldname: "file", filename: "todo.txt", contentType: "text/plain", data: Buffer.from("todo list") }
            );
            const rCreateTodo = await fetch(`${baseUrl}/api/files/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": cTodo },
                body: bTodo
            });
            const dTodo = await rCreateTodo.json();
            const todoFile = dTodo.data;
            createdFileIds.push(todoFile.id);

            // Name collision: User A tries to rename "todo.txt" to "MY_NOTES.TXT" -> 409
            const r2 = await fetch(`${baseUrl}/api/files/${todoFile.id}`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ name: "MY_NOTES.TXT" })
            });
            assert(r2.status === 409, `Rename collision returns 409 (got ${r2.status})`);

            // Path traversal in rename -> 400
            const r3 = await fetch(`${baseUrl}/api/files/${todoFile.id}`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ name: "../../evil.txt" })
            });
            assert(r3.status === 400, `Rename with path traversal returns 400 (got ${r3.status})`);

            // User B tries to rename User A's file -> 403 Forbidden
            const r4 = await fetch(`${baseUrl}/api/files/${rootFileA.id}`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${USER_B.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ name: "hacked.txt" })
            });
            assert(r4.status === 403, `Rename by non-owner returns 403 (got ${r4.status})`);

            // Rename non-existent file -> 404
            const r5 = await fetch(`${baseUrl}/api/files/999999`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ name: "ghost.txt" })
            });
            assert(r5.status === 404, `Rename non-existent file returns 404 (got ${r5.status})`);
        }

        // -------------------------------------------------------------
        // SECTION 7: MOVE FILES BETWEEN FOLDERS
        // -------------------------------------------------------------
        console.log("\n--- SECTION 7: Move Files Between Folders ---");
        {
            // User A moves "report.pdf" from AliceFolder to root
            const r1 = await fetch(`${baseUrl}/api/files/${nestedFileA.id}/move`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ target_folder_id: null })
            });
            const d1 = await r1.json();
            assert(r1.status === 200, `Move file to root returns 200 (got ${r1.status})`);
            assert(d1.data.folder_id === null, "File folder_id is now null");

            // PUT alias also works: User A moves "report.pdf" back into AliceFolder
            const r2 = await fetch(`${baseUrl}/api/files/${nestedFileA.id}/move`, {
                method: "PUT",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ target_folder_id: folderAId })
            });
            const d2 = await r2.json();
            assert(r2.status === 200, `PUT /move returns 200 (got ${r2.status})`);
            assert(String(d2.data.folder_id) === String(folderAId), "File moved back to AliceFolder");

            // User A attempts to move file into User B's folder -> 403 Forbidden
            const r3 = await fetch(`${baseUrl}/api/files/${nestedFileA.id}/move`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ target_folder_id: folderBId })
            });
            assert(r3.status === 403, `Move to another user's folder returns 403 (got ${r3.status})`);

            // User B attempts to move User A's file -> 403 Forbidden
            const r4 = await fetch(`${baseUrl}/api/files/${nestedFileA.id}/move`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${USER_B.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ target_folder_id: folderBId })
            });
            assert(r4.status === 403, `Move by non-owner returns 403 (got ${r4.status})`);

            // Move to non-existent folder -> 404
            const r5 = await fetch(`${baseUrl}/api/files/${nestedFileA.id}/move`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ target_folder_id: 999999 })
            });
            assert(r5.status === 404, `Move to non-existent folder returns 404 (got ${r5.status})`);
        }

        // -------------------------------------------------------------
        // SECTION 8: FILE DELETION & DISK CLEANUP
        // -------------------------------------------------------------
        console.log("\n--- SECTION 8: File Deletion & Disk Cleanup ---");
        {
            // User B tries to delete User A's file -> 403 Forbidden
            const r1 = await fetch(`${baseUrl}/api/files/${nestedFileA.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${USER_B.token}` }
            });
            assert(r1.status === 403, `DELETE returns 403 for non-owner (got ${r1.status})`);

            // Query storage path before delete to verify disk deletion
            const rowBefore = await pool.query("SELECT storage_path FROM files WHERE id = $1", [nestedFileA.id]);
            const storagePath = rowBefore.rows[0]?.storage_path;
            const fullDiskPath = storagePath ? path.resolve(env.uploadDir, storagePath) : null;
            let diskFileExistedBefore = false;
            try {
                if (fullDiskPath) {
                    await fs.promises.access(fullDiskPath, fs.constants.F_OK);
                    diskFileExistedBefore = true;
                }
            } catch {}
            assert(diskFileExistedBefore === true, "File exists on disk before deletion");

            // User A deletes nested file -> 200
            const r2 = await fetch(`${baseUrl}/api/files/${nestedFileA.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            const d2 = await r2.json();
            assert(r2.status === 200, `DELETE returns 200 for owner (got ${r2.status})`);
            assert(d2.success === true, "Delete response has success: true");

            // Verify file record is removed from DB
            const rowAfter = await pool.query("SELECT id FROM files WHERE id = $1", [nestedFileA.id]);
            assert(rowAfter.rows.length === 0, "File record removed from database");

            // Verify file is removed from disk
            let diskFileExistsAfter = true;
            try {
                await fs.promises.access(fullDiskPath, fs.constants.F_OK);
            } catch {
                diskFileExistsAfter = false;
            }
            assert(diskFileExistsAfter === false, "File was deleted from local disk storage");

            // Deleting already deleted file -> 404
            const r3 = await fetch(`${baseUrl}/api/files/${nestedFileA.id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r3.status === 404, `DELETE already deleted file returns 404 (got ${r3.status})`);
        }

        // -------------------------------------------------------------
        // SECTION 9: ROUTE ALIAS COMPATIBILITY (/files vs /api/files)
        // -------------------------------------------------------------
        console.log("\n--- SECTION 9: Route Alias Compatibility ---");
        {
            // /files alias upload
            const { body: bAlias, contentType: cAlias } = createMultipartPayload(
                {},
                { fieldname: "file", filename: "alias_test.txt", contentType: "text/plain", data: Buffer.from("alias test") }
            );
            const r1 = await fetch(`${baseUrl}/files/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": cAlias },
                body: bAlias
            });
            assert(r1.status === 201, `POST /files/upload alias returns 201 (got ${r1.status})`);
            const d1 = await r1.json();
            createdFileIds.push(d1.data.id);

            // /files alias list
            const r2 = await fetch(`${baseUrl}/files`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r2.status === 200, `GET /files alias returns 200 (got ${r2.status})`);

            // /files alias download
            const r3 = await fetch(`${baseUrl}/files/${d1.data.id}/download`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r3.status === 200, `GET /files/:id/download alias returns 200 (got ${r3.status})`);
        }

        // -------------------------------------------------------------
        // SECTION 10: LEGACY RECORD PRESERVATION (resume.pdf, id=11)
        // -------------------------------------------------------------
        console.log("\n--- SECTION 10: Legacy Record Preservation ---");
        {
            // User A cannot access legacy file
            const r1 = await fetch(`${baseUrl}/api/files/11`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r1.status === 403, `GET /api/files/11 returns 403 for unauthorized user (got ${r1.status})`);

            // User A cannot download legacy file
            const r2 = await fetch(`${baseUrl}/api/files/11/download`, {
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r2.status === 403, `GET /api/files/11/download returns 403 (got ${r2.status})`);

            // User A cannot rename legacy file
            const r3 = await fetch(`${baseUrl}/api/files/11`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ name: "hacked_resume.pdf" })
            });
            assert(r3.status === 403, `PATCH /api/files/11 returns 403 (got ${r3.status})`);

            // User A cannot move legacy file
            const r4 = await fetch(`${baseUrl}/api/files/11/move`, {
                method: "PATCH",
                headers: { Authorization: `Bearer ${USER_A.token}`, "Content-Type": "application/json" },
                body: JSON.stringify({ target_folder_id: folderAId })
            });
            assert(r4.status === 403, `PATCH /api/files/11/move returns 403 (got ${r4.status})`);

            // User A cannot delete legacy file
            const r5 = await fetch(`${baseUrl}/api/files/11`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${USER_A.token}` }
            });
            assert(r5.status === 403, `DELETE /api/files/11 returns 403 (got ${r5.status})`);

            // Verify in DB that resume.pdf is completely intact
            const legacyRow = await pool.query("SELECT * FROM files WHERE id = 11");
            assert(legacyRow.rows.length === 1, "resume.pdf (id=11) still exists in DB");
            assert(legacyRow.rows[0].name === "resume.pdf", "resume.pdf name is intact");
            assert(String(legacyRow.rows[0].owner_id) === "1", "resume.pdf owner_id is 1");
            assert(String(legacyRow.rows[0].folder_id) === "4", "resume.pdf folder_id is 4");
            assert(legacyRow.rows[0].owner_firebase_uid === null, "resume.pdf owner_firebase_uid is null");
        }

    } catch (err) {
        console.error("Test execution exception:", err);
        failed++;
    } finally {
        await teardown();
    }

    console.log("\n=========================================");
    console.log(`TOTAL FILE TESTS: ${passed} passed, ${failed} failed`);
    console.log("=========================================\n");

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
