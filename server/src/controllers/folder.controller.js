import {
    createFolder,
    getFolders,
    getFolderById,
    renameFolder,
    deleteFolder
} from "../services/folder.service.js";

/**
 * POST /api/folders
 * Creates a folder owned by the authenticated Firebase user.
 */
export async function createFolderController(req, res, next) {
    try {
        const authUid = req.user.uid;
        const { name, parent_folder_id } = req.body || {};
        const folder = await createFolder(authUid, { name, parent_folder_id });
        res.status(201).json({
            success: true,
            message: "Folder created successfully",
            data: folder
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/folders
 * Lists folders owned by the authenticated Firebase user, with optional parent_folder_id filter.
 */
export async function getFoldersController(req, res, next) {
    try {
        const authUid = req.user.uid;
        const { parent_folder_id } = req.query;
        const folders = await getFolders(authUid, { parent_folder_id });
        res.status(200).json({
            success: true,
            data: folders
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /api/folders/:id
 * Retrieves a single folder by ID with strict ownership enforcement, subfolders, and files.
 */
export async function getFolderByIdController(req, res, next) {
    try {
        const authUid = req.user.uid;
        const { id } = req.params;
        const folder = await getFolderById(id, authUid);
        res.status(200).json({
            success: true,
            data: folder
        });
    } catch (error) {
        next(error);
    }
}

/**
 * PATCH /api/folders/:id or PUT /api/folders/:id
 * Renames an existing folder owned by the authenticated user.
 */
export async function renameFolderController(req, res, next) {
    try {
        const authUid = req.user.uid;
        const { id } = req.params;
        const { name } = req.body || {};
        const folder = await renameFolder(id, authUid, name, { expectedVersion: req.body?.expected_version });
        res.status(200).json({
            success: true,
            message: "Folder renamed successfully",
            data: folder
        });
    } catch (error) {
        next(error);
    }
}

/**
 * DELETE /api/folders/:id
 * Deletes an empty folder owned by the authenticated user.
 */
export async function deleteFolderController(req, res, next) {
    try {
        const authUid = req.user.uid;
        const { id } = req.params;
        const result = await deleteFolder(id, authUid);
        res.status(200).json({
            success: true,
            message: "Folder deleted successfully",
            data: result
        });
    } catch (error) {
        next(error);
    }
}
