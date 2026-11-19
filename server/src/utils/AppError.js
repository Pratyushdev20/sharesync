export default class AppError extends Error{
    /**
     * @param {string} message - Safe, user-facing message
     * @param {number} statuscode - HTTP status code
     * @param {string} [code] - Optional machine-readable code (e.g. "PASSWORD_REQUIRED") for clients
     */
    constructor(message,statuscode,code){
        super(message);
        this.statuscode = statuscode;
        this.statusCode = statuscode;
        this.isoperational = true;
        this.isOperational = true;
        if (code) this.code = code;
    }
}
