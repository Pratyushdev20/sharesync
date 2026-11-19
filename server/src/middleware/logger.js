import crypto from "crypto";
import log from "../utils/log.js";

/**
 * Share-link tokens are secrets, so any long hex token in a URL is redacted
 * before logging (logs are often shipped to third-party services).
 */
export function redactUrl(url) {
    return String(url).replace(/[0-9a-fA-F]{32,}/g, "[redacted]");
}

/**
 * Structured request logger: assigns a request id (also returned in X-Request-Id),
 * and logs method, redacted path, status, duration and user id when the response finishes.
 */
const logger = (req, res, next) => {
    const incoming = req.headers["x-request-id"];
    const requestId = typeof incoming === "string" && /^[A-Za-z0-9-]{8,64}$/.test(incoming)
        ? incoming
        : crypto.randomUUID();
    req.id = requestId;
    res.setHeader("X-Request-Id", requestId);

    const start = process.hrtime.bigint();
    res.on("finish", () => {
        const durationMs = Number(process.hrtime.bigint() - start) / 1e6;
        const level = res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info";
        log[level === "warn" && process.env.NODE_ENV === "test" ? "debug" : level]("http.request", {
            requestId,
            method: req.method,
            path: redactUrl(req.originalUrl),
            status: res.statusCode,
            durationMs: Math.round(durationMs * 10) / 10,
            uid: req.user?.uid || null,
        });
    });
    next();
};

export default logger;
