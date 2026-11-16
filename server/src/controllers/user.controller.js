import AppError from "../utils/AppError.js";
import {
    createUser,
    getUsers,
    getUserById,
    updateUser,
    deleteUser,
    getUserByFirebaseUid
} from "../services/user.service.js";

/**
 * GET /users
 * Returns records owned by the authenticated user.
 */
export async function getUsersController(req, res, next) {
    try {
        const authUid = req.user.uid;
        const users = await getUsers(authUid);
        res.status(200).json({
            success: true,
            data: users
        });
    } catch (error) {
        next(error);
    }
}

/**
 * POST /users
 * Creates a user record bound to the authenticated user's Firebase UID.
 */
export async function createUserController(req, res, next) {
    try {
        const authUid = req.user.uid;
        const { name, email, password_hash, firebase_uid } = req.body;

        // Ensure user cannot set another user's firebase_uid
        if (firebase_uid && firebase_uid !== authUid) {
            throw new AppError("Forbidden: You cannot create a record for another user", 403);
        }

        // Check if user already exists
        const existingUser = await getUserByFirebaseUid(authUid, email);
        if (existingUser) {
            throw new AppError("User record already exists for this account", 409);
        }

        const newUser = await createUser({
            name,
            email: email || req.user.email || null,
            password_hash: password_hash || null,
            firebase_uid: authUid
        });

        res.status(201).json({
            success: true,
            data: newUser
        });
    } catch (error) {
        next(error);
    }
}

/**
 * GET /users/:id
 * Fetches user by ID, enforcing ownership.
 */
export async function getUserByIdController(req, res, next) {
    try {
        const authUid = req.user.uid;
        const userId = req.params.id;
        const user = await getUserById(userId);

        if (!user) {
            throw new AppError("User not found", 404);
        }

        // Enforce ownership
        if (user.firebase_uid !== authUid) {
            throw new AppError("Forbidden: You can only access your own record", 403);
        }

        res.status(200).json({
            success: true,
            data: user
        });
    } catch (error) {
        next(error);
    }
}

/**
 * PATCH /users/:id
 * Updates user by ID, enforcing ownership.
 */
export async function updateUserController(req, res, next) {
    try {
        const authUid = req.user.uid;
        const userId = req.params.id;
        const userdata = req.body;

        const user = await getUserById(userId);
        if (!user) {
            throw new AppError("User not found", 404);
        }

        // Enforce ownership
        if (user.firebase_uid !== authUid) {
            throw new AppError("Forbidden: You can only update your own record", 403);
        }

        const updatedUser = await updateUser(user.id, userdata);
        res.status(200).json({
            success: true,
            data: updatedUser
        });
    } catch (error) {
        next(error);
    }
}

/**
 * DELETE /users/:id
 * Deletes user by ID, enforcing ownership.
 */
export async function deleteUserController(req, res, next) {
    try {
        const authUid = req.user.uid;
        const userId = req.params.id;

        const user = await getUserById(userId);
        if (!user) {
            throw new AppError("User not found", 404);
        }

        // Enforce ownership
        if (user.firebase_uid !== authUid) {
            throw new AppError("Forbidden: You can only delete your own record", 403);
        }

        const result = await deleteUser(user.id);
        res.status(200).json({
            success: true,
            message: "User deleted successfully",
            data: result
        });
    } catch (error) {
        next(error);
    }
}