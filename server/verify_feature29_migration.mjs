import pool from './src/config/db.js';
import { runMigration } from './migrate_feature29_shares.mjs';

async function verify() {
  try {
    console.log('=== Step 1: Run Initial Migration ===');
    await runMigration();

    console.log('\n=== Step 2: Verify Tables Existence ===');
    const tablesRes = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('file_shares', 'folder_shares', 'share_links')
      ORDER BY table_name;
    `);
    const tables = tablesRes.rows.map(r => r.table_name);
    console.log('Detected sharing tables:', tables);
    if (tables.length !== 3) {
      throw new Error(`Expected 3 sharing tables, got ${tables.length}`);
    }

    console.log('\n=== Step 3: Verify Foreign Keys & Cascades ===');
    const fkRes = await pool.query(`
      SELECT 
        conname AS fk_name,
        conrelid::regclass AS table_name,
        confrelid::regclass AS referenced_table,
        CASE confdeltype
          WHEN 'c' THEN 'CASCADE'
          WHEN 'r' THEN 'RESTRICT'
          WHEN 'n' THEN 'SET NULL'
          WHEN 'a' THEN 'NO ACTION'
          ELSE confdeltype::text
        END AS delete_rule
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace AND contype = 'f'
        AND conrelid::regclass::text IN ('file_shares', 'folder_shares', 'share_links')
      ORDER BY conname;
    `);
    console.log('Foreign keys on sharing tables:');
    console.table(fkRes.rows);

    const expectedFks = [
      { fk_name: 'fk_file_shares_file_id', table: 'file_shares', ref: 'files', del: 'CASCADE' },
      { fk_name: 'fk_folder_shares_folder_id', table: 'folder_shares', ref: 'folders', del: 'CASCADE' },
      { fk_name: 'fk_share_links_file_id', table: 'share_links', ref: 'files', del: 'CASCADE' },
      { fk_name: 'fk_share_links_folder_id', table: 'share_links', ref: 'folders', del: 'CASCADE' },
    ];
    for (const exp of expectedFks) {
      const match = fkRes.rows.find(r => r.fk_name === exp.fk_name);
      if (!match) throw new Error(`Missing foreign key: ${exp.fk_name}`);
      if (match.delete_rule !== exp.del) throw new Error(`Unexpected delete rule on ${exp.fk_name}: ${match.delete_rule}`);
    }

    console.log('\n=== Step 4: Verify Constraints & Unique Keys ===');
    const constRes = await pool.query(`
      SELECT 
        conname,
        conrelid::regclass AS table_name,
        contype,
        pg_get_constraintdef(oid) AS definition
      FROM pg_constraint
      WHERE connamespace = 'public'::regnamespace
        AND conrelid::regclass::text IN ('file_shares', 'folder_shares', 'share_links')
      ORDER BY table_name, conname;
    `);
    console.log('All constraints on sharing tables:');
    console.table(constRes.rows.map(r => ({ table: r.table_name, name: r.conname, def: r.definition })));

    const expectedConstraints = [
      'uq_file_share',
      'chk_file_no_self_share',
      'chk_file_shares_permission',
      'uq_folder_share',
      'chk_folder_no_self_share',
      'chk_folder_shares_permission',
      'uq_share_links_token_hash',
      'chk_share_links_resource',
      'chk_anonymous_viewer_only',
      'chk_share_links_permission'
    ];
    for (const name of expectedConstraints) {
      if (!constRes.rows.some(r => r.conname === name)) {
        throw new Error(`Missing expected constraint: ${name}`);
      }
    }

    console.log('\n=== Step 5: Verify Indexes ===');
    const idxRes = await pool.query(`
      SELECT 
        tablename,
        indexname,
        indexdef
      FROM pg_indexes
      WHERE schemaname = 'public' 
        AND tablename IN ('file_shares', 'folder_shares', 'share_links')
      ORDER BY tablename, indexname;
    `);
    console.log('Indexes on sharing tables:');
    console.table(idxRes.rows.map(r => ({ table: r.tablename, name: r.indexname })));

    console.log('\n=== Step 6: Verify Existing Records Unchanged ===');
    const usersCount = await pool.query('SELECT count(*) FROM users;');
    const foldersCount = await pool.query('SELECT count(*) FROM folders;');
    const filesCount = await pool.query('SELECT count(*) FROM files;');
    const resumePdf = await pool.query("SELECT * FROM files WHERE id = '11';");

    console.log('Live record counts:', {
      users: parseInt(usersCount.rows[0].count, 10),
      folders: parseInt(foldersCount.rows[0].count, 10),
      files: parseInt(filesCount.rows[0].count, 10),
    });

    if (parseInt(usersCount.rows[0].count, 10) !== 3) throw new Error('Users count changed!');
    if (parseInt(foldersCount.rows[0].count, 10) !== 2) throw new Error('Folders count changed!');
    if (parseInt(filesCount.rows[0].count, 10) !== 1) throw new Error('Files count changed!');

    if (resumePdf.rows.length !== 1 || resumePdf.rows[0].name !== 'resume.pdf' || resumePdf.rows[0].storage_path !== '/users/1/files/resume.pdf') {
      throw new Error('Legacy resume.pdf (id=11) was modified or missing!');
    }
    console.log('Legacy resume.pdf (id=11) intact:', resumePdf.rows[0]);

    console.log('\n=== Step 7: Test Rerun-Safety (Run Migration Second Time) ===');
    await runMigration();
    console.log('Second migration run completed successfully without errors!');

    console.log('\nALL VERIFICATION CHECKS PASSED SUCCESSFULLY.');
    await pool.end();
  } catch (err) {
    console.error('Verification failed:', err);
    await pool.end();
    process.exit(1);
  }
}

verify();
