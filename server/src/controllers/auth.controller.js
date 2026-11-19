import AppError from "../utils/AppError.js";
import {
    getUserByFirebaseUid,
    getUserByEmail,
    createUser
} from "../services/user.service.js";
import { getVerifiedEmail } from "../utils/authHelpers.js";

/**
 * Handle user registration via verified Firebase ID token.
 * Extracts UID and email strictly from the verified Firebase ID token.
 * Never trusts client-supplied Firebase UID or email without token verification.
 * Prevents duplicate accounts with 409 Conflict.
 */
export async function registerController(req, res, next) {
    try {
        if (!req.user || !req.user.uid) {
            throw new AppError("Invalid or missing token payload", 401);
        }

        // Extract verified identity strictly from the verified Firebase ID token
        const verifiedUid = req.user.uid;
        const verifiedEmail = req.user.email;

        if (!verifiedEmail) {
            throw new AppError("Token does not contain a verified email address", 400);
        }

        // Validate required name field
        let name = "";
        if (req.body && typeof req.body.name === "string") {
            name = req.body.name.trim();
        } else if (req.user && typeof req.user.name === "string") {
            name = req.user.name.trim();
        }

        if (!name || name.length === 0) {
            throw new AppError("Name is required", 400);
        }

        // Check if an account already exists with this Firebase UID
        const existingByUid = await getUserByFirebaseUid(verifiedUid);
        if (existingByUid) {
            throw new AppError("Account already exists with this Firebase UID", 409);
        }

        // Check if an account already exists with this email address
        const existingByEmail = await getUserByEmail(verifiedEmail);
        if (existingByEmail) {
            throw new AppError("Account already exists with this email address", 409);
        }

        // Create the corresponding PostgreSQL user record (no passwords stored in PostgreSQL)
        const newUser = await createUser({
            name: name.trim(),
            email: verifiedEmail,
            firebase_uid: verifiedUid
        });

        return res.status(201).json({
            success: true,
            message: "User registered successfully",
            data: newUser,
            user: newUser
        });
    } catch (error) {
        if (error.code === "23505") {
            return next(new AppError("Account already exists with this email or UID", 409));
        }
        next(error);
    }
}

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
        // Only link legacy records by email when Firebase has verified that email
        const verifiedEmail = getVerifiedEmail(req.user);

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
