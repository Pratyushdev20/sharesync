/**
 * Test runner: `npm test`
 *
 * Runs every test suite in its own process with NODE_ENV=test and prints a summary.
 * Suites talk to the database configured in .env. To use a separate test database,
 * set TEST_DB_NAME (it is passed to the suites as DB_NAME; run `npm run migrate` against it first).
 *
 * After the run, rows created by test users (uids starting with "test_") in the
 * change-feed / notification / activity tables are removed.
 */
import { spawnSync } from "child_process";

const SUITES = [
    "test_auth_register.mjs",
    "test_auth_login.mjs",
    "test_user_crud.mjs",
    "test_folder_crud.mjs",
    "test_file_crud.mjs",
    "test_frontend_integration.mjs",
    "test_sharing_services.mjs",
    "test_sharing_api.mjs",
    "test_phase_dh.mjs",
    "test_profile_google.mjs",
];

const only = process.argv.slice(2);
const selected = only.length ? SUITES.filter((s) => only.some((o) => s.includes(o))) : SUITES;

const env = { ...process.env, NODE_ENV: "test" };
if (process.env.TEST_DB_NAME) env.DB_NAME = process.env.TEST_DB_NAME;

let totalPassed = 0;
let totalFailed = 0;
const rows = [];

for (const suite of selected) {
    const started = Date.now();
    const r = spawnSync(process.execPath, [suite], { env, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
    const out = `${r.stdout || ""}\n${r.stderr || ""}`;
    const m = [...out.matchAll(/(\d+) passed, (\d+) failed/g)].pop();
    const passed = m ? Number(m[1]) : 0;
    const failed = m ? Number(m[2]) : 1;
    totalPassed += passed;
    totalFailed += failed;
    rows.push({ suite, passed, failed, exit: r.status, seconds: ((Date.now() - started) / 1000).toFixed(1) });
    if (failed > 0 || r.status !== 0) {
        const failures = out.split("\n").filter((l) => l.includes("FAIL") || l.includes("crashed")).slice(0, 20);
        console.log(`\n✗ ${suite}\n${failures.join("\n")}`);
    }
}

// Clean up per-user rows left by test accounts
const { default: pool } = await import("./src/config/db.js");
try {
    for (const t of ["sync_events", "notifications", "sync_devices", "push_tokens"]) {
        await pool.query(`DELETE FROM ${t} WHERE user_uid LIKE 'test\\_%'`);
    }
    await pool.query("DELETE FROM activity_log WHERE actor_uid LIKE 'test\\_%' OR owner_uid LIKE 'test\\_%'");
} catch (err) {
    console.error("cleanup failed:", err.message);
} finally {
    await pool.end();
}

console.log("\nSuite                              Passed  Failed  Exit  Time");
for (const r of rows) {
    console.log(`${r.suite.padEnd(34)} ${String(r.passed).padStart(6)}  ${String(r.failed).padStart(6)}  ${String(r.exit).padStart(4)}  ${r.seconds}s`);
}
console.log(`\nTOTAL: ${totalPassed} passed, ${totalFailed} failed`);
process.exit(totalFailed > 0 || rows.some((r) => r.exit !== 0) ? 1 : 0);
