import express from "express"
import logger from "./middleware/logger.js"
import errorHandler from "./middleware/errorHandler.js"
import healthRouter from "./routes/health.routes.js"
import testRouter from "./routes/test.routes.js";
import userRouter from "./routes/user.routes.js"



const app = express();
app.use(express.json());
app.use(logger);
app.get("/",(req,res) =>{
    res.send("sharesync is working");
});
app.get("/error",(req,res)=>{
    const error = new error("test error");
    next(error);
}); 

app.use("/api/health",healthRouter)
app.use("/api/test",testRouter)
app.use("/users",userRouter);
    


app.use(errorHandler);

export default app ;