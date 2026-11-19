import AppError from "../utils/AppError.js";

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

    const body = { success: false, message };
    // Only expose our own machine-readable codes (never raw DB/system error codes)
    if (err instanceof AppError && typeof err.code === "string") {
        body.code = err.code;
    }
    res.status(statuscode).json(body);
};

export default errorHandler ;
