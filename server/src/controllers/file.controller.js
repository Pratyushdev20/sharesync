import {
    uploadFile,
    getFiles,
    getFileById,
    getFileForDownload,
    renameFile,
    moveFile,
    deleteFile,
    replaceFileContent
} from "../services/file.service.js";
import { recordActivity } from "../services/events.service.js";
import AppError from "../utils/AppError.js";
import { sendFileStream } from "../utils/sendFile.js";

/**
 * POST /api/files/upload
 * Handles multipart file upload with validation and storage.
 */
export async function uploadFileController(req, res, next) {
    try {
        const authUid = req.user.uid;
        const userMeta = {
            email: req.user.email || null,
            emailVerified: req.user.email_verified === true,
            name: req.user.name || null
        };

        if (!req.file) {
            throw new AppError("No file provided for upload", 400);
        }

        const folder_id = req.body?.folder_id !== undefined ? req.body.folder_id : null;
        const fileData = {
            ...req.file,
            originalname: req.body?.name || req.file.originalname
        };

        const file = await uploadFile(authUid, userMeta, fileData, { folder_id });

        res.status(201).json({
            success: true,
            message: "File uploaded successfully",
            data: file
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/files
 * Lists files owned by user, with optional folder_id filter.
 */
export async function getFilesController(req, res, next) {
    try {
        const authUid = req.user.uid;
        const folder_id = req.query.folder_id !== undefined ? req.query.folder_id : req.query.parent_folder_id;

        const files = await getFiles(authUid, { folder_id });

        res.status(200).json({
            success: true,
            data: files
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/files/:id
 * Retrieves file metadata by ID with strict ownership validation.
 */
export async function getFileByIdController(req, res, next) {
    try {
        const authUid = req.user.uid;
        const { id } = req.params;

        const file = await getFileById(id, authUid);

        res.status(200).json({
            success: true,
            data: file
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/files/:id/download
 * Streams file download with authentication, ownership verification, and safe headers.
 */
export async function downloadFileController(req, res, next) {
    try {
        const authUid = req.user.uid;
        const { id } = req.params;

        const download = await getFileForDownload(id, authUid);
        if (download.fileRecord.version !== undefined) {
            res.setHeader("X-File-Version", String(download.fileRecord.version));
        }
        recordActivity({
            actorUid: authUid,
            action: "file.downloaded",
            resourceType: "file",
            resourceId: download.fileRecord.id,
            ownerUid: download.ownerUid,
            metadata: { name: download.fileRecord.name }
        });
        sendFileStream(res, next, download);
    } catch (error) {
        next(error);
    }
}

/**
 * PATCH /api/files/:id or PUT /api/files/:id
 * Renames a file owned by the user.
 */
export async function renameFileController(req, res, next) {
    try {
        const authUid = req.user.uid;
        const { id } = req.params;
        const { name } = req.body || {};

        if (!name) {
            throw new AppError("File name is required", 400);
        }

        const file = await renameFile(id, authUid, name, { expectedVersion: req.body?.expected_version });

        res.status(200).json({
            success: true,
            message: "File renamed successfully",
            data: file
        });
    } catch (error) {
        next(error);
    }
}

/**
 * PATCH /api/files/:id/move or PUT /api/files/:id/move
 * Moves a file between folders.
 */
export async function moveFileController(req, res, next) {
    try {
        const authUid = req.user.uid;
        const { id } = req.params;
        const targetFolderId = req.body?.target_folder_id !== undefined ? req.body.target_folder_id : req.body?.folder_id;

        const file = await moveFile(id, authUid, targetFolderId, { expectedVersion: req.body?.expected_version });

        res.status(200).json({
            success: true,
            message: "File moved successfully",
            data: file
        });
    } catch (error) {
        next(error);
    }
}

/**
 * DELETE /api/files/:id
 * Deletes a file from database and storage.
 */
export async function deleteFileController(req, res, next) {
    try {
        const authUid = req.user.uid;
        const { id } = req.params;

        const result = await deleteFile(id, authUid, { expectedVersion: req.query?.expected_version });

        res.status(200).json({
            success: true,
            message: "File deleted successfully",
            data: result
        });
    } catch (error) {
        next(error);
    }
}

/**
 * PUT /api/files/:id/content
 * Uploads a new version of an existing file (owner or editor).
 * Send `expected_version` (form field) to detect conflicts: 409 CONFLICT if it changed meanwhile.
 */
export async function replaceFileContentController(req, res, next) {
    try {
        if (!req.file) {
            throw new AppError("No file provided for upload", 400);
        }
        const file = await replaceFileContent(req.params.id, req.user.uid, req.file, {
            expectedVersion: req.body?.expected_version
        });
        res.status(200).json({
            success: true,
            message: "New version uploaded",
            data: file
        });
    } catch (error) {
        next(error);
    }
}
