import AppError from "../utils/AppError.js";
import {
    createUser,
    getUsers,
    getUserById,
    updateUser,
    deleteUser,
    getUserByFirebaseUid,
    getProfile,
    updateProfileName
} from "../services/user.service.js";
import { getAuth } from "firebase-admin/auth";
import { recordActivity } from "../services/events.service.js";
import log from "../utils/log.js";
import { getVerifiedEmail } from "../utils/authHelpers.js";

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
        const { name, email, firebase_uid } = req.body || {};

        // Ensure user cannot set another user's firebase_uid
        if (firebase_uid && firebase_uid !== authUid) {
            throw new AppError("Forbidden: You cannot create a record for another user", 403);
        }

        // Email is taken ONLY from the verified Firebase token, never from the request body
        const tokenEmail = req.user.email || null;
        if (email && (!tokenEmail || String(email).trim().toLowerCase() !== tokenEmail.toLowerCase())) {
            throw new AppError("Forbidden: Email must match your authenticated account", 403);
        }

        // Check if user already exists (email-based linking only for verified emails)
        const existingUser = await getUserByFirebaseUid(authUid, getVerifiedEmail(req.user));
        if (existingUser) {
            throw new AppError("User record already exists for this account", 409);
        }

        const newUser = await createUser({
            name,
            email: tokenEmail,
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
        const userdata = req.body || {};

        // Email is managed by Firebase Authentication and cannot be changed through this API.
        // Allowing it would let a user claim another person's email and receive their shares.
        if (userdata.email !== undefined) {
            throw new AppError("Email cannot be changed through this endpoint", 400);
        }

        const user = await getUserById(userId);
        if (!user) {
            throw new AppError("User not found", 404);
        }

        // Enforce ownership
        if (user.firebase_uid !== authUid) {
            throw new AppError("Forbidden: You can only update your own record", 403);
        }

        const updatedUser = await updateUser(user.id, { name: userdata.name });
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
// ---------------------------------------------------------------------------
// /api/users/me — the signed-in user's own profile (no ids in the URL → no IDOR surface)
// ---------------------------------------------------------------------------

/** Account deletion requires a sign-in within this window (seconds). */
const REAUTH_WINDOW_SECONDS = 5 * 60;

/** GET /api/users/me */
export async function getMeController(req, res, next) {
    try {
        const profile = await getProfile(req.user.uid);
        if (!profile) {
            throw new AppError("Account not found. Please finish signing up.", 404, "REGISTRATION_REQUIRED");
        }
        res.status(200).json({
            success: true,
            data: {
                ...profile,
                emailVerified: req.user.email_verified === true,
                provider: req.user.firebase?.sign_in_provider || null,
            },
        });
    } catch (error) {
        next(error);
    }
}

/** PATCH /api/users/me  { name } */
export async function updateMeController(req, res, next) {
    try {
        const updated = await updateProfileName(req.user.uid, req.body.name);
        if (!updated) throw new AppError("Account not found", 404);
        recordActivity({ actorUid: req.user.uid, action: "profile.updated", ownerUid: req.user.uid, metadata: { field: "name" } });
        res.status(200).json({ success: true, message: "Profile updated", data: updated });
    } catch (error) {
        next(error);
    }
}

/**
 * DELETE /api/users/me
 * Deletes all ShareSync data AND the Firebase Authentication account.
 * Requires a recent sign-in (auth_time within 5 minutes) so a stolen or old session token
 * cannot destroy an account; otherwise 401 REAUTH_REQUIRED.
 */
export async function deleteMeController(req, res, next) {
    try {
        const authTime = Number(req.user.auth_time);
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (!authTime || nowSeconds - authTime > REAUTH_WINDOW_SECONDS) {
            throw new AppError("Please sign in again to confirm it's you, then delete your account.", 401, "REAUTH_REQUIRED");
        }

        const user = await getUserByFirebaseUid(req.user.uid);
        if (user) {
            await deleteUser(user.id);
        }

        let firebaseDeleted = false;
        try {
            await getAuth().deleteUser(req.user.uid);
            firebaseDeleted = true;
        } catch (err) {
            log.warn("account.firebase_delete_failed", { err });
        }

        res.status(200).json({
            success: true,
            message: "Your account and all your data were deleted",
            data: { dataDeleted: Boolean(user), firebaseDeleted },
        });
    } catch (error) {
        next(error);
    }
}
