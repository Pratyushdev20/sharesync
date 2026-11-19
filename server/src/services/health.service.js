import pool from "../config/db.js";
import storageService from "./storage.service.js";
import { getMasterKey } from "../utils/crypto.js";
import { isRealtimeRunning } from "../realtime/socket.js";

const startedAt = Date.now();

/** Liveness: the process is up (cheap, no dependencies). */
export const getHealthStatus = () => {
    return {
        service: "shareSync API",
        status: "healthy",
        uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    };
};

/**
 * Readiness: every dependency needed to serve requests works.
 * Reports only pass/fail per check (no hostnames, credentials or error internals).
 */
export async function getReadiness() {
    const checks = {};

    const timed = async (name, fn) => {
        const start = Date.now();
        try {
            await fn();
            checks[name] = { ok: true, ms: Date.now() - start };
        } catch {
            checks[name] = { ok: false, ms: Date.now() - start };
        }
    };

    await timed("database", () => pool.query("SELECT 1"));
    await timed("migrations", async () => {
        const res = await pool.query("SELECT COUNT(*)::int AS c FROM schema_migrations");
        if (res.rows[0].c < 1) throw new Error("no migrations applied");
    });
    await timed("storage", () => storageService.check());
    await timed("encryptionKey", async () => getMasterKey());
    checks.realtime = { ok: isRealtimeRunning() };

    const ready = Object.entries(checks).every(([name, c]) => c.ok || name === "realtime");
    return { status: ready ? "ready" : "not_ready", storageDriver: storageService.driver, checks };
}
