import { Router } from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
    createFolderController,
    getFoldersController,
    getFolderByIdController,
    renameFolderController,
    deleteFolderController
} from "../controllers/folder.controller.js";

const folderRouter = Router();

// Enforce Firebase authentication across all folder endpoints
folderRouter.use(authMiddleware);

// Folder CRUD routes
folderRouter.post("/", createFolderController);
folderRouter.get("/", getFoldersController);
folderRouter.get("/:id", getFolderByIdController);
folderRouter.patch("/:id", renameFolderController);
folderRouter.put("/:id", renameFolderController);
folderRouter.delete("/:id", deleteFolderController);

export default folderRouter;
