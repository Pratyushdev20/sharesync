import helmet from "helmet";
import rateLimit from "express-rate-limit";
import env from "../config/env.js";

const isTest = env.nodeEnv === "test";

/**
 * Secure HTTP headers. This is a JSON API, so the strictest CSP is fine.
 * crossOriginResourcePolicy is relaxed so the web client (different port) can read downloads.
 */
export const securityHeaders = helmet({
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    crossOriginResourcePolicy: { policy: "cross-origin" },
});

/**
 * CORS with an explicit allowlist (env.corsOrigins).
 * Requests without an Origin header (native mobile apps, curl, Postman) are not affected by CORS.
 */
export function cors(req, res, next) {
    const origin = req.headers.origin;
    if (origin) {
        if (!env.corsOrigins.includes(origin)) {
            return res.status(403).json({ success: false, message: "Origin not allowed" });
        }
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
        res.setHeader("Access-Control-Expose-Headers", "Content-Disposition, Content-Length");
        res.setHeader("Access-Control-Max-Age", "600");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
}

const rateLimitResponse = (message) => (req, res) =>
    res.status(429).json({ success: false, message });

/** General API rate limit per IP. */
export const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.rateLimitMax,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => isTest,
    handler: rateLimitResponse("Too many requests, please try again later"),
});

/** Stricter limit for login/register to slow down brute-force and account abuse. */
export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: env.authRateLimitMax,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    skip: () => isTest,
    handler: rateLimitResponse("Too many authentication attempts, please try again later"),
});
