/**
 * Checks Google Sign-In configuration.
 *   node scripts/check-google-signin.mjs
 *
 * 1. Google provider enabled in Firebase (asks Firebase's public auth API with the app's web key)
 * 2. Google OAuth client IDs present in .env for each platform
 * 3. App ids (package / bundle id) set in app.json for native builds
 */
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z0-9_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const app = JSON.parse(fs.readFileSync("app.json", "utf8")).expo;
const ok = (b) => (b ? "✅" : "❌");
let allWeb = true;
let allNative = true;

const key = env.EXPO_PUBLIC_FIREBASE_API_KEY;
let providerEnabled = false;
let providerMsg = "";
if (!key) {
  providerMsg = "EXPO_PUBLIC_FIREBASE_API_KEY missing";
} else {
  try {
    const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:createAuthUri?key=${encodeURIComponent(key)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ providerId: "google.com", continueUri: "http://localhost:8081" }),
    });
    const data = await res.json();
    providerEnabled = !data.error && Boolean(data.authUri);
    providerMsg = data.error ? data.error.message : "enabled";
  } catch (err) {
    providerMsg = `could not reach Firebase (${err.message})`;
  }
}
allWeb = providerEnabled;

console.log("\nWeb");
console.log(`  ${ok(providerEnabled)} Google provider in Firebase: ${providerMsg}`);
console.log("     (also add every address you open the web app from under Authentication → Settings → Authorized domains)");

console.log("\nAndroid / iOS (development or store build — not Expo Go)");
const checks = [
  ["EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID", Boolean(env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID)],
  ["EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID", Boolean(env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID)],
  ["EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID (only for iPhone)", Boolean(env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID)],
  [`android.package in app.json (${app.android?.package || "missing"})`, Boolean(app.android?.package)],
  [`ios.bundleIdentifier in app.json (${app.ios?.bundleIdentifier || "missing"})`, Boolean(app.ios?.bundleIdentifier)],
];
for (const [label, pass] of checks) {
  console.log(`  ${ok(pass)} ${label}`);
  if (!pass && !label.includes("iPhone") && !label.includes("ios.")) allNative = false;
}
allNative = allNative && providerEnabled;

console.log(`\nResult: web ${allWeb ? "READY" : "NOT READY"}, Android ${allNative ? "READY (build with: npx eas-cli build --profile development --platform android)" : "NOT READY"}\n`);
process.exitCode = allWeb ? 0 : 1;
