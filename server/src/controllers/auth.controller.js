import AppError from "../utils/AppError.js";
import { getUserByFirebaseUid } from "../services/user.service.js";

/**
 * Handle user login via verified Firebase ID token.
 * Authenticates solely based on the verified decoded token set by authMiddleware.
 * Raw firebase_uid in request body or params is strictly ignored.
 */
export async function loginController(req, res, next) {
    try {
        if (!req.user || !req.user.uid) {
            throw new AppError("Invalid or missing token payload", 401);
        }

        // Extract verified UID strictly from the verified Firebase token
        const verifiedUid = req.user.uid;
        const verifiedEmail = req.user.email || null;

        // Fetch corresponding user from PostgreSQL using verified UID
        const user = await getUserByFirebaseUid(verifiedUid, verifiedEmail);

        if (!user) {
            throw new AppError("User not found", 404);
        }

        return res.status(200).json({
            success: true,
            message: "Login successful",
            data: user,
            user: user
        });
    } catch (error) {
        next(error);
    }
}
