import dotenv from "dotenv";
import path from "path";

dotenv.config();

const list = (value, fallback) =>
    (value || fallback).split(",").map((o) => o.trim()).filter(Boolean);

const env = {
    port: Number(process.env.PORT) || 2000,
    nodeEnv: process.env.NODE_ENV || "development",
    maxFileSize: Number(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB default
    uploadDir: process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"),
    // Comma-separated list of browser origins allowed to call the API (native mobile apps send no Origin)
    corsOrigins: list(process.env.CORS_ORIGINS, "http://localhost:8081,http://localhost:19006"),
    // Requests allowed per IP per 15-minute window
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 300,
    authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX) || 20,
    // Object storage: "local" (default, disk) or "s3" (any S3-compatible service)
    storageDriver: (process.env.STORAGE_DRIVER || "local").toLowerCase(),
    s3: {
        bucket: process.env.S3_BUCKET || "",
        region: process.env.S3_REGION || "auto",
        endpoint: process.env.S3_ENDPOINT || undefined, // e.g. https://<account>.r2.cloudflarestorage.com or http://localhost:9000 (MinIO)
        accessKeyId: process.env.S3_ACCESS_KEY_ID || "",
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || "",
        forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
        prefix: process.env.S3_PREFIX || "sharesync/",
    },
    // Sync change-feed retention (days)
    syncRetentionDays: Number(process.env.SYNC_RETENTION_DAYS) || 30,
    // Optional mobile push delivery through the Expo push service
    pushEnabled: process.env.PUSH_ENABLED === "true",
    expoAccessToken: process.env.EXPO_ACCESS_TOKEN || "",
};

/**
 * Checks that required configuration is present. Returns a list of problems (empty = OK).
 * Called at startup by server.js; never prints secret values.
 */
export function validateEnv() {
    const problems = [];
    const required = ["DB_USER", "DB_HOST", "DB_NAME", "FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "FILE_ENCRYPTION_KEY"];
    for (const key of required) {
        if (!process.env[key]) problems.push(`${key} is not set`);
    }
    if (!["local", "s3"].includes(env.storageDriver)) {
        problems.push(`STORAGE_DRIVER must be "local" or "s3" (got "${env.storageDriver}")`);
    }
    if (env.storageDriver === "s3") {
        for (const key of ["S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"]) {
            if (!process.env[key]) problems.push(`${key} is required when STORAGE_DRIVER=s3`);
        }
    }
    if (env.nodeEnv === "production") {
        if (env.corsOrigins.some((o) => o.startsWith("http://localhost"))) {
            problems.push("CORS_ORIGINS still contains localhost in production; set it to your real web app origin(s)");
        }
        if (env.corsOrigins.some((o) => o.startsWith("http://"))) {
            problems.push("CORS_ORIGINS should use https:// origins in production");
        }
    }
    return problems;
}

export default env;
