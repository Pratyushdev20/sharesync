import pool from './src/config/db.js';
import fs from 'fs';
import path from 'path';

async function exportSql() {
  const users = await pool.query('SELECT * FROM users ORDER BY id;');
  const folders = await pool.query('SELECT * FROM folders ORDER BY id;');
  const files = await pool.query('SELECT * FROM files ORDER BY id;');

  let sql = `-- Database Backup Before Feature 29 Migration\n-- Timestamp: ${new Date().toISOString()}\n\n`;

  sql += `-- USERS (${users.rows.length} rows)\n`;
  for (const u of users.rows) {
    sql += `INSERT INTO users (id, name, email, password_hash, created_at, firebase_uid) VALUES (${u.id}, ${escapeSql(u.name)}, ${escapeSql(u.email)}, ${escapeSql(u.password_hash)}, ${escapeSql(u.created_at)}, ${escapeSql(u.firebase_uid)}) ON CONFLICT (id) DO NOTHING;\n`;
  }

  sql += `\n-- FOLDERS (${folders.rows.length} rows)\n`;
  for (const f of folders.rows) {
    sql += `INSERT INTO folders (id, name, owner_id, created_at, owner_firebase_uid, parent_folder_id, updated_at) VALUES (${f.id}, ${escapeSql(f.name)}, ${f.owner_id}, ${escapeSql(f.created_at)}, ${escapeSql(f.owner_firebase_uid)}, ${f.parent_folder_id}, ${escapeSql(f.updated_at)}) ON CONFLICT (id) DO NOTHING;\n`;
  }

  sql += `\n-- FILES (${files.rows.length} rows)\n`;
  for (const fl of files.rows) {
    sql += `INSERT INTO files (id, name, size, mime_type, storage_path, owner_id, folder_id, created_at, owner_firebase_uid, updated_at) VALUES (${fl.id}, ${escapeSql(fl.name)}, ${fl.size}, ${escapeSql(fl.mime_type)}, ${escapeSql(fl.storage_path)}, ${fl.owner_id}, ${fl.folder_id}, ${escapeSql(fl.created_at)}, ${escapeSql(fl.owner_firebase_uid)}, ${escapeSql(fl.updated_at)}) ON CONFLICT (id) DO NOTHING;\n`;
  }

  const backupDir = path.resolve('backups');
  const sqlPath = path.join(backupDir, 'pre_feature29_backup.sql');
  fs.writeFileSync(sqlPath, sql, 'utf8');
  console.log('SQL backup written to:', sqlPath);
  await pool.end();
}

function escapeSql(val) {
  if (val === null || val === undefined) return 'NULL';
  if (val instanceof Date) return `'${val.toISOString()}'`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

exportSql();
