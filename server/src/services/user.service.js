import pool from "../config/db.js";
import AppError from "../utils/AppError.js";



export async function getUsers(firebaseUid = null) {
    if (firebaseUid) {
        const result = await pool.query(
            "SELECT id, name, email, created_at, firebase_uid FROM users WHERE firebase_uid = $1",
            [firebaseUid]
        );
        return result.rows;
    }
    const result = await pool.query(
        "SELECT id, name, email, created_at, firebase_uid FROM users"
    );
    return result.rows;
}

export async function createUser(userData) {
    const { name, email, firebase_uid } = userData;
    const result = await pool.query(
        "INSERT INTO users (name, email, firebase_uid) VALUES ($1, $2, $3) RETURNING id, name, email, created_at, firebase_uid",
        [name, email, firebase_uid || null]
    );
    return result.rows[0];
}

export async function getUserByEmail(email) {
    if (!email) return null;
    const result = await pool.query(
        "SELECT id, name, email, created_at, firebase_uid FROM users WHERE email = $1",
        [email]
    );
    return result.rows[0];
}

export async function getUserById(userId) {
    const isNumeric = /^\d+$/.test(String(userId));
    const query = isNumeric
        ? "SELECT id, name, email, created_at, firebase_uid FROM users WHERE id = $1 OR firebase_uid = $2"
        : "SELECT id, name, email, created_at, firebase_uid FROM users WHERE firebase_uid = $1";
    const params = isNumeric ? [userId, String(userId)] : [userId];
    const user = await pool.query(query, params);
    return user.rows[0];
}

export async function updateUser(userId, userdata) {
    const { name, email } = userdata;
    if (!name && !email) {
        throw new AppError("Nothing to update", 400);
    }

    let query;
    let params;

    if (name && email) {
        query = "UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING id, name, email, created_at, firebase_uid";
        params = [name, email, userId];
    } else if (name) {
        query = "UPDATE users SET name = $1 WHERE id = $2 RETURNING id, name, email, created_at, firebase_uid";
        params = [name, userId];
    } else {
        query = "UPDATE users SET email = $1 WHERE id = $2 RETURNING id, name, email, created_at, firebase_uid";
        params = [email, userId];
    }

    const result = await pool.query(query, params);
    return result.rows[0];
}

export async function deleteUser(userId) {
    const result = await pool.query(
        "DELETE FROM users WHERE id = $1 RETURNING id, name, email, created_at, firebase_uid",
        [userId]
    );
    return result.rows[0];
}

export async function getUserByFirebaseUid(firebaseUid, email = null) {
    let result = await pool.query(
        "SELECT id, name, email, created_at, firebase_uid FROM users WHERE firebase_uid = $1",
        [firebaseUid]
    );

    // If user is not yet associated by firebase_uid, check if they exist by email and link them
    if (!result.rows[0] && email) {
        result = await pool.query(
            "UPDATE users SET firebase_uid = $1 WHERE email = $2 AND firebase_uid IS NULL RETURNING id, name, email, created_at, firebase_uid",
            [firebaseUid, email]
        );
    }

    return result.rows[0];
}