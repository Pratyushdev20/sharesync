import dotenv from "dotenv";
import path from "path";

dotenv.config();

const env = {
    port: Number(process.env.PORT) || 2000,
    nodeEnv: process.env.NODE_ENV || "development",
    maxFileSize: Number(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB default
    uploadDir: process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"),
    // Comma-separated list of browser origins allowed to call the API (native mobile apps send no Origin)
    corsOrigins: (process.env.CORS_ORIGINS || "http://localhost:8081,http://localhost:19006")
        .split(",")
        .map((o) => o.trim())
        .filter(Boolean),
    // Requests allowed per IP per 15-minute window
    rateLimitMax: Number(process.env.RATE_LIMIT_MAX) || 300,
    authRateLimitMax: Number(process.env.AUTH_RATE_LIMIT_MAX) || 20,
};

export default env;
