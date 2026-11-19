import pool from './src/config/db.js';

/**
 * Feature 30 migration: Sharing API, password-protected links, encryption at rest.
 * Additive and idempotent: only adds columns/indexes, never drops or rewrites data.
 *
 * Run: node migrate_feature30_sharing_api.mjs
 */
export async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('--- Starting Feature 30 Migration Transaction ---');
    await client.query('BEGIN;');

    // Password-protected links (scrypt hash, never plaintext) + access tracking
    await client.query(`
      ALTER TABLE share_links
        ADD COLUMN IF NOT EXISTS password_hash TEXT,
        ADD COLUMN IF NOT EXISTS access_count INTEGER NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS last_accessed_at TIMESTAMP WITH TIME ZONE;
    `);
    console.log('1. share_links: password_hash, access_count, last_accessed_at');

    // Encryption-at-rest flag (legacy files stay readable as plaintext) + uploader for shared folders
    await client.query(`
      ALTER TABLE files
        ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS uploaded_by_uid VARCHAR(128);
    `);
    console.log('2. files: is_encrypted, uploaded_by_uid');

    // Lookups used by permission checks and folder-link containment checks
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_files_folder_id ON files(folder_id);
      CREATE INDEX IF NOT EXISTS idx_folders_parent_folder_id_lookup ON folders(parent_folder_id);
      CREATE INDEX IF NOT EXISTS idx_file_shares_lookup ON file_shares(file_id, shared_with_uid);
      CREATE INDEX IF NOT EXISTS idx_folder_shares_lookup ON folder_shares(folder_id, shared_with_uid);
    `);
    console.log('3. lookup indexes');

    await client.query('COMMIT;');
    console.log('--- Feature 30 Migration committed ---');
  } catch (err) {
    await client.query('ROLLBACK;');
    console.error('Migration failed, rolled back:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

if (import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}` || process.argv[1]?.endsWith('migrate_feature30_sharing_api.mjs')) {
  runMigration()
    .then(() => pool.end())
    .catch(() => pool.end().then(() => process.exit(1)));
}
