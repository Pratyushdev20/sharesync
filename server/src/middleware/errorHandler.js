const errorHandler = (err, req, res, next) => {
    const statuscode = err.statuscode || err.statusCode || 500;
    const isOperational = err.isOperational === true;

    if (statuscode >= 500) {
        console.error(`[ERROR] ${req.method} ${req.originalUrl}:`, err);
    }

    // Never leak internal error details (SQL errors, file paths, stack info) for unexpected errors
    const message = isOperational || statuscode < 500
        ? err.message || "Request failed"
        : "Internal server error";

    res.status(statuscode).json({
        success: false,
        message
    });
};

export default errorHandler ;
