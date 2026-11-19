import express from "express";
import logger from "./middleware/logger.js";
import errorHandler from "./middleware/errorHandler.js";
import healthRouter from "./routes/health.routes.js";
import testRouter from "./routes/test.routes.js";
import userRouter from "./routes/user.routes.js";
import authRouter from "./routes/auth.routes.js";
import folderRouter from "./routes/folder.routes.js";
import fileRouter from "./routes/file.routes.js";
import shareRouter from "./routes/share.routes.js";
import publicLinkRouter from "./routes/publicLink.routes.js";
import noteRouter from "./routes/note.routes.js";
import notificationRouter from "./routes/notification.routes.js";
import syncRouter from "./routes/sync.routes.js";

import "./config/firebase.js";
import env from "./config/env.js";
import AppError from "./utils/AppError.js";
import { securityHeaders, cors, apiLimiter, authLimiter } from "./middleware/security.js";

/**
 * Express application shared by the web app and the mobile apps.
 * (server.js attaches the HTTP server and the real-time Socket.IO channel.)
 */
const app = express();
const isProduction = env.nodeEnv === "production";

// Don't advertise the framework; trust the first proxy so rate limiting sees real client IPs
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(logger);
app.use(securityHeaders);
app.use(cors);

// 100kb JSON limit everywhere except notes, which set their own (larger) limit
const smallJson = express.json({ limit: "100kb" });
app.use((req, res, next) => (req.path.startsWith("/api/notes") ? next() : smallJson(req, res, next)));

app.get("/", (req, res) => {
    res.send("sharesync is working");
});

app.use("/api/health", healthRouter);

// Debug-only endpoints: never exposed in production
if (!isProduction) {
    app.get("/error", (req, res, next) => {
        next(new Error("test error"));
    });
    app.use("/api/test", testRouter);
}

app.use(apiLimiter);
app.use(["/api/auth/login", "/api/auth/register", "/api/auth/session", "/auth/login", "/auth/register"], authLimiter);

app.use("/api/auth", authRouter);
app.use("/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/users", userRouter);
app.use("/api/folders", folderRouter);
app.use("/folders", folderRouter);
app.use("/api/files", fileRouter);
app.use("/files", fileRouter);
app.use("/api/shares", shareRouter);
app.use("/api/public/links", publicLinkRouter);
app.use("/api/notes", noteRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/sync", syncRouter);

// Unknown API routes: consistent JSON 404 instead of Express' HTML page
app.use((req, res, next) => next(new AppError("Route not found", 404, "NOT_FOUND")));

app.use(errorHandler);

export default app;
