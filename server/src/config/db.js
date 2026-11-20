import dotenv from "dotenv";
import pg from "pg";
import log from "../utils/log.js";

dotenv.config();

const { Pool } = pg;

/**
 * PostgreSQL connection.
 *
 * Two ways to configure (DATABASE_URL wins when set):
 *  - DATABASE_URL=postgres://user:password@host:5432/dbname   (Render, Railway, Heroku, Neon...)
 *  - DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD          (local development)
 *
 * TLS: DB_SSL=true enables it (needed for most external / public database URLs; Render's
 * internal URL does not need it). DB_SSL_REJECT_UNAUTHORIZED=false accepts providers whose
 * certificates are not publicly trusted.
 */
const ssl = process.env.DB_SSL === "true"
    ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false" }
    : undefined;

const common = {
    max: Number(process.env.DB_POOL_MAX) || 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl,
};

const pool = new Pool(
    process.env.DATABASE_URL
        ? { connectionString: process.env.DATABASE_URL, ...common }
        : {
              user: process.env.DB_USER,
              host: process.env.DB_HOST,
              database: process.env.DB_NAME,
              password: process.env.DB_PASSWORD,
              port: Number(process.env.DB_PORT) || 5432,
              ...common,
          }
);

// An idle client losing its connection must not crash the server
pool.on("error", (err) => {
    log.error("db.pool_error", { err });
});

/**
 * Runs `fn(client)` inside a transaction (BEGIN / COMMIT, ROLLBACK on error).
 */
export async function withTransaction(fn) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        throw err;
    } finally {
        client.release();
    }
}

export default pool;
