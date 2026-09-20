import dotenv from "dotenv";

dotenv.config();

const env = {
    port:Number(process.env.PORT) || 2000,
    nodeEnv: process.env.NODE_ENV || "devlopment"
}

export default env ;