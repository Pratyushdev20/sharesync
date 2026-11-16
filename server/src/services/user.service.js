import pool from "../config/db.js";
import AppError from "../utils/AppError.js";



export async function getUsers(){// check tota; users
    const result = await pool.query("SELECT * FROM users");
    return result.rows
}

export async function createUser(userData) {
    const { name, email,password_hash} = userData;
    const result = await pool.query(
        "INSERT INTO users (name, email,password_hash) VALUES ($1, $2,$3) RETURNING *",
        [name, email,password_hash]
    );
    return result.rows[0];
}
export async function getUserById(userId){
    const user = await pool.query("SELECT * FROM users WHERE id = $1",[userId]);

    return user.rows[0];
}

export async function updateUser(userId,userdata){
    const {name,email} = userdata ;
    if (!name && !email) {
    throw new AppError("Nothing to update", 400);
    }
    if(!name){
        if(email){
            const result = await pool.query("UPDATE users SET email = $1 WHERE id = $2 RETURNING *;",[email, userId]);
            return result.rows[0];            
        }       
    }else{
        if(!email){
            const result = await pool.query("UPDATE users SET name = $1 WHERE id = $2 RETURNING *;", [name, userId]);
            return result.rows[0];
        }
        else {
            const result = await pool.query("UPDATE users SET name = $1, email = $2 WHERE id = $3 RETURNING *;", [name, email, userId]);
            return result.rows[0];
        }
        
    }
}

export async function deleteUser(userId) {
    const result = await pool.query("DELETE FROM users WHERE id = $1 RETURNING *;", [userId]);
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