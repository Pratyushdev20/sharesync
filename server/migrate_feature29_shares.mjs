import pool from './src/config/db.js';

export async function runMigration() {
  const client = await pool.connect();
  try {
    console.log('--- Starting Feature 29 Migration Transaction ---');
    await client.query('BEGIN;');

    // 1. file_shares table
    console.log('1. Creating or verifying file_shares table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS file_shares (
        id BIGSERIAL PRIMARY KEY,
        file_id BIGINT NOT NULL,
        shared_by_uid VARCHAR(128) NOT NULL,
        shared_with_uid VARCHAR(128) NOT NULL,
        permission VARCHAR(20) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // file_shares foreign key
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_file_shares_file_id'
        ) THEN
          ALTER TABLE file_shares
            ADD CONSTRAINT fk_file_shares_file_id
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // file_shares permission check
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_file_shares_permission'
        ) THEN
          ALTER TABLE file_shares
            ADD CONSTRAINT chk_file_shares_permission
            CHECK (permission IN ('viewer', 'editor'));
        END IF;
      END $$;
    `);

    // file_shares unique pair
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_file_share'
        ) THEN
          ALTER TABLE file_shares
            ADD CONSTRAINT uq_file_share
            UNIQUE (file_id, shared_with_uid);
        END IF;
      END $$;
    `);

    // file_shares no self share check
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_file_no_self_share'
        ) THEN
          ALTER TABLE file_shares
            ADD CONSTRAINT chk_file_no_self_share
            CHECK (shared_by_uid <> shared_with_uid);
        END IF;
      END $$;
    `);

    // file_shares indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_file_shares_file_id ON file_shares(file_id);
      CREATE INDEX IF NOT EXISTS idx_file_shares_shared_with_uid ON file_shares(shared_with_uid);
      CREATE INDEX IF NOT EXISTS idx_file_shares_shared_by_uid ON file_shares(shared_by_uid);
    `);

    // 2. folder_shares table
    console.log('2. Creating or verifying folder_shares table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS folder_shares (
        id BIGSERIAL PRIMARY KEY,
        folder_id BIGINT NOT NULL,
        shared_by_uid VARCHAR(128) NOT NULL,
        shared_with_uid VARCHAR(128) NOT NULL,
        permission VARCHAR(20) NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // folder_shares foreign key
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_folder_shares_folder_id'
        ) THEN
          ALTER TABLE folder_shares
            ADD CONSTRAINT fk_folder_shares_folder_id
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // folder_shares permission check
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_folder_shares_permission'
        ) THEN
          ALTER TABLE folder_shares
            ADD CONSTRAINT chk_folder_shares_permission
            CHECK (permission IN ('viewer', 'editor'));
        END IF;
      END $$;
    `);

    // folder_shares unique pair
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_folder_share'
        ) THEN
          ALTER TABLE folder_shares
            ADD CONSTRAINT uq_folder_share
            UNIQUE (folder_id, shared_with_uid);
        END IF;
      END $$;
    `);

    // folder_shares no self share check
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_folder_no_self_share'
        ) THEN
          ALTER TABLE folder_shares
            ADD CONSTRAINT chk_folder_no_self_share
            CHECK (shared_by_uid <> shared_with_uid);
        END IF;
      END $$;
    `);

    // folder_shares indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_folder_shares_folder_id ON folder_shares(folder_id);
      CREATE INDEX IF NOT EXISTS idx_folder_shares_shared_with_uid ON folder_shares(shared_with_uid);
      CREATE INDEX IF NOT EXISTS idx_folder_shares_shared_by_uid ON folder_shares(shared_by_uid);
    `);

    // 3. share_links table
    console.log('3. Creating or verifying share_links table...');
    await client.query(`
      CREATE TABLE IF NOT EXISTS share_links (
        id BIGSERIAL PRIMARY KEY,
        token_hash VARCHAR(64) NOT NULL,
        file_id BIGINT,
        folder_id BIGINT,
        created_by_uid VARCHAR(128) NOT NULL,
        permission VARCHAR(20) NOT NULL,
        is_anonymous_allowed BOOLEAN NOT NULL DEFAULT false,
        expires_at TIMESTAMP WITH TIME ZONE,
        is_active BOOLEAN NOT NULL DEFAULT true,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // share_links unique token_hash
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'uq_share_links_token_hash'
        ) THEN
          ALTER TABLE share_links
            ADD CONSTRAINT uq_share_links_token_hash
            UNIQUE (token_hash);
        END IF;
      END $$;
    `);

    // share_links foreign keys
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_share_links_file_id'
        ) THEN
          ALTER TABLE share_links
            ADD CONSTRAINT fk_share_links_file_id
            FOREIGN KEY (file_id) REFERENCES files(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'fk_share_links_folder_id'
        ) THEN
          ALTER TABLE share_links
            ADD CONSTRAINT fk_share_links_folder_id
            FOREIGN KEY (folder_id) REFERENCES folders(id) ON DELETE CASCADE;
        END IF;
      END $$;
    `);

    // share_links permission check
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_share_links_permission'
        ) THEN
          ALTER TABLE share_links
            ADD CONSTRAINT chk_share_links_permission
            CHECK (permission IN ('viewer', 'editor'));
        END IF;
      END $$;
    `);

    // share_links exclusive resource check
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_share_links_resource'
        ) THEN
          ALTER TABLE share_links
            ADD CONSTRAINT chk_share_links_resource
            CHECK (
              (file_id IS NOT NULL AND folder_id IS NULL) OR
              (file_id IS NULL AND folder_id IS NOT NULL)
            );
        END IF;
      END $$;
    `);

    // share_links anonymous viewer only check
    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'chk_anonymous_viewer_only'
        ) THEN
          ALTER TABLE share_links
            ADD CONSTRAINT chk_anonymous_viewer_only
            CHECK (NOT (is_anonymous_allowed = true AND permission <> 'viewer'));
        END IF;
      END $$;
    `);

    // share_links indexes
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_share_links_token_hash ON share_links(token_hash);
      CREATE INDEX IF NOT EXISTS idx_share_links_file_id ON share_links(file_id);
      CREATE INDEX IF NOT EXISTS idx_share_links_folder_id ON share_links(folder_id);
      CREATE INDEX IF NOT EXISTS idx_share_links_created_by_uid ON share_links(created_by_uid);
      CREATE INDEX IF NOT EXISTS idx_share_links_active ON share_links(is_active) WHERE is_active = true;
    `);

    await client.query('COMMIT;');
    console.log('--- Migration Transaction Committed Successfully ---');
  } catch (error) {
    await client.query('ROLLBACK;');
    console.error('--- Migration Failed and Rolled Back ---', error);
    throw error;
  } finally {
    client.release();
  }
}

if (process.argv[1]?.endsWith('migrate_feature29_shares.mjs')) {
  runMigration()
    .then(() => pool.end())
    .catch(() => {
      pool.end();
      process.exit(1);
    });
}
