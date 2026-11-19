/**
 * 002 — Sharing tables (file_shares, folder_shares, share_links).
 * Wraps the original Feature 29 migration, which is idempotent and manages its own transaction.
 */
import { runMigration } from "../migrate_feature29_shares.mjs";

export const description = "Sharing tables (feature 29)";
export const managesOwnTransaction = true;

export async function up() {
    await runMigration();
}
