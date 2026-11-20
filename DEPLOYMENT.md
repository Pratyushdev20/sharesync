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

## 1. File storage — Cloudflare R2 (free up to 10 GB, no download fees)

1. Cloudflare dashboard → **R2** → **Create bucket** (e.g. `sharesync-files`). Keep it **private** (no public access).
2. R2 → **Manage API tokens** → **Create API token** → permission *Object Read & Write*, limited to that bucket.
3. Note: **Access Key ID**, **Secret Access Key**, and the endpoint `https://<account-id>.r2.cloudflarestorage.com`.

Files are encrypted by ShareSync before upload, so R2 only ever stores ciphertext.

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

### Plan notes
- `starter` web plan and a paid database are set in `render.yaml`: pre-deploy migrations and no idle sleep need a paid web plan; paid databases have daily backups (free ones expire).
- Keep **one instance** (`numInstances: 1`). Rate limits and real-time rooms live in memory; scaling out needs Redis first.
- `UPLOAD_CONCURRENCY=3` caps simultaneous uploads (each is buffered in RAM). Raise it on bigger instances.
- On the free plan instead: remove `preDeployCommand`, set the start command to `npm run start:migrate`, and accept idle sleep.

## 3. Firebase (production)

- Authentication → Settings → **Authorized domains**: add your web app domain (the API domain does not need to be listed).
- Authentication → Sign-in method: **Email/Password** on; **Google** on (see `client/scripts/check-google-signin.mjs`).
- Authentication → Templates: set the sender name / email for verification and password-reset mails.

## 4. Web app

```bash
cd client
cp .env.production.example .env.production   # fill in; this file is git-ignored
npx expo export --platform web               # output: client/dist
```
Host `client/dist` on Vercel / Netlify / Cloudflare Pages / Render Static Site.
Configure the host to serve `index.html` for unknown paths (SPA fallback) so links like `/s/<token>` work.
Then make sure that exact origin is in the API's `CORS_ORIGINS`.

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
