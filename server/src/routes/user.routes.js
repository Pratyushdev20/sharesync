import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { validate, z, cleanText } from "../middleware/validate.js";
import {
    createUserController,
    getUsersController,
    getUserByIdController,
    updateUserController,
    deleteUserController,
    getMeController,
    updateMeController,
    deleteMeController
} from "../controllers/user.controller.js";

const router = express.Router();

// Enforce authentication across all user routes
router.use(authMiddleware);

// Own profile (registered before "/:id" so "me" is never treated as an id)
const nameBody = z.object({
    name: cleanText(100).transform((s) => s.trim()).refine((s) => s.length > 0, { message: "is required" }),
}).strict();
router.get("/me", getMeController);
router.patch("/me", validate({ body: nameBody }), updateMeController);
router.delete("/me", deleteMeController);

router.get("/", getUsersController);
router.post("/", createUserController);
router.get("/:id", getUserByIdController);
router.patch("/:id", updateUserController);
router.delete("/:id", deleteUserController);

export default router;
