/**
 * 004 — Real-time sync, notes & documents, notifications, activity log, devices, push tokens.
 * Additive only: new tables plus `version` columns for conflict detection.
 */
export const description = "Sync events, notes, notifications, activity log, devices, push tokens";

export async function up(client) {
    // Optimistic-concurrency versions for conflict detection
    await client.query(`
        ALTER TABLE files   ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
        ALTER TABLE folders ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
    `);

    // Notes and text documents, stored in PostgreSQL and organised in folders
    await client.query(`
        CREATE TABLE IF NOT EXISTS notes (
            id BIGSERIAL PRIMARY KEY,
            owner_firebase_uid VARCHAR(128) NOT NULL,
            folder_id BIGINT REFERENCES folders(id) ON DELETE RESTRICT,
            kind VARCHAR(20) NOT NULL DEFAULT 'note',
            title VARCHAR(255) NOT NULL,
            content TEXT NOT NULL DEFAULT '',
            version INTEGER NOT NULL DEFAULT 1,
            created_by_uid VARCHAR(128) NOT NULL,
            updated_by_uid VARCHAR(128) NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT chk_notes_kind CHECK (kind IN ('note', 'document')),
            CONSTRAINT chk_notes_title CHECK (length(btrim(title)) > 0),
            CONSTRAINT chk_notes_content_size CHECK (octet_length(content) <= 524288),
            CONSTRAINT chk_notes_version CHECK (version >= 1)
        );
        CREATE INDEX IF NOT EXISTS idx_notes_owner ON notes(owner_firebase_uid, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_notes_folder ON notes(folder_id);
    `);

    // In-app notifications (read/unread, history)
    await client.query(`
        CREATE TABLE IF NOT EXISTS notifications (
            id BIGSERIAL PRIMARY KEY,
            user_uid VARCHAR(128) NOT NULL,
            type VARCHAR(50) NOT NULL,
            title VARCHAR(255) NOT NULL,
            body TEXT NOT NULL DEFAULT '',
            resource_type VARCHAR(20),
            resource_id BIGINT,
            actor_uid VARCHAR(128),
            data JSONB NOT NULL DEFAULT '{}'::jsonb,
            read_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT chk_notifications_resource_type
                CHECK (resource_type IS NULL OR resource_type IN ('file', 'folder', 'note'))
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_user_created ON notifications(user_uid, created_at DESC, id DESC);
        CREATE INDEX IF NOT EXISTS idx_notifications_user_unread ON notifications(user_uid) WHERE read_at IS NULL;
    `);

    // Activity / audit log
    await client.query(`
        CREATE TABLE IF NOT EXISTS activity_log (
            id BIGSERIAL PRIMARY KEY,
            actor_uid VARCHAR(128),
            action VARCHAR(50) NOT NULL,
            resource_type VARCHAR(20),
            resource_id BIGINT,
            owner_uid VARCHAR(128),
            metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_activity_resource ON activity_log(resource_type, resource_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_activity_owner ON activity_log(owner_uid, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_activity_actor ON activity_log(actor_uid, created_at DESC);
    `);

    // Per-user change feed: lets devices catch up after being offline
    await client.query(`
        CREATE TABLE IF NOT EXISTS sync_events (
            id BIGSERIAL PRIMARY KEY,
            user_uid VARCHAR(128) NOT NULL,
            event_type VARCHAR(50) NOT NULL,
            resource_type VARCHAR(20) NOT NULL,
            resource_id BIGINT,
            folder_id BIGINT,
            payload JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        CREATE INDEX IF NOT EXISTS idx_sync_events_user_id ON sync_events(user_uid, id);
        CREATE INDEX IF NOT EXISTS idx_sync_events_created ON sync_events(created_at);
    `);

    // Devices that synchronise with an account
    await client.query(`
        CREATE TABLE IF NOT EXISTS sync_devices (
            id BIGSERIAL PRIMARY KEY,
            user_uid VARCHAR(128) NOT NULL,
            device_id VARCHAR(64) NOT NULL,
            platform VARCHAR(20),
            device_name VARCHAR(100),
            last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_sync_cursor BIGINT,
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT uq_sync_devices UNIQUE (user_uid, device_id)
        );
    `);

    // Mobile push tokens (delivery is optional / configurable)
    await client.query(`
        CREATE TABLE IF NOT EXISTS push_tokens (
            id BIGSERIAL PRIMARY KEY,
            user_uid VARCHAR(128) NOT NULL,
            token VARCHAR(255) NOT NULL,
            platform VARCHAR(20),
            created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            last_used_at TIMESTAMPTZ,
            CONSTRAINT uq_push_tokens_token UNIQUE (token)
        );
        CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_uid);
    `);
}
