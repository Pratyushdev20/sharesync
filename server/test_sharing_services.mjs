import pool from "./src/config/db.js";
import {
    resolvePermission,
    shareWithUser,
    createShareLink,
    revokeUserShare,
    revokeShareLink,
    getSharedWithMe,
    getSharedByMe,
    resolveShareLink
} from "./src/services/share.service.js";

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
    console.log("FEATURE 29 - PHASE 2: SHARING SERVICES TEST SUITE");
    console.log("=======================================================\n");

    const USER_ALICE = {
        firebase_uid: "test_share_alice_" + Date.now(),
        name: "Alice Owner",
        email: `alice_${Date.now()}@example.com`
    };

    const USER_BOB = {
        firebase_uid: "test_share_bob_" + Date.now(),
        name: "Bob Collab",
        email: `bob_${Date.now()}@example.com`
    };

    const USER_CHARLIE = {
        firebase_uid: "test_share_charlie_" + Date.now(),
        name: "Charlie Viewer",
        email: `charlie_${Date.now()}@example.com`
    };

    const USER_DAVE = {
        firebase_uid: "test_share_dave_" + Date.now(),
        name: "Dave Outsider",
        email: `dave_${Date.now()}@example.com`
    };

    let aliceDbId, bobDbId, charlieDbId, daveDbId;
    let rootFolderId, subFolderId, deepFolderId;
    let fileInRootFolderId, fileInSubFolderId, fileDirectId;
    let createdFiles = [];
    let createdFolders = [];
    let createdUsers = [];

    try {
        // --- Setup Test Users ---
        console.log("--- 1. Setting Up Test Fixtures ---");
        const uResA = await pool.query(
            "INSERT INTO users (name, email, firebase_uid) VALUES ($1, $2, $3) RETURNING id",
            [USER_ALICE.name, USER_ALICE.email, USER_ALICE.firebase_uid]
        );
        aliceDbId = uResA.rows[0].id;
        createdUsers.push(aliceDbId);

        const uResB = await pool.query(
            "INSERT INTO users (name, email, firebase_uid) VALUES ($1, $2, $3) RETURNING id",
            [USER_BOB.name, USER_BOB.email, USER_BOB.firebase_uid]
        );
        bobDbId = uResB.rows[0].id;
        createdUsers.push(bobDbId);

        const uResC = await pool.query(
            "INSERT INTO users (name, email, firebase_uid) VALUES ($1, $2, $3) RETURNING id",
            [USER_CHARLIE.name, USER_CHARLIE.email, USER_CHARLIE.firebase_uid]
        );
        charlieDbId = uResC.rows[0].id;
        createdUsers.push(charlieDbId);

        const uResD = await pool.query(
            "INSERT INTO users (name, email, firebase_uid) VALUES ($1, $2, $3) RETURNING id",
            [USER_DAVE.name, USER_DAVE.email, USER_DAVE.firebase_uid]
        );
        daveDbId = uResD.rows[0].id;
        createdUsers.push(daveDbId);

        // --- Setup Nested Folders owned by Alice ---
        // Hierarchy: rootFolder -> subFolder -> deepFolder
        const fRootRes = await pool.query(
            "INSERT INTO folders (name, owner_id, owner_firebase_uid, parent_folder_id) VALUES ($1, $2, $3, NULL) RETURNING id",
            ["RootFolder", aliceDbId, USER_ALICE.firebase_uid]
        );
        rootFolderId = fRootRes.rows[0].id;
        createdFolders.push(rootFolderId);

        const fSubRes = await pool.query(
            "INSERT INTO folders (name, owner_id, owner_firebase_uid, parent_folder_id) VALUES ($1, $2, $3, $4) RETURNING id",
            ["SubFolder", aliceDbId, USER_ALICE.firebase_uid, rootFolderId]
        );
        subFolderId = fSubRes.rows[0].id;
        createdFolders.push(subFolderId);

        const fDeepRes = await pool.query(
            "INSERT INTO folders (name, owner_id, owner_firebase_uid, parent_folder_id) VALUES ($1, $2, $3, $4) RETURNING id",
            ["DeepFolder", aliceDbId, USER_ALICE.firebase_uid, subFolderId]
        );
        deepFolderId = fDeepRes.rows[0].id;
        createdFolders.push(deepFolderId);

        // --- Setup Files owned by Alice ---
        const file1Res = await pool.query(
            "INSERT INTO files (name, size, mime_type, storage_path, owner_id, owner_firebase_uid, folder_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
            ["doc_in_root.txt", 100, "text/plain", "/users/alice/doc_in_root.txt", aliceDbId, USER_ALICE.firebase_uid, rootFolderId]
        );
        fileInRootFolderId = file1Res.rows[0].id;
        createdFiles.push(fileInRootFolderId);

        const file2Res = await pool.query(
            "INSERT INTO files (name, size, mime_type, storage_path, owner_id, owner_firebase_uid, folder_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
            ["doc_in_sub.txt", 200, "text/plain", "/users/alice/doc_in_sub.txt", aliceDbId, USER_ALICE.firebase_uid, subFolderId]
        );
        fileInSubFolderId = file2Res.rows[0].id;
        createdFiles.push(fileInSubFolderId);

        const file3Res = await pool.query(
            "INSERT INTO files (name, size, mime_type, storage_path, owner_id, owner_firebase_uid, folder_id) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id",
            ["standalone.txt", 300, "text/plain", "/users/alice/standalone.txt", aliceDbId, USER_ALICE.firebase_uid, null]
        );
        fileDirectId = file3Res.rows[0].id;
        createdFiles.push(fileDirectId);

        console.log("Fixtures created successfully.");

        // =========================================================================
        // TEST SECTION 1: Ownership & Basic Permission Resolution
        // =========================================================================
        console.log("\n--- TEST SECTION 1: Ownership & Basic Permissions ---");

        const aliceFolderPerm = await resolvePermission(USER_ALICE.firebase_uid, "folder", rootFolderId);
        assert(aliceFolderPerm === "owner", `Owner resolves 'owner' for folder (got: ${aliceFolderPerm})`);

        const aliceFilePerm = await resolvePermission(USER_ALICE.firebase_uid, "file", fileInRootFolderId);
        assert(aliceFilePerm === "owner", `Owner resolves 'owner' for file (got: ${aliceFilePerm})`);

        const outsiderFolderPerm = await resolvePermission(USER_DAVE.firebase_uid, "folder", rootFolderId);
        assert(outsiderFolderPerm === null, `Outsider without share resolves null for folder (got: ${outsiderFolderPerm})`);

        const outsiderFilePerm = await resolvePermission(USER_DAVE.firebase_uid, "file", fileInRootFolderId);
        assert(outsiderFilePerm === null, `Outsider without share resolves null for file (got: ${outsiderFilePerm})`);

        const anonPerm = await resolvePermission(null, "file", fileInRootFolderId);
        assert(anonPerm === null, `Anonymous user resolves null (got: ${anonPerm})`);

        // =========================================================================
        // TEST SECTION 2: shareWithUser Validation & Direct Sharing
        // =========================================================================
        console.log("\n--- TEST SECTION 2: shareWithUser & Direct Sharing ---");

        // 2.1 Prevent self-sharing
        try {
            await shareWithUser({
                ownerUid: USER_ALICE.firebase_uid,
                resourceType: "file",
                resourceId: fileDirectId,
                recipientEmail: USER_ALICE.email,
                permission: "viewer"
            });
            assert(false, "Self-share should throw error");
        } catch (err) {
            assert(err.statusCode === 400 && err.message.includes("yourself"), "Self-share blocked with 400 Bad Request");
        }

        // 2.2 Reject non-owner attempting to share
        try {
            await shareWithUser({
                ownerUid: USER_BOB.firebase_uid,
                resourceType: "file",
                resourceId: fileDirectId,
                recipientEmail: USER_CHARLIE.email,
                permission: "viewer"
            });
            assert(false, "Non-owner share should throw 403");
        } catch (err) {
            assert(err.statusCode === 403, "Non-owner share blocked with 403 Forbidden");
        }

        // 2.3 Reject sharing with non-existent user
        try {
            await shareWithUser({
                ownerUid: USER_ALICE.firebase_uid,
                resourceType: "file",
                resourceId: fileDirectId,
                recipientEmail: "ghost@nonexistent.domain",
                permission: "viewer"
            });
            assert(false, "Share with unknown email should throw 404");
        } catch (err) {
            assert(err.statusCode === 404, "Unknown recipient email blocked with 404 Not Found");
        }

        // 2.4 Share standalone file with Bob as 'editor'
        const shareBobFile = await shareWithUser({
            ownerUid: USER_ALICE.firebase_uid,
            resourceType: "file",
            resourceId: fileDirectId,
            recipientEmail: USER_BOB.email,
            permission: "editor"
        });
        assert(shareBobFile && shareBobFile.permission === "editor", "Alice successfully shared standalone file with Bob as editor");
        assert(shareBobFile.recipientEmail === USER_BOB.email, "Recipient email populated correctly");
        assert(!("storage_path" in shareBobFile), "Internal storage_path is NEVER exposed in share response");

        // 2.5 Duplicate share prevention
        try {
            await shareWithUser({
                ownerUid: USER_ALICE.firebase_uid,
                resourceType: "file",
                resourceId: fileDirectId,
                recipientEmail: USER_BOB.email,
                permission: "viewer"
            });
            assert(false, "Duplicate share should throw 409 Conflict");
        } catch (err) {
            assert(err.statusCode === 409, "Duplicate share blocked with 409 Conflict");
        }

        // 2.6 Verify resolved permission for Bob
        const bobFilePerm = await resolvePermission(USER_BOB.firebase_uid, "file", fileDirectId);
        assert(bobFilePerm === "editor", `Direct share resolves 'editor' for Bob (got: ${bobFilePerm})`);

        // =========================================================================
        // TEST SECTION 3: Folder Hierarchy & Nearest Explicit Ancestor Inheritance
        // =========================================================================
        console.log("\n--- TEST SECTION 3: Nested Folder Inheritance (Nearest Ancestor Wins) ---");

        // Structure:
        // rootFolder (shared with Bob as 'viewer')
        //   └── subFolder (shared with Bob as 'editor')
        //         └── deepFolder (NOT shared directly)
        //               └── fileInSubFolder (located in subFolder)

        // Share rootFolder with Bob as 'viewer'
        await shareWithUser({
            ownerUid: USER_ALICE.firebase_uid,
            resourceType: "folder",
            resourceId: rootFolderId,
            recipientEmail: USER_BOB.email,
            permission: "viewer"
        });

        // Test 3.1: Bob's permission on rootFolder is 'viewer'
        const bobRootPerm = await resolvePermission(USER_BOB.firebase_uid, "folder", rootFolderId);
        assert(bobRootPerm === "viewer", `Bob has 'viewer' on directly shared rootFolder (got: ${bobRootPerm})`);

        // Test 3.2: Bob's inherited permission on subFolder before subFolder is directly shared
        // At this point, subFolder inherits from rootFolder ('viewer')
        const bobSubPermBefore = await resolvePermission(USER_BOB.firebase_uid, "folder", subFolderId);
        assert(bobSubPermBefore === "viewer", `subFolder initially inherits 'viewer' from rootFolder (got: ${bobSubPermBefore})`);

        // Now explicitly share subFolder with Bob as 'editor'
        await shareWithUser({
            ownerUid: USER_ALICE.firebase_uid,
            resourceType: "folder",
            resourceId: subFolderId,
            recipientEmail: USER_BOB.email,
            permission: "editor"
        });

        // Test 3.3: Direct share on subFolder overrides rootFolder
        const bobSubPermAfter = await resolvePermission(USER_BOB.firebase_uid, "folder", subFolderId);
        assert(bobSubPermAfter === "editor", `subFolder now resolves 'editor' from direct share (got: ${bobSubPermAfter})`);

        // Test 3.4: deepFolder inherits from nearest ancestor (subFolder = 'editor', NOT rootFolder = 'viewer')
        const bobDeepPerm = await resolvePermission(USER_BOB.firebase_uid, "folder", deepFolderId);
        assert(bobDeepPerm === "editor", `deepFolder inherits 'editor' from nearest ancestor subFolder (got: ${bobDeepPerm})`);

        // Test 3.5: fileInSubFolderId inherits 'editor' from its folder (subFolder)
        const bobFileInSubPerm = await resolvePermission(USER_BOB.firebase_uid, "file", fileInSubFolderId);
        assert(bobFileInSubPerm === "editor", `fileInSubFolder inherits 'editor' from subFolder (got: ${bobFileInSubPerm})`);

        // Test 3.6: fileInRootFolderId inherits 'viewer' from rootFolder
        const bobFileInRootPerm = await resolvePermission(USER_BOB.firebase_uid, "file", fileInRootFolderId);
        assert(bobFileInRootPerm === "viewer", `fileInRootFolder inherits 'viewer' from rootFolder (got: ${bobFileInRootPerm})`);

        // =========================================================================
        // TEST SECTION 4: Direct File Share Precedence over Folder Share
        // =========================================================================
        console.log("\n--- TEST SECTION 4: Direct File Permission Precedence ---");

        // Scenario: fileInSubFolderId is inside subFolder (where Bob has 'editor' inherited).
        // But Alice directly shares fileInSubFolderId with Bob as 'viewer'.
        // Direct file permission ('viewer') MUST take precedence over ancestor 'editor'!
        await shareWithUser({
            ownerUid: USER_ALICE.firebase_uid,
            resourceType: "file",
            resourceId: fileInSubFolderId,
            recipientEmail: USER_BOB.email,
            permission: "viewer"
        });

        const bobPrecedencePerm = await resolvePermission(USER_BOB.firebase_uid, "file", fileInSubFolderId);
        assert(
            bobPrecedencePerm === "viewer",
            `Direct file share ('viewer') takes precedence over inherited folder ('editor') (got: ${bobPrecedencePerm})`
        );

        // =========================================================================
        // TEST SECTION 5: Share Links (Creation, Hashing, Expiry, Anonymous)
        // =========================================================================
        console.log("\n--- TEST SECTION 5: Secure Share Links ---");

        // 5.1 Reject anonymous editor link creation
        try {
            await createShareLink({
                ownerUid: USER_ALICE.firebase_uid,
                resourceType: "file",
                resourceId: fileDirectId,
                permission: "editor",
                isAnonymousAllowed: true
            });
            assert(false, "Anonymous editor share link should be rejected");
        } catch (err) {
            assert(err.statusCode === 400 && err.message.includes("viewer"), "Anonymous editor link rejected with 400");
        }

        // 5.2 Create valid anonymous viewer link for file
        const anonLinkResult = await createShareLink({
            ownerUid: USER_ALICE.firebase_uid,
            resourceType: "file",
            resourceId: fileDirectId,
            permission: "viewer",
            isAnonymousAllowed: true,
            expiresInHours: 24
        });
        assert(anonLinkResult && anonLinkResult.rawToken, "Share link created with raw token");
        assert(anonLinkResult.rawToken.length === 64, "Raw token is a 64-character hex string (32 bytes)");
        assert(!("tokenHash" in anonLinkResult.shareLink), "tokenHash is NEVER exposed in shareLink object");
        assert(anonLinkResult.shareLink.isAnonymousAllowed === true, "isAnonymousAllowed is true");

        // 5.3 Resolve anonymous link without auth
        const resolvedAnon = await resolveShareLink(anonLinkResult.rawToken, null);
        assert(resolvedAnon && resolvedAnon.resource.name === "standalone.txt", "Anonymous link resolves correctly without auth");
        assert(!("storage_path" in resolvedAnon.resource), "Resolved resource never contains storage_path");

        // 5.4 Create authenticated-only link (isAnonymousAllowed = false)
        const authLinkResult = await createShareLink({
            ownerUid: USER_ALICE.firebase_uid,
            resourceType: "folder",
            resourceId: rootFolderId,
            permission: "editor",
            isAnonymousAllowed: false,
            expiresInHours: 1
        });

        // Attempt resolving authenticated link without auth -> must fail with 401
        try {
            await resolveShareLink(authLinkResult.rawToken, null);
            assert(false, "Resolving authenticated-only link anonymously must fail");
        } catch (err) {
            assert(err.statusCode === 401, "Unauthenticated access to protected link returns 401");
        }

        // Resolve authenticated link with authenticated user -> succeeds
        const resolvedAuth = await resolveShareLink(authLinkResult.rawToken, USER_CHARLIE.firebase_uid);
        assert(resolvedAuth && resolvedAuth.resource.name === "RootFolder", "Authenticated user resolves protected link");

        // 5.5 Test expired link
        const expiredLinkResult = await createShareLink({
            ownerUid: USER_ALICE.firebase_uid,
            resourceType: "file",
            resourceId: fileDirectId,
            permission: "viewer",
            isAnonymousAllowed: true,
            expiresInHours: 1
        });

        // Manually set expiration in DB to the past
        await pool.query(
            "UPDATE share_links SET expires_at = NOW() - INTERVAL '1 hour' WHERE id = $1",
            [expiredLinkResult.shareLink.id]
        );

        try {
            await resolveShareLink(expiredLinkResult.rawToken, null);
            assert(false, "Expired link resolution should fail");
        } catch (err) {
            assert(err.statusCode === 410 && err.message.includes("expired"), "Expired link returns 410 Gone");
        }

        // 5.6 Test revoked link
        const revokeTestLink = await createShareLink({
            ownerUid: USER_ALICE.firebase_uid,
            resourceType: "file",
            resourceId: fileDirectId,
            permission: "viewer",
            isAnonymousAllowed: true
        });

        // Non-owner cannot revoke
        try {
            await revokeShareLink({
                ownerUid: USER_BOB.firebase_uid,
                linkId: revokeTestLink.shareLink.id
            });
            assert(false, "Non-owner should not be able to revoke share link");
        } catch (err) {
            assert(err.statusCode === 403, "Non-owner revocation blocked with 403");
        }

        // Owner revokes link
        const revokeRes = await revokeShareLink({
            ownerUid: USER_ALICE.firebase_uid,
            linkId: revokeTestLink.shareLink.id
        });
        assert(revokeRes.success === true, "Owner successfully revoked share link");

        // Attempting to resolve revoked link fails with 410
        try {
            await resolveShareLink(revokeTestLink.rawToken, null);
            assert(false, "Revoked link should not resolve");
        } catch (err) {
            assert(err.statusCode === 410 && err.message.includes("revoked"), "Revoked link returns 410 Gone");
        }

        // =========================================================================
        // TEST SECTION 6: getSharedWithMe and getSharedByMe Queries
        // =========================================================================
        console.log("\n--- TEST SECTION 6: getSharedWithMe & getSharedByMe ---");

        const bobSharedWithMe = await getSharedWithMe(USER_BOB.firebase_uid);
        assert(Array.isArray(bobSharedWithMe.files) && Array.isArray(bobSharedWithMe.folders), "getSharedWithMe returns files and folders arrays");
        assert(bobSharedWithMe.files.length >= 2, `Bob sees shared files (count: ${bobSharedWithMe.files.length})`);
        assert(bobSharedWithMe.folders.length >= 2, `Bob sees shared folders (count: ${bobSharedWithMe.folders.length})`);
        // Verify owner name and email populated
        assert(bobSharedWithMe.files[0].owner_name === "Alice Owner", "Owner name populated in getSharedWithMe");

        const aliceSharedByMe = await getSharedByMe(USER_ALICE.firebase_uid);
        assert(Array.isArray(aliceSharedByMe.files) && Array.isArray(aliceSharedByMe.folders) && Array.isArray(aliceSharedByMe.links), "getSharedByMe returns files, folders, and links");
        assert(aliceSharedByMe.files.length >= 2, "Alice sees files shared by her");
        assert(aliceSharedByMe.folders.length >= 2, "Alice sees folders shared by her");
        assert(aliceSharedByMe.links.length >= 3, "Alice sees active links generated by her");

        // =========================================================================
        // TEST SECTION 7: revokeUserShare
        // =========================================================================
        console.log("\n--- TEST SECTION 7: revokeUserShare ---");

        // Find shareId for standalone.txt shared with Bob
        const fileShareRecord = await pool.query(
            "SELECT id FROM file_shares WHERE file_id = $1 AND shared_with_uid = $2",
            [fileDirectId, USER_BOB.firebase_uid]
        );
        const fileShareId = fileShareRecord.rows[0].id;

        // Non-owner cannot revoke user share
        try {
            await revokeUserShare({
                ownerUid: USER_BOB.firebase_uid,
                resourceType: "file",
                shareId: fileShareId
            });
            assert(false, "Non-owner should not be able to revoke user share");
        } catch (err) {
            assert(err.statusCode === 403, "Non-owner share revocation blocked with 403");
        }

        // Owner revokes user share
        const revokeUserRes = await revokeUserShare({
            ownerUid: USER_ALICE.firebase_uid,
            resourceType: "file",
            shareId: fileShareId
        });
        assert(revokeUserRes.success === true, "Owner successfully revoked user share");

        // Bob's permission on fileDirectId is now null
        const bobRevokedPerm = await resolvePermission(USER_BOB.firebase_uid, "file", fileDirectId);
        assert(bobRevokedPerm === null, `Bob's permission resolves to null after revocation (got: ${bobRevokedPerm})`);

        // =========================================================================
        // TEST SECTION 8: Legacy Records Isolation
        // =========================================================================
        console.log("\n--- TEST SECTION 8: Legacy Records Isolation ---");

        // Legacy file resume.pdf (id=11) has owner_firebase_uid = null
        const legacyFilePermAlice = await resolvePermission(USER_ALICE.firebase_uid, "file", "11");
        assert(legacyFilePermAlice === null, `Legacy file (id=11) with null Firebase UID returns null for Alice (got: ${legacyFilePermAlice})`);

        const legacyFilePermBob = await resolvePermission(USER_BOB.firebase_uid, "file", "11");
        assert(legacyFilePermBob === null, `Legacy file (id=11) returns null for Bob (got: ${legacyFilePermBob})`);

        try {
            await shareWithUser({
                ownerUid: USER_ALICE.firebase_uid,
                resourceType: "file",
                resourceId: "11",
                recipientEmail: USER_BOB.email,
                permission: "viewer"
            });
            assert(false, "Alice should not be able to share legacy file id=11");
        } catch (err) {
            assert(err.statusCode === 403, "Sharing unowned legacy file blocked with 403");
        }

        console.log("\n=======================================================");
        console.log(`SHARING SERVICES TESTS COMPLETE: ${passed} passed, ${failed} failed`);
        console.log("=======================================================\n");

    } catch (err) {
        console.error("Test execution encountered an unexpected error:", err);
        failed++;
    } finally {
        // --- Cleanup Test Data ---
        console.log("Cleaning up test records...");
        try {
            // Delete created shares & links
            if (createdFiles.length > 0) {
                await pool.query("DELETE FROM share_links WHERE file_id = ANY($1)", [createdFiles]);
                await pool.query("DELETE FROM file_shares WHERE file_id = ANY($1)", [createdFiles]);
                await pool.query("DELETE FROM files WHERE id = ANY($1)", [createdFiles]);
            }
            if (createdFolders.length > 0) {
                await pool.query("DELETE FROM share_links WHERE folder_id = ANY($1)", [createdFolders]);
                await pool.query("DELETE FROM folder_shares WHERE folder_id = ANY($1)", [createdFolders]);
                // Delete reverse order to avoid FK parent restriction
                for (const fId of createdFolders.reverse()) {
                    await pool.query("DELETE FROM folders WHERE id = $1", [fId]);
                }
            }
            if (createdUsers.length > 0) {
                await pool.query("DELETE FROM users WHERE id = ANY($1)", [createdUsers]);
            }
        } catch (cleanErr) {
            console.error("Cleanup error:", cleanErr.message);
        }
        await pool.end();
    }

    if (failed > 0) {
        process.exit(1);
    }
}

runTests();
