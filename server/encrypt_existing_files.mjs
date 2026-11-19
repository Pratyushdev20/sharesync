/**
 * One-time job: encrypt files that were uploaded before encryption at rest existed.
 *
 *   node encrypt_existing_files.mjs          -> dry run (shows what would change, touches nothing)
 *   node encrypt_existing_files.mjs --apply  -> encrypts them
 *
 * Safety: each file is encrypted to a temporary file, decrypted again and compared byte-for-byte
 * with the original before it replaces the original. The database flag is only set after the swap.
 * Make sure FILE_ENCRYPTION_KEY is backed up first: without it encrypted files cannot be read.
 */
import fs from "fs";
import path from "path";
import pool from "./src/config/db.js";
import env from "./src/config/env.js";
import { encryptBuffer, createDecryptStream, ENC_HEADER_LEN, getMasterKey } from "./src/utils/crypto.js";

const apply = process.argv.includes("--apply");

function decryptWhole(buf) {
    const decipher = createDecryptStream(buf.subarray(0, ENC_HEADER_LEN), buf.subarray(buf.length - 16));
    return Buffer.concat([decipher.update(buf.subarray(ENC_HEADER_LEN, buf.length - 16)), decipher.final()]);
}

async function main() {
    getMasterKey(); // fail early if the key is missing
    const baseDir = path.resolve(env.uploadDir);
    const res = await pool.query("SELECT id, name, storage_path FROM files WHERE is_encrypted = false ORDER BY id");
    console.log(`${res.rows.length} unencrypted file record(s) found. Mode: ${apply ? "APPLY" : "DRY RUN"}`);

    let done = 0, missing = 0, failed = 0;
    for (const row of res.rows) {
        const full = path.resolve(baseDir, row.storage_path);
        const rel = path.relative(baseDir, full);
        if (!rel || rel.startsWith("..") || path.isAbsolute(rel)) {
            console.log(`  [skip] #${row.id} ${row.name}: storage path outside uploads dir`);
            failed++;
            continue;
        }
        if (!fs.existsSync(full)) {
            console.log(`  [missing] #${row.id} ${row.name}: file not on disk (${row.storage_path})`);
            missing++;
            continue;
        }
        if (!apply) {
            console.log(`  [would encrypt] #${row.id} ${row.name}`);
            continue;
        }
        try {
            const plain = await fs.promises.readFile(full);
            const enc = encryptBuffer(plain);
            if (!decryptWhole(enc).equals(plain)) throw new Error("verification failed");
            const tmp = `${full}.enc-tmp`;
            await fs.promises.writeFile(tmp, enc, { mode: 0o600 });
            await fs.promises.rename(tmp, full);
            await pool.query("UPDATE files SET is_encrypted = true WHERE id = $1", [row.id]);
            console.log(`  [encrypted] #${row.id} ${row.name}`);
            done++;
        } catch (err) {
            console.log(`  [failed] #${row.id} ${row.name}: ${err.message} (original left unchanged)`);
            failed++;
        }
    }
    console.log(`Done. encrypted=${done} missing=${missing} failed=${failed}`);
    await pool.end();
}

main().catch(async (err) => {
    console.error(err.message);
    await pool.end();
    process.exit(1);
});
