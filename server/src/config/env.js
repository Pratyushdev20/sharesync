import dotenv from "dotenv";
import path from "path";

dotenv.config();

const env = {
    port: Number(process.env.PORT) || 2000,
    nodeEnv: process.env.NODE_ENV || "development",
    maxFileSize: Number(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB default
    uploadDir: process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads"),
};

export default env;
