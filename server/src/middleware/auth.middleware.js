import {getAuth}from "firebase-admin/auth";
import AppError from "../utils/AppError.js";


export async function authMiddleware(req,res,next){
    const authheader = req.headers.authorization ;

    if(!authheader){
        return next(new AppError("Authorization token missing",401));

    }
    const parts = authheader.split(" ");

    if (
        parts.length !== 2 ||
        parts[0] !== "Bearer" ||
        !parts[1]
    ) {
        return next(new AppError("Invalid authorization format", 401));
    }

    const token = parts[1];
    let decodedToken ;

    try {
        decodedToken = await getAuth().verifyIdToken(token);
    }catch (error){
        return next(new AppError("Invalid or expired token",401));
        
    }

    req.user = decodedToken;
    return next();

}