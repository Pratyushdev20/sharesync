# Deploying ShareSync

Backend → **Render** (web service + PostgreSQL), files → **Cloudflare R2**, web app → any static host, mobile → **EAS**.
The repository already contains the configuration: [`render.yaml`](render.yaml), [`server/.env.example`](server/.env.example), [`client/.env.production.example`](client/.env.production.example), [`client/eas.json`](client/eas.json).

---

## 0. Before you start

- Run `npm test` in `server/` locally — it must end with `0 failed`.
- Generate the file-encryption key **once** and store it in a password manager (losing it = losing every file):
  ```bash
  node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  ```
  For a fresh production database use a **new** key, not your development one.

## 1. File storage (pick one; both are free up to 10 GB)

Files are encrypted by ShareSync before upload, so the storage provider only ever holds ciphertext.

**Option A: Backblaze B2 (no credit card needed)**
1. backblaze.com → sign up → **B2 Cloud Storage** → **Create a Bucket** (e.g. `sharesync-files-<yourname>`), Files in Bucket: **Private**.
2. Note the bucket's **Endpoint**, e.g. `s3.us-west-004.backblazeb2.com`, and its region (`us-west-004`).
3. **Application Keys** → **Add a New Application Key** → access to that bucket only, *Read and Write*.
4. Values: `S3_ENDPOINT=https://s3.<region>.backblazeb2.com`, `S3_REGION=<region>`, `S3_BUCKET`, `S3_ACCESS_KEY_ID` = *keyID*, `S3_SECRET_ACCESS_KEY` = *applicationKey* (shown once).

**Option B: Cloudflare R2 (asks for a payment card even on the free tier)**
1. Cloudflare dashboard → **R2** → **Create bucket** (e.g. `sharesync-files`), private.
2. R2 → **Manage API tokens** → **Create API token** → *Object Read & Write*, limited to that bucket.
3. Values: `S3_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com`, `S3_REGION=auto`, bucket, Access Key ID, Secret Access Key.

## 2. Backend + database — Render Blueprint

1. Push the repository to GitHub.
2. Render → **New → Blueprint** → choose the repo. Render reads `render.yaml` and creates:
   - `sharesync-api` (Node web service, root `server/`, region Singapore, 1 instance, health check `/api/health`)
   - `sharesync-db` (PostgreSQL 17, private network only)
3. Render asks for the secret values:

   | Variable | Where it comes from |
   |---|---|
   | `CORS_ORIGINS` | Your web app URL(s), https only, comma-separated, e.g. `https://app.yourdomain.com` |
   | `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` | Firebase Console → Project settings → Service accounts → *Generate new private key* (copy the three fields from the JSON; paste the private key exactly as shown) |
   | `FILE_ENCRYPTION_KEY` | The key from step 0 |
   | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` | Step 1 |

4. Deploy. Each release runs `npm run migrate` first (pre-deploy), then `npm start`.
   The server **refuses to start** if configuration is unsafe (missing secrets, local disk storage, `http://`/localhost CORS) and logs exactly what is wrong.
5. Check: `https://<service>.onrender.com/api/health/ready` → `"status":"ready"` with every check `true`.

**Custom domain:** service → Settings → Custom Domains → add `api.yourdomain.com` and the DNS record shown. HTTPS is automatic; live sync (WebSockets) works on it.

### Plan notes (render.yaml is set up for the FREE plan)
- The Blueprint also creates **`sharesync-web`**, the web app as a free static site (built from `client/`, all paths served by `index.html`).
- Free API: sleeps after ~15 min idle (first request then takes ~1 min); migrations run at start (`npm run start:migrate`).
- **Free PostgreSQL expires after 30 days.** Upgrade the database (and ideally the API) before real users depend on it; then switch the API to `plan: starter`, `preDeployCommand: npm run migrate`, `startCommand: npm start`.
- Keep **one instance** (`numInstances: 1`). Rate limits and real-time rooms live in memory; scaling out needs Redis first.
- `UPLOAD_CONCURRENCY=2` caps simultaneous uploads on the 512 MB free instance.

## 3. Firebase (production)

- Authentication → Settings → **Authorized domains**: add your web app domain (the API domain does not need to be listed).
- Authentication → Sign-in method: **Email/Password** on; **Google** on (see `client/scripts/check-google-signin.mjs`).
- Authentication → Templates: set the sender name / email for verification and password-reset mails.

## 4. Web app

Created by the Blueprint as **`sharesync-web`** (Render static site). Its `EXPO_PUBLIC_*` variables are baked in at build time,
so after changing any of them use **Manual Deploy → Clear build cache & deploy**.
Its address must be in the API's `CORS_ORIGINS`, and the API's address in `EXPO_PUBLIC_API_URL`.

To host elsewhere instead: fill `client/.env.production` (from the example), run `npx expo export --platform web`,
upload `client/dist`, and configure a rewrite of every path to `/index.html`.

## 5. Mobile apps (EAS)

```bash
cd client
npx eas-cli login
npx eas-cli env:create --environment production   # add the EXPO_PUBLIC_* values from .env.production.example
npx eas-cli build --profile production --platform android
```
App id: `com.sharesync.app` (`app.json`). For Google Sign-In on Android, create an *Android* OAuth client with that package and the SHA-1 shown by `npx eas-cli credentials`.

## 6. After the first deploy

- Sign up, upload, share, open a share link, edit a note from two devices — all against the production URLs.
- Add an uptime monitor (e.g. UptimeRobot) on `/api/health`.
- Render → Logs shows the structured JSON logs (`event`, `requestId`, `status`, `durationMs`).
- Test a database restore once from Render's backups.

## Troubleshooting

| Symptom | Fix |
|---|---|
| Deploy fails with `startup.config_error` | The log line names the missing/unsafe variable |
| Browser shows CORS error / API returns 403 "Origin not allowed" | Add the exact web origin (scheme + host, no trailing slash) to `CORS_ORIGINS` |
| `/api/health/ready` → storage `false` | Check `S3_*` values and that the token can access the bucket |
| Database SSL error when using an *external* URL | Prefer the internal `DATABASE_URL` from the Blueprint; otherwise `DB_SSL=true` (and `DB_SSL_REJECT_UNAUTHORIZED=false` if the provider's certificate isn't publicly trusted) |
| Uploads return 503 `SERVER_BUSY` | Too many simultaneous uploads for the instance size; raise `UPLOAD_CONCURRENCY` on a larger plan |
