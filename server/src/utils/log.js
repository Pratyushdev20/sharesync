/**
 * Structured JSON logger (one JSON object per line), no external dependency.
 *
 *   log.info("file.uploaded", { fileId, uid })
 *   log.error("db.error", { err })
 *
 * - Level controlled by LOG_LEVEL (debug | info | warn | error), default "info" ("warn" in tests).
 * - Known secret-bearing keys are redacted; long hex tokens in strings are masked.
 * - Error objects are serialised with message/code (stack only outside production).
 */
const LEVELS = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 };
const SECRET_KEYS = /^(authorization|password|token|idtoken|x-share-password|private_?key|secret|cookie|password_hash|token_hash)$/i;

function currentLevel() {
    const configured = (process.env.LOG_LEVEL || "").toLowerCase();
    if (LEVELS[configured]) return LEVELS[configured];
    return process.env.NODE_ENV === "test" ? LEVELS.warn : LEVELS.info;
}

function sanitize(value, depth = 0) {
    if (depth > 4) return "[depth]";
    if (value instanceof Error) {
        const out = { message: value.message, name: value.name };
        if (value.code) out.code = value.code;
        if (value.statusCode) out.statusCode = value.statusCode;
        if (process.env.NODE_ENV !== "production" && value.stack) out.stack = value.stack.split("\n").slice(0, 6).join("\n");
        return out;
    }
    if (typeof value === "string") return value.replace(/[0-9a-fA-F]{32,}/g, "[redacted]");
    if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
    if (value && typeof value === "object") {
        const out = {};
        for (const [k, v] of Object.entries(value)) {
            out[k] = SECRET_KEYS.test(k) ? "[redacted]" : sanitize(v, depth + 1);
        }
        return out;
    }
    return value;
}

function write(level, event, fields) {
    if (LEVELS[level] < currentLevel()) return;
    const entry = { time: new Date().toISOString(), level, event, ...sanitize(fields || {}) };
    const line = JSON.stringify(entry);
    if (level === "error" || level === "warn") process.stderr.write(line + "\n");
    else process.stdout.write(line + "\n");
}

const log = {
    debug: (event, fields) => write("debug", event, fields),
    info: (event, fields) => write("info", event, fields),
    warn: (event, fields) => write("warn", event, fields),
    error: (event, fields) => write("error", event, fields),
    sanitize,
};

export default log;
