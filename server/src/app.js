import express from "express"
import logger from "./middleware/logger.js"
import errorHandler from "./middleware/errorHandler.js"
import healthRouter from "./routes/health.routes.js"
import testRouter from "./routes/test.routes.js";
import userRouter from "./routes/user.routes.js";
import authRouter from "./routes/auth.routes.js";



import "./config/firebase.js";

const app = express();

// Enable CORS for client apps
app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
});

app.use(express.json());
app.use(logger);

app.get("/", (req, res) => {
    res.send("sharesync is working");
});

app.get("/error", (req, res, next) => {
    const error = new Error("test error");
    next(error);
}); 

app.use("/api/health", healthRouter);
app.use("/api/test", testRouter);
app.use("/api/auth", authRouter);
app.use("/auth", authRouter);
app.use("/api/users", userRouter);
app.use("/users", userRouter);

    


app.use(errorHandler);

export default app ;