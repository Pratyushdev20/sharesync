const errorHandler = (err,req,res,next) =>{
    console.error(err);

    res.status(500).json({
        sucess : "false",
        message:"Internal server issue"
    });
};

export default errorHandler ;