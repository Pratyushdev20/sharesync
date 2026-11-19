import {getAuth}from "firebase-admin/auth";
import AppError from "../utils/AppError.js";


export async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    let token;

    if (authHeader) {
        const parts = authHeader.split(" ");
        if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
            return next(new AppError("Invalid authorization format", 401));
        }
        token = parts[1];
    } else if (req.body && (req.body.idToken || req.body.token)) {
        token = req.body.idToken || req.body.token;
    }

    if (!token) {
        return next(new AppError("Authorization token missing", 401));
    }

    let decodedToken;
    try {
        decodedToken = await getAuth().verifyIdToken(token);
    } catch (error) {
        return next(new AppError("Invalid or expired token", 401));
    }

    req.user = decodedToken;
    return next();
}

/**
 * Optional authentication for public share-link endpoints.
 * No Authorization header -> anonymous (req.user = null).
 * A header that is present but invalid is still rejected, so a broken/expired session is
 * never silently downgraded to anonymous access.
 */
export async function optionalAuthMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        req.user = null;
        return next();
    }

    const parts = authHeader.split(" ");
    if (parts.length !== 2 || parts[0] !== "Bearer" || !parts[1]) {
        return next(new AppError("Invalid authorization format", 401));
    }

    try {
        req.user = await getAuth().verifyIdToken(parts[1]);
    } catch (error) {
        return next(new AppError("Invalid or expired token", 401));
    }
    return next();
}