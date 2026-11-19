import { Router } from "express";
import multer from "multer";
import { authMiddleware } from "../middleware/auth.middleware.js";
import env from "../config/env.js";
import AppError from "../utils/AppError.js";
import {
    uploadFileController,
    getFilesController,
    getFileByIdController,
    downloadFileController,
    renameFileController,
    moveFileController,
    deleteFileController,
    replaceFileContentController
} from "../controllers/file.controller.js";

const fileRouter = Router();

// Configure Multer with memory storage, path preservation for traversal detection, and size limit
const upload = multer({
    storage: multer.memoryStorage(),
    preservePath: true,
    limits: {
        fileSize: env.maxFileSize
    }
});

// Middleware to handle multer-specific errors (e.g. LIMIT_FILE_SIZE)
function handleUpload(req, res, next) {
    upload.single("file")(req, res, (err) => {
        if (err instanceof multer.MulterError) {
            if (err.code === "LIMIT_FILE_SIZE") {
                const limitMB = Math.round(env.maxFileSize / (1024 * 1024));
                return next(new AppError(`File exceeds maximum size limit of ${limitMB}MB`, 400));
            }
            return next(new AppError(`Upload error: ${err.message}`, 400));
        } else if (err) {
            return next(err);
        }
        next();
    });
}

// Enforce Firebase authentication across all file endpoints
fileRouter.use(authMiddleware);

// File management routes
fileRouter.post("/upload", handleUpload, uploadFileController);
fileRouter.get("/", getFilesController);
fileRouter.get("/:id", getFileByIdController);
fileRouter.get("/:id/download", downloadFileController);
fileRouter.patch("/:id", renameFileController);
fileRouter.put("/:id", renameFileController);
fileRouter.patch("/:id/move", moveFileController);
fileRouter.put("/:id/move", moveFileController);
fileRouter.delete("/:id", deleteFileController);
fileRouter.put("/:id/content", handleUpload, replaceFileContentController);

export default fileRouter;
