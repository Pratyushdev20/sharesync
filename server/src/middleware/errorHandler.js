import AppError from "../utils/AppError.js";
import log from "../utils/log.js";
import { redactUrl } from "./logger.js";

/**
 * Central error handler. Responses: { success: false, message, code?, details?, requestId }
 * - Unexpected errors (5xx, non-AppError) return a generic message; details go to the log only.
 * - Only our own AppError codes/details are exposed (never raw DB/system codes).
 */
const errorHandler = (err, req, res, next) => {
    // Malformed JSON bodies / payload too large from express.json()
    let status = err.statuscode || err.statusCode || err.status || 500;
    if (err.type === "entity.parse.failed") status = 400;
    if (err.type === "entity.too.large") status = 413;

    const isOperational = err instanceof AppError || err.isOperational === true;

    if (status >= 500) {
        log.error("http.unhandled_error", {
            requestId: req.id,
            method: req.method,
            path: redactUrl(req.originalUrl),
            err,
        });
    }

    let message;
    if (err.type === "entity.parse.failed") message = "Request body is not valid JSON";
    else if (err.type === "entity.too.large") message = "Request body is too large";
    else message = isOperational || status < 500 ? err.message || "Request failed" : "Internal server error";

    const body = { success: false, message };
    if (err instanceof AppError && typeof err.code === "string") body.code = err.code;
    if (err instanceof AppError && err.details && typeof err.details === "object") body.details = err.details;
    if (req.id) body.requestId = req.id;

    if (res.headersSent) {
        res.destroy();
        return;
    }
    res.status(status).json(body);
};

export default errorHandler;
