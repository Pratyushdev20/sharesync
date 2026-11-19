/**
 * 001 — Baseline schema for the core tables (users, folders, files).
 *
 * These tables were originally created by hand. This migration reproduces their current
 * structure with IF NOT EXISTS guards so that:
 *  - an existing database is left untouched (no-op), and
 *  - a brand-new database can be built from scratch.
 */
export const description = "Baseline users / folders / files schema";

export async function up(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS users (
            id BIGSERIAL PRIMARY KEY,
            name VARCHAR(100) NOT NULL,
            email VARCHAR(255) NOT NULL,
            password_hash VARCHAR(255),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            firebase_uid VARCHAR(255)
        );
    `);
    await client.query(`
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_email_unique') THEN
                ALTER TABLE users ADD CONSTRAINT users_email_unique UNIQUE (email);
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_firebase_uid_key') THEN
                ALTER TABLE users ADD CONSTRAINT users_firebase_uid_key UNIQUE (firebase_uid);
            END IF;
        END $$;
    `);

    await client.query(`
        CREATE TABLE IF NOT EXISTS folders (
            id BIGSERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            owner_id BIGINT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            owner_firebase_uid VARCHAR(128),
            parent_folder_id BIGINT,
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await client.query(`
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'folders_owner_fk') THEN
                ALTER TABLE folders ADD CONSTRAINT folders_owner_fk
                    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'folders_parent_fk') THEN
                ALTER TABLE folders ADD CONSTRAINT folders_parent_fk
                    FOREIGN KEY (parent_folder_id) REFERENCES folders(id) ON DELETE RESTRICT;
            END IF;
        END $$;
    `);
    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_folders_owner_firebase_uid ON folders(owner_firebase_uid);
        CREATE INDEX IF NOT EXISTS idx_folders_parent_folder_id ON folders(parent_folder_id);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_unique_root_name
            ON folders(owner_firebase_uid, name) WHERE parent_folder_id IS NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_folders_unique_child_name
            ON folders(owner_firebase_uid, parent_folder_id, name) WHERE parent_folder_id IS NOT NULL;
    `);

    await client.query(`
        CREATE TABLE IF NOT EXISTS files (
            id BIGSERIAL PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            size BIGINT NOT NULL,
            mime_type VARCHAR(100) NOT NULL,
            storage_path VARCHAR(500) NOT NULL,
            owner_id BIGINT NOT NULL,
            folder_id BIGINT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            owner_firebase_uid VARCHAR(128),
            updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
        );
    `);
    await client.query(`
        DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'files_owner_fk') THEN
                ALTER TABLE files ADD CONSTRAINT files_owner_fk
                    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE;
            END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'files_folder_fk') THEN
                ALTER TABLE files ADD CONSTRAINT files_folder_fk
                    FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE;
            END IF;
        END $$;
    `);
    await client.query(`
        CREATE INDEX IF NOT EXISTS idx_folder_owner_id ON files(owner_id);
        CREATE INDEX IF NOT EXISTS idx_folder_folder_id ON files(folder_id);
        CREATE INDEX IF NOT EXISTS idx_files_owner_firebase_uid ON files(owner_firebase_uid);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_files_unique_name_in_folder
            ON files(owner_firebase_uid, folder_id, LOWER(name))
            WHERE folder_id IS NOT NULL AND owner_firebase_uid IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_files_unique_root_name
            ON files(owner_firebase_uid, LOWER(name))
            WHERE folder_id IS NULL AND owner_firebase_uid IS NOT NULL;
    `);
}
