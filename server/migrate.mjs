/**
 * Migration runner.
 *
 *   npm run migrate            apply pending migrations
 *   npm run migrate -- --status  list applied / pending migrations
 *
 * - Migrations live in ./migrations, run in filename order, each exactly once
 *   (recorded in schema_migrations).
 * - Each migration runs in a transaction unless it declares managesOwnTransaction.
 * - A PostgreSQL advisory lock prevents two runners from migrating at the same time.
 * - Every migration is written to be idempotent and additive (never drops data).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import pool from "./src/config/db.js";

const MIGRATIONS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
const LOCK_KEY = 74_210_031; // arbitrary constant for pg_advisory_lock

export async function listMigrations() {
    return fs.readdirSync(MIGRATIONS_DIR)
        .filter((f) => /^\d{3}_.+\.mjs$/.test(f))
        .sort();
}

export async function runMigrations({ log = console.log } = {}) {
    const lockClient = await pool.connect();
    try {
        await lockClient.query("SELECT pg_advisory_lock($1)", [LOCK_KEY]);
        await lockClient.query(`
            CREATE TABLE IF NOT EXISTS schema_migrations (
                name VARCHAR(255) PRIMARY KEY,
                description TEXT,
                applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
            );
        `);
        const applied = new Set(
            (await lockClient.query("SELECT name FROM schema_migrations")).rows.map((r) => r.name)
        );

        const files = await listMigrations();
        let count = 0;
        for (const file of files) {
            if (applied.has(file)) continue;
            const mod = await import(pathToFileURL(path.join(MIGRATIONS_DIR, file)).href);
            log(`→ applying ${file}: ${mod.description || ""}`);

            if (mod.managesOwnTransaction) {
                await mod.up();
                await lockClient.query(
                    "INSERT INTO schema_migrations (name, description) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                    [file, mod.description || null]
                );
            } else {
                const client = await pool.connect();
                try {
                    await client.query("BEGIN");
                    await mod.up(client);
                    await client.query(
                        "INSERT INTO schema_migrations (name, description) VALUES ($1, $2) ON CONFLICT DO NOTHING",
                        [file, mod.description || null]
                    );
                    await client.query("COMMIT");
                } catch (err) {
                    await client.query("ROLLBACK");
                    throw new Error(`Migration ${file} failed and was rolled back: ${err.message}`);
                } finally {
                    client.release();
                }
            }
            count++;
        }
        log(count === 0 ? "Database is up to date." : `Applied ${count} migration(s).`);
        return count;
    } finally {
        await lockClient.query("SELECT pg_advisory_unlock($1)", [LOCK_KEY]).catch(() => {});
        lockClient.release();
    }
}

async function status() {
    await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
        name VARCHAR(255) PRIMARY KEY, description TEXT,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP)`);
    const applied = new Map(
        (await pool.query("SELECT name, applied_at FROM schema_migrations")).rows.map((r) => [r.name, r.applied_at])
    );
    for (const f of await listMigrations()) {
        console.log(`${applied.has(f) ? "applied " : "PENDING "} ${f}${applied.has(f) ? `  (${applied.get(f).toISOString()})` : ""}`);
    }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
    const task = process.argv.includes("--status") ? status() : runMigrations();
    task
        .then(() => pool.end())
        .catch(async (err) => {
            console.error(err.message);
            await pool.end();
            process.exit(1);
        });
}
