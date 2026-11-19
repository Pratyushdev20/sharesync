/**
 * 005 — Sync state (key/value), used to remember the highest change-feed id removed by
 * retention pruning. Devices whose cursor is below it must do a full reload.
 */
export const description = "Sync state (prune watermark)";

export async function up(client) {
    await client.query(`
        CREATE TABLE IF NOT EXISTS sync_state (
            key VARCHAR(50) PRIMARY KEY,
            value BIGINT NOT NULL DEFAULT 0,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
        );
        INSERT INTO sync_state (key, value) VALUES ('prune_watermark', 0) ON CONFLICT (key) DO NOTHING;
    `);
}
