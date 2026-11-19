import http from "http";
import app from "./src/app.js";
import env, { validateEnv } from "./src/config/env.js";
import pool from "./src/config/db.js";
import { getMasterKey } from "./src/utils/crypto.js";
import { initRealtime, closeRealtime } from "./src/realtime/socket.js";
import { pruneSyncEvents } from "./src/services/events.service.js";
import log from "./src/utils/log.js";

// Fail fast on missing / unsafe configuration (never prints secret values)
const problems = validateEnv();
try {
    getMasterKey();
} catch (err) {
    problems.push(err.message);
}
if (problems.length > 0) {
    for (const p of problems) log.error("startup.config_error", { problem: p });
    process.exit(1);
}

const server = http.createServer(app);
initRealtime(server);

// Keep the sync change feed bounded
pruneSyncEvents();
const pruneTimer = setInterval(pruneSyncEvents, 6 * 60 * 60 * 1000);
pruneTimer.unref();

server.listen(env.port, () => {
    log.info("server.started", { port: env.port, env: env.nodeEnv });
    console.log(`sharesync is working on ${env.port}`);
});

// Graceful shutdown: stop accepting, close sockets and the DB pool
async function shutdown(signal) {
    log.info("server.stopping", { signal });
    server.close();
    await closeRealtime();
    await pool.end().catch(() => {});
    process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => log.error("process.unhandled_rejection", { err: reason }));
