import "./src/config/firebase.js";
import pool from "./src/config/db.js";

// Quick connectivity check for Firebase Admin and PostgreSQL
const r = await pool.query("SELECT 1 AS ok");
console.log("firebase admin initialised, database ok:", r.rows[0].ok === 1);
await pool.end();
