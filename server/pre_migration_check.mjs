import pool from './src/config/db.js';
import fs from 'fs';
import path from 'path';

async function preMigration() {
  try {
    console.log('--- Step 1: Inspecting Existing Schema ---');
    const tablesRes = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;"
    );
    const existingTables = tablesRes.rows.map(r => r.table_name);
    console.log('Existing tables in public schema:', existingTables);

    // Check if sharing tables already exist
    const sharingTables = ['file_shares', 'folder_shares', 'share_links'];
    const conflictingTables = existingTables.filter(t => sharingTables.includes(t));
    if (conflictingTables.length > 0) {
      console.warn('Warning: Some sharing tables already exist:', conflictingTables);
    } else {
      console.log('Confirmed: No sharing tables exist yet.');
    }

    // Check existing columns of users, folders, files
    for (const table of ['users', 'folders', 'files']) {
      const cols = await pool.query(
        `SELECT column_name, data_type, is_nullable 
         FROM information_schema.columns 
         WHERE table_schema = 'public' AND table_name = $1 
         ORDER BY ordinal_position;`,
        [table]
      );
      console.log(`Table ${table} columns:`, cols.rows.map(c => `${c.column_name} (${c.data_type})`).join(', '));
    }

    // Check existing constraints
    const constraints = await pool.query(`
      SELECT conname, contype, conrelid::regclass AS table_name 
      FROM pg_constraint 
      WHERE connamespace = 'public'::regnamespace;
    `);
    console.log('Existing constraints count:', constraints.rows.length);

    console.log('\n--- Step 2: Checking Existing Data ---');
    const users = await pool.query('SELECT id, name, email, firebase_uid, created_at FROM users ORDER BY id;');
    const folders = await pool.query('SELECT id, name, parent_folder_id, owner_id, owner_firebase_uid, created_at FROM folders ORDER BY id;');
    const files = await pool.query('SELECT id, name, size, mime_type, storage_path, folder_id, owner_id, owner_firebase_uid, created_at FROM files ORDER BY id;');

    console.log(`Users count: ${users.rows.length}`);
    console.log(`Folders count: ${folders.rows.length}`);
    console.log(`Files count: ${files.rows.length}`);

    const resumePdf = files.rows.find(f => f.id === 11);
    console.log('Resume PDF (id=11):', resumePdf);

    console.log('\n--- Step 3: Taking Database Backup ---');
    const backupDir = path.resolve('backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }
    const backupData = {
      timestamp: new Date().toISOString(),
      counts: {
        users: users.rows.length,
        folders: folders.rows.length,
        files: files.rows.length
      },
      data: {
        users: users.rows,
        folders: folders.rows,
        files: files.rows
      }
    };
    const backupPath = path.join(backupDir, `backup_before_feature29_${Date.now()}.json`);
    fs.writeFileSync(backupPath, JSON.stringify(backupData, null, 2), 'utf8');
    console.log(`Backup successfully created at: ${backupPath}`);

    await pool.end();
  } catch (err) {
    console.error('Pre-migration error:', err);
    process.exit(1);
  }
}

preMigration();
