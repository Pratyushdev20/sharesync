import { Server } from "socket.io";
import { getAuth } from "firebase-admin/auth";
import pool from "../config/db.js";
import env from "../config/env.js";
import log from "../utils/log.js";

/**
 * Real-time channel (Socket.IO) shared by web and mobile clients.
 *
 * Security model:
 *  - every connection must present a valid Firebase ID token (handshake.auth.token)
 *  - each socket joins ONLY its own private room "user:<uid>"; clients cannot join other rooms
 *  - the server pushes events only to users the change-feed audience says may see them
 *  - the socket is disconnected when its token expires; clients reconnect with a fresh token
 *  - browser origins are restricted to CORS_ORIGINS (native apps send no Origin)
 */
let io = null;

const MAX_SOCKET_LIFETIME_MS = 60 * 60 * 1000;

export function initRealtime(httpServer) {
    io = new Server(httpServer, {
        path: "/socket.io",
        cors: { origin: env.corsOrigins, methods: ["GET", "POST"] },
        maxHttpBufferSize: 16 * 1024, // clients only send tiny messages
        pingInterval: 25_000,
        pingTimeout: 20_000,
    });

    io.use(async (socket, next) => {
        const token = socket.handshake.auth?.token;
        if (typeof token !== "string" || token.length < 10 || token.length > 5000) {
            return next(new Error("UNAUTHORIZED"));
        }
        try {
            const decoded = await getAuth().verifyIdToken(token);
            socket.data.uid = decoded.uid;
            socket.data.exp = decoded.exp;
            const deviceId = socket.handshake.auth?.deviceId;
            socket.data.deviceId = typeof deviceId === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(deviceId) ? deviceId : null;
            const platform = socket.handshake.auth?.platform;
            socket.data.platform = ["ios", "android", "web", "windows", "macos"].includes(platform) ? platform : "unknown";
            return next();
        } catch {
            return next(new Error("UNAUTHORIZED"));
        }
    });

    io.on("connection", (socket) => {
        const { uid, deviceId, platform } = socket.data;
        socket.join(`user:${uid}`);

        // Disconnect when the ID token expires (client reconnects with a fresh one)
        const msUntilExpiry = socket.data.exp ? socket.data.exp * 1000 - Date.now() : MAX_SOCKET_LIFETIME_MS;
        const timer = setTimeout(() => {
            socket.emit("auth:expired");
            socket.disconnect(true);
        }, Math.max(1000, Math.min(msUntilExpiry, MAX_SOCKET_LIFETIME_MS)));

        if (deviceId) {
            touchDevice(uid, deviceId, platform).catch((err) => log.warn("sync.device_touch_failed", { err }));
        }

        socket.emit("sync:hello", { serverTime: new Date().toISOString() });

        socket.on("disconnect", () => {
            clearTimeout(timer);
            if (deviceId) touchDevice(uid, deviceId, platform).catch(() => {});
        });
    });

    log.info("realtime.started", { origins: env.corsOrigins.length });
    return io;
}

async function touchDevice(uid, deviceId, platform) {
    await pool.query(
        `INSERT INTO sync_devices (user_uid, device_id, platform, last_seen_at)
         VALUES ($1, $2, $3, CURRENT_TIMESTAMP)
         ON CONFLICT (user_uid, device_id)
         DO UPDATE SET last_seen_at = CURRENT_TIMESTAMP, platform = EXCLUDED.platform`,
        [uid, deviceId, platform]
    );
}

/**
 * Sends an event to every connected device of the given users.
 * `payload` may be a function (uid) => payload for per-user data. No-op if realtime is not running.
 */
export function emitToUsers(uids, event, payload) {
    if (!io) return;
    for (const uid of new Set(uids)) {
        if (!uid) continue;
        io.to(`user:${uid}`).emit(event, typeof payload === "function" ? payload(uid) : payload);
    }
}

export function isRealtimeRunning() {
    return io !== null;
}

export async function closeRealtime() {
    if (io) {
        await new Promise((resolve) => io.close(() => resolve()));
        io = null;
    }
}
