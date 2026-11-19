/**
 * 003 — Link passwords, access counts, encryption flag, uploader (Feature 30).
 * Wraps the original idempotent Feature 30 migration.
 */
import { runMigration } from "../migrate_feature30_sharing_api.mjs";

export const description = "Sharing API, link passwords, encryption flag (feature 30)";
export const managesOwnTransaction = true;

export async function up() {
    await runMigration();
}
