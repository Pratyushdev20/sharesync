import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import {
    createUserController,
    getUsersController,
    getUserByIdController,
    updateUserController,
    deleteUserController
} from "../controllers/user.controller.js";

const router = express.Router();

// Enforce authentication across all user CRUD routes
router.use(authMiddleware);

router.get("/", getUsersController);
router.post("/", createUserController);
router.get("/:id", getUserByIdController);
router.patch("/:id", updateUserController);
router.delete("/:id", deleteUserController);

export default router;