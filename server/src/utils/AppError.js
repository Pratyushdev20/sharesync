export default class AppError extends Error{
    constructor(message,statuscode){
        super(message);
        this.statuscode = statuscode;
        this.statusCode = statuscode;
        this.isoperational = true;
        this.isOperational = true;

    }
}