import app from "./src/app.js"
import env from "./src/config/env.js"
import { getMasterKey } from "./src/utils/crypto.js"

// Fail fast if the file encryption key is missing or malformed
try {
    getMasterKey();
} catch (err) {
    console.error(`[startup] ${err.message}`);
    process.exit(1);
}

app.listen(env.port,() =>{
    console.log(`sharesync is working on ${env.port}`);
});
