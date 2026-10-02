const errorHandler = (err,req,res,next) =>{
    const statuscode = err.statuscode || 500 ;
    res.status(statuscode).json({
        sucess : false ,
        message : err.message || "INternal server error"
    });
}

export default errorHandler ;