const errorHandler = (err, req, res, next) => {
    const statuscode = err.statuscode || err.statusCode || 500;
    res.status(statuscode).json({
        success: false,
        message: err.message || "Internal server error"
    });
};

export default errorHandler ;