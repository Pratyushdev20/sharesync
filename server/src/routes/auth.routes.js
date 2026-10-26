import  Router  from "express";
import { authMiddleware } from "../middleware/auth.middleware.js";



const router = Router();

router.get("/",authMiddleware,(req,res)=>{
    return res.status(200).json({
        sucess:true,
        user:req.user
    });
});
export default router ;