import pool from "../config/db.js";



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