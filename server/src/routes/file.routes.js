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

/**
 * Caps how many uploads are processed at once on this instance (UPLOAD_CONCURRENCY).
 * Each upload is buffered in memory together with its encrypted copy, so without a cap a
 * burst of large uploads could exhaust RAM on a small server. Extra uploads wait up to
 * UPLOAD_QUEUE_WAIT_MS, then get 503 SERVER_BUSY with Retry-After.
 */
let activeUploads = 0;
const uploadWaiters = [];
const UPLOAD_QUEUE_WAIT_MS = Number(process.env.UPLOAD_QUEUE_WAIT_MS) || 20_000;

function releaseUploadSlot() {
    const nextWaiter = uploadWaiters.shift();
    if (nextWaiter) {
        clearTimeout(nextWaiter.timer);
        nextWaiter.start();
    } else {
        activeUploads = Math.max(0, activeUploads - 1);
    }
}

function limitUploadConcurrency(req, res, next) {
    let released = false;
    const start = () => {
        const release = () => {
            if (released) return;
            released = true;
            releaseUploadSlot();
        };
        res.once("finish", release);
        res.once("close", release);
        next();
    };

    if (activeUploads < env.uploadConcurrency) {
        activeUploads++;
        return start();
    }

    const waiter = { start: null, timer: null };
    waiter.start = start; // slot is handed over directly by releaseUploadSlot (count unchanged)
    waiter.timer = setTimeout(() => {
        const i = uploadWaiters.indexOf(waiter);
        if (i !== -1) uploadWaiters.splice(i, 1);
        res.setHeader("Retry-After", "10");
        next(new AppError("The server is busy with other uploads. Please try again in a few seconds.", 503, "SERVER_BUSY"));
    }, UPLOAD_QUEUE_WAIT_MS);
    uploadWaiters.push(waiter);

    // Client gave up while waiting: drop it from the queue
    req.once("close", () => {
        const i = uploadWaiters.indexOf(waiter);
        if (i !== -1) {
            uploadWaiters.splice(i, 1);
            clearTimeout(waiter.timer);
        }
    });
}

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
fileRouter.post("/upload", limitUploadConcurrency, handleUpload, uploadFileController);
fileRouter.get("/", getFilesController);
fileRouter.get("/:id", getFileByIdController);
fileRouter.get("/:id/download", downloadFileController);
fileRouter.patch("/:id", renameFileController);
fileRouter.put("/:id", renameFileController);
fileRouter.patch("/:id/move", moveFileController);
fileRouter.put("/:id/move", moveFileController);
fileRouter.delete("/:id", deleteFileController);
fileRouter.put("/:id/content", limitUploadConcurrency, handleUpload, replaceFileContentController);

export default fileRouter;
