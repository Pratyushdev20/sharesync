import express from "express"
import logger from "./middleware/logger.js"
import errorHandler from "./middleware/errorHandler.js"
import healthRouter from "./routes/health.routes.js"
import testRouter from "./routes/test.routes.js";
import userRouter from "./routes/user.routes.js";
import authRouter from "./routes/auth.routes.js";
import folderRouter from "./routes/folder.routes.js";
import fileRouter from "./routes/file.routes.js";
import shareRouter from "./routes/share.routes.js";
import publicLinkRouter from "./routes/publicLink.routes.js";



import "./config/firebase.js";
import env from "./config/env.js";
import { securityHeaders, cors, apiLimiter, authLimiter } from "./middleware/security.js";

const app = express();
const isProduction = env.nodeEnv === "production";

// Don't advertise the framework; trust the first proxy so rate limiting sees real client IPs
app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(securityHeaders);
app.use(cors);
app.use(express.json({ limit: "100kb" }));
app.use(logger);

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
app.use(["/api/auth/login", "/api/auth/register", "/auth/login", "/auth/register"], authLimiter);

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

app.use(errorHandler);

export default app ;