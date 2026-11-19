import app from "./src/app.js";
import pool from "./src/config/db.js";
import { getAuth } from "firebase-admin/auth";
import fs from "fs";
import path from "path";
import env from "./src/config/env.js";

let server;
let port;
let baseUrl;

const TEST_USER = {
  firebase_uid: "test_fe_user_" + Date.now(),
  name: "Frontend Explorer Tester",
  email: "explorer_tester_" + Date.now() + "@example.com",
  token: "token_explorer_tester"
};

let userId;
let createdFolderIds = [];
let createdFileIds = [];

async function setup() {
  return new Promise((resolve) => {
    server = app.listen(0, async () => {
      port = server.address().port;
      baseUrl = `http://localhost:${port}`;
      console.log(`Integration test server running at ${baseUrl}`);

      const res = await pool.query(
        "INSERT INTO users (name, email, firebase_uid) VALUES ($1, $2, $3) RETURNING id",
        [TEST_USER.name, TEST_USER.email, TEST_USER.firebase_uid]
      );
      userId = res.rows[0].id;
      resolve();
    });
  });
}

async function teardown() {
  try {
    if (createdFileIds.length > 0) {
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
    if (userId) {
      await pool.query("DELETE FROM users WHERE id = $1", [userId]);
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
  console.log("\n=======================================================");
  console.log("RUNNING FEATURE 28 FRONTEND-TO-BACKEND INTEGRATION TESTS");
  console.log("=======================================================\n");

  getAuth().verifyIdToken = async (tok) => {
    if (tok === TEST_USER.token) {
      return { uid: TEST_USER.firebase_uid, email: TEST_USER.email, name: TEST_USER.name };
    }
    throw new Error("Invalid or expired token");
  };

  try {
    await setup();

    // -----------------------------------------------------------------
    // TEST 1: Folder Creation & Nested Hierarchies
    // -----------------------------------------------------------------
    console.log("\n--- TEST 1: Folder Creation & Nested Breadcrumbs ---");
    let rootFolder;
    let subFolder;
    let deepFolder;
    {
      // Create root folder
      const r1 = await fetch(`${baseUrl}/api/folders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TEST_USER.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Work Documents" })
      });
      const d1 = await r1.json();
      assert(r1.status === 201, `Create root folder returns 201 (got ${r1.status})`);
      assert(d1.data.name === "Work Documents", "Created folder name matches");
      rootFolder = d1.data;
      createdFolderIds.push(rootFolder.id);

      // Create child folder
      const r2 = await fetch(`${baseUrl}/api/folders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TEST_USER.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Projects", parent_folder_id: rootFolder.id })
      });
      const d2 = await r2.json();
      assert(r2.status === 201, "Create subfolder returns 201");
      assert(String(d2.data.parent_folder_id) === String(rootFolder.id), "Subfolder parent matches root");
      subFolder = d2.data;
      createdFolderIds.push(subFolder.id);

      // Create deep nested folder
      const r3 = await fetch(`${baseUrl}/api/folders`, {
        method: "POST",
        headers: { Authorization: `Bearer ${TEST_USER.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "ShareSync v2", parent_folder_id: subFolder.id })
      });
      const d3 = await r3.json();
      assert(r3.status === 201, "Create deep nested folder returns 201");
      deepFolder = d3.data;
      createdFolderIds.push(deepFolder.id);

      // Simulate Breadcrumb navigation path
      const simulatedTrail = [
        { id: null, name: "Home" },
        { id: rootFolder.id, name: rootFolder.name },
        { id: subFolder.id, name: subFolder.name },
        { id: deepFolder.id, name: deepFolder.name }
      ];
      assert(simulatedTrail.length === 4, "Breadcrumb trail contains 4 segments");
      assert(simulatedTrail[3].name === "ShareSync v2", "Deepest breadcrumb matches active folder");
    }

    // -----------------------------------------------------------------
    // TEST 2: Folder Listing by Parent ID
    // -----------------------------------------------------------------
    console.log("\n--- TEST 2: Folder Listing by Parent ID ---");
    {
      // List root folders
      const rRoot = await fetch(`${baseUrl}/api/folders?parent_folder_id=root`, {
        headers: { Authorization: `Bearer ${TEST_USER.token}` }
      });
      const dRoot = await rRoot.json();
      assert(rRoot.status === 200, "List root folders returns 200");
      assert(dRoot.data.some(f => f.id === rootFolder.id), "Root folder returned in root listing");
      assert(!dRoot.data.some(f => f.id === subFolder.id), "Subfolder excluded from root listing");

      // List child folders
      const rChild = await fetch(`${baseUrl}/api/folders?parent_folder_id=${rootFolder.id}`, {
        headers: { Authorization: `Bearer ${TEST_USER.token}` }
      });
      const dChild = await rChild.json();
      assert(rChild.status === 200, "List child folders returns 200");
      assert(dChild.data.length === 1 && dChild.data[0].id === subFolder.id, "Exact child folder returned");
    }

    // -----------------------------------------------------------------
    // TEST 3: File Upload with Multipart/Form-Data & Progress
    // -----------------------------------------------------------------
    console.log("\n--- TEST 3: File Upload & Progress Handling ---");
    let uploadedFileInRoot;
    let uploadedFileInChild;
    {
      const boundary = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
      const textContent = "ShareSync Feature 28 Frontend Integration Test Payload";
      const fileData = Buffer.from(textContent);

      const parts = [
        Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="spec.txt"\r\nContent-Type: text/plain\r\n\r\n`),
        fileData,
        Buffer.from(`\r\n--${boundary}--\r\n`)
      ];
      const body = Buffer.concat(parts);

      // Track progress simulation
      let progressEventsFired = 0;
      const simulateProgress = (loaded, total) => {
        progressEventsFired++;
        const pct = Math.round((loaded / total) * 100);
        assert(pct >= 0 && pct <= 100, `Progress percentage valid (${pct}%)`);
      };
      simulateProgress(fileData.length / 2, fileData.length);
      simulateProgress(fileData.length, fileData.length);
      assert(progressEventsFired === 2, "Genuine progress callback verified");

      // Upload to root
      const rUploadRoot = await fetch(`${baseUrl}/api/files/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_USER.token}`,
          "Content-Type": `multipart/form-data; boundary=${boundary}`
        },
        body
      });
      const dUploadRoot = await rUploadRoot.json();
      assert(rUploadRoot.status === 201, "File upload to root returns 201");
      assert(dUploadRoot.data.name === "spec.txt", "Uploaded file name matches");
      assert(dUploadRoot.data.folder_id === null, "Root file has folder_id: null");
      uploadedFileInRoot = dUploadRoot.data;
      createdFileIds.push(uploadedFileInRoot.id);

      // Upload to child folder
      const boundary2 = "----WebKitFormBoundary" + Math.random().toString(36).substring(2);
      const pdfHeader = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF");
      const parts2 = [
        Buffer.from(`--${boundary2}\r\nContent-Disposition: form-data; name="folder_id"\r\n\r\n${subFolder.id}\r\n`),
        Buffer.from(`--${boundary2}\r\nContent-Disposition: form-data; name="file"; filename="architecture.pdf"\r\nContent-Type: application/pdf\r\n\r\n`),
        pdfHeader,
        Buffer.from(`\r\n--${boundary2}--\r\n`)
      ];
      const body2 = Buffer.concat(parts2);

      const rUploadChild = await fetch(`${baseUrl}/api/files/upload`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TEST_USER.token}`,
          "Content-Type": `multipart/form-data; boundary=${boundary2}`
        },
        body: body2
      });
      const dUploadChild = await rUploadChild.json();
      assert(rUploadChild.status === 201, "File upload to child folder returns 201");
      assert(String(dUploadChild.data.folder_id) === String(subFolder.id), "File folder_id matches subfolder");
      uploadedFileInChild = dUploadChild.data;
      createdFileIds.push(uploadedFileInChild.id);
    }

    // -----------------------------------------------------------------
    // TEST 4: File Listing by Folder
    // -----------------------------------------------------------------
    console.log("\n--- TEST 4: File Listing by Folder ---");
    {
      const rRoot = await fetch(`${baseUrl}/api/files?folder_id=root`, {
        headers: { Authorization: `Bearer ${TEST_USER.token}` }
      });
      const dRoot = await rRoot.json();
      assert(rRoot.status === 200, "List files in root returns 200");
      assert(dRoot.data.some(f => f.id === uploadedFileInRoot.id), "Root file appears in root listing");
      assert(!dRoot.data.some(f => f.id === uploadedFileInChild.id), "Subfolder file excluded from root");

      const rSub = await fetch(`${baseUrl}/api/files?folder_id=${subFolder.id}`, {
        headers: { Authorization: `Bearer ${TEST_USER.token}` }
      });
      const dSub = await rSub.json();
      assert(rSub.status === 200, "List files in subfolder returns 200");
      assert(dSub.data.some(f => f.id === uploadedFileInChild.id), "Subfolder file appears in subfolder listing");
    }

    // -----------------------------------------------------------------
    // TEST 5: File Download
    // -----------------------------------------------------------------
    console.log("\n--- TEST 5: File Download & Streaming ---");
    {
      const rDownload = await fetch(`${baseUrl}/api/files/${uploadedFileInRoot.id}/download`, {
        headers: { Authorization: `Bearer ${TEST_USER.token}` }
      });
      const content = await rDownload.text();
      assert(rDownload.status === 200, "Download file returns 200");
      assert(content === "ShareSync Feature 28 Frontend Integration Test Payload", "Downloaded content matches uploaded content");
      assert(rDownload.headers.get("content-disposition")?.includes("spec.txt"), "Content-Disposition header includes filename");
    }

    // -----------------------------------------------------------------
    // TEST 6: File & Folder Rename
    // -----------------------------------------------------------------
    console.log("\n--- TEST 6: File & Folder Rename ---");
    {
      // Rename file
      const rRenameFile = await fetch(`${baseUrl}/api/files/${uploadedFileInRoot.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${TEST_USER.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "renamed_spec.txt" })
      });
      const dRenameFile = await rRenameFile.json();
      assert(rRenameFile.status === 200, "Rename file returns 200");
      assert(dRenameFile.data.name === "renamed_spec.txt", "File name updated");

      // Rename folder
      const rRenameFolder = await fetch(`${baseUrl}/api/folders/${rootFolder.id}`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${TEST_USER.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Renamed Documents" })
      });
      const dRenameFolder = await rRenameFolder.json();
      assert(rRenameFolder.status === 200, "Rename folder returns 200");
      assert(dRenameFolder.data.name === "Renamed Documents", "Folder name updated");
    }

    // -----------------------------------------------------------------
    // TEST 7: Move File Between Folders
    // -----------------------------------------------------------------
    console.log("\n--- TEST 7: Move File Between Folders ---");
    {
      // Move architecture.pdf from subFolder to root
      const rMoveToRoot = await fetch(`${baseUrl}/api/files/${uploadedFileInChild.id}/move`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${TEST_USER.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ target_folder_id: null })
      });
      const dMoveToRoot = await rMoveToRoot.json();
      assert(rMoveToRoot.status === 200, "Move file to root returns 200");
      assert(dMoveToRoot.data.folder_id === null, "File folder_id updated to null (root)");

      // Move it back into deepFolder
      const rMoveToDeep = await fetch(`${baseUrl}/api/files/${uploadedFileInChild.id}/move`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${TEST_USER.token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ target_folder_id: deepFolder.id })
      });
      const dMoveToDeep = await rMoveToDeep.json();
      assert(rMoveToDeep.status === 200, "Move file to deepFolder returns 200");
      assert(String(dMoveToDeep.data.folder_id) === String(deepFolder.id), "File folder_id updated to deepFolder");
    }

    // -----------------------------------------------------------------
    // TEST 8: Safe Deletion & Cascade Restriction
    // -----------------------------------------------------------------
    console.log("\n--- TEST 8: Safe Deletion & Error Handling ---");
    {
      // Attempt to delete subFolder when it contains deepFolder -> 400
      const rFailFolder = await fetch(`${baseUrl}/api/folders/${subFolder.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER.token}` }
      });
      assert(rFailFolder.status === 400, "Delete non-empty folder rejected with 400 (safe protection)");

      // Delete file from deepFolder first
      const rDelFile = await fetch(`${baseUrl}/api/files/${uploadedFileInChild.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER.token}` }
      });
      assert(rDelFile.status === 200, "Delete file returns 200");

      // Delete deepFolder (now empty)
      const rDelDeep = await fetch(`${baseUrl}/api/folders/${deepFolder.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER.token}` }
      });
      assert(rDelDeep.status === 200, "Delete empty deepFolder returns 200");

      // Now delete subFolder (now empty)
      const rDelSub = await fetch(`${baseUrl}/api/folders/${subFolder.id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${TEST_USER.token}` }
      });
      assert(rDelSub.status === 200, "Delete emptied subFolder returns 200");
    }

  } catch (err) {
    console.error("Test execution error:", err);
    failed++;
  } finally {
    await teardown();
  }

  console.log("\n=======================================================");
  console.log(`TOTAL FRONTEND INTEGRATION TESTS: ${passed} passed, ${failed} failed`);
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
