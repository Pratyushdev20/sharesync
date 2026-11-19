/**
 * Request logger. Share-link tokens are secrets, so any long hex token in the URL is
 * redacted before logging (logs are often shipped to third-party services).
 */
export function redactUrl(url) {
    return String(url).replace(/[0-9a-fA-F]{32,}/g, "[redacted]");
}

const logger = (req,res,next) => {
    console.log(`[${req.method}] ${redactUrl(req.originalUrl)}`);
    next();
};

export default logger ;
