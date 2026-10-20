import {getAuth}from "firebase-admin/auth";


export async function authMiddleware(req,res,next){
    const authheader = req.headers.authorization ;

    if(!authheader){
        return res.status(401).json({
            message:"Authorization token missing"
        });

    }
    const [scheme,token] = authheader.split(" ");

    if(scheme != "Bearer" || ! token){
        return res.status(401).json({
            message: "invalid authorization format"
        });
    }

    let decodedToken ;

    try {
        const decodedToken = await getAuth().verifyIdToken(token);
    }catch (error){
        next(new AppError("Invalid or expired token",401));
        
    }

    req.user = decodedToken;
    next();

}