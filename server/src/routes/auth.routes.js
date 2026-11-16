import express from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";
import { loginController, registerController } from "../controllers/auth.controller.js";

const router = express.Router();

router.get("/", authMiddleware, (req, res) => {
    return res.status(200).json({
        success: true,
        user: req.user
    });
});

router.post("/login", authMiddleware, loginController);
router.post("/register", authMiddleware, registerController);

export default router;