# ShareSync — Project Progress Tracker

> **Purpose:** Living development tracker. Check before every task; update after every task.  
> **Stack:** React Native (Expo SDK 57) + TypeScript | Node.js (Express 5 + Socket.IO 4) + PostgreSQL + Firebase  
> **This file is the canonical progress report.** `PROJECT_PROGRESS.md` is an identical copy. `SHARESYNC_RESUME_CHECKPOINT.md` is a hand-off note written by another session; where they differ, this file is authoritative.

---

## 0. Status Summary (as of 2026-11-20)

**Overall roadmap completion: ~78%** (server features are implemented and covered by automated tests; the new app screens compile and bundle for web and Android but have **not yet been exercised on a real device or browser**, which is why the overall figure is lower than the per-area server numbers).

| Roadmap area | Status | Done | Evidence / what is missing |
|---|---|---|---|
| A. Accounts & authentication | ✅ Done | ~95% | Email/password, Google Sign-In, profile management, account deletion — server tested. Google on Android/iOS needs OAuth client IDs + a development build |
| B. Workspace & file management | 🟢 Mostly done | ~90% | Tested; file versions; in-app preview (images, text, PDF on web/iOS, audio/video on web). Missing: folder move, recursive folder delete, sort by type |
| C. File & folder sharing | ✅ Done | ~95% | 132 sharing API checks. Missing: public deployment so links work off-LAN |
| D. Real-time synchronization | 🟢 Implemented | ~85% | Socket.IO + change feed + conflicts tested end-to-end on the server (two "devices" per user). Offline files are mobile-only; client sync not yet device-tested |
| E. Notes & document workspace | 🟢 Implemented | ~90% | CRUD, folders, permissions, conflicts, offline outbox. Server tested; editor UI not device-tested |
| F. Notifications | 🟢 Implemented | ~85% | In-app history, read/unread, real-time delivery tested. Mobile push needs EAS project + `PUSH_ENABLED` (see §6) |
| G. Security & access control | 🟢 Mostly done | ~90% | IDOR, roles, links, rate limits, validation, encryption at rest tested. Missing: HTTPS in deployment |
| H. Platform & infrastructure | 🟡 Partial | ~75% | Migrations, logging, validation, health checks, test runner, S3 driver done. Missing: S3 verified against a real bucket, CI, Docker/deployment |
| Differentiators (audit log, offline, approvals) | 🟡 Started | ~30% | Activity/audit log API + offline files + offline notes done; approvals and team workflows not started |

**Automated tests:** `npm test` (server) → **11 suites, 664 assertions passing, 0 failing** (run 2026-11-20).

| Suite | Assertions | Covers |
|---|---|---|
| `test_phase_dh.mjs` | 144 | Real-time sync, change feed, devices, conflicts, notes, notifications, activity, health, validation, S3 driver, account deletion, DB constraints, fresh-DB migrations |
| `test_sharing_api.mjs` | 132 | Sharing, permissions, links, passwords, expiry, encryption at rest, tamper detection, CORS, brute-force lockout |
| `test_file_crud.mjs` | 85 | File API regression |
| `test_folder_crud.mjs` | 58 | Folder API regression |
| `test_sharing_services.mjs` | 47 | Sharing service layer |
| `test_user_crud.mjs` | 43 | User API, ownership |
| `test_frontend_integration.mjs` | 40 | Client ↔ API contract |
| `test_auth_login.mjs` | 32 | Login, token verification |
| `test_auth_register.mjs` | 31 | Registration |
| `test_profile_google.mjs` | 32 | Google session (create / reuse / no takeover / unverified refused), profile, stats, name edit validation, account deletion with recent-sign-in requirement |
| `test_push_notifications.mjs` | 20 | Push token registration, account switching, unregister, Expo transport, dead-token pruning (written by another session; route bug fixed here) |

**Client checks:** `npx tsc --noEmit` → 0 errors; `expo export` for web and Android → both bundles build. No device/emulator run yet.

---

## 1. Completed Features

| # | Feature | Client | Server | Notes |
|---|---------|--------|--------|-------|
| 1 | Dedicated Signup screen & Backend Sync | ✅ `app/signup.tsx` | ✅ `POST /api/auth/register` | Firebase signup, PostgreSQL record (no passwords), rollback on failure |
| 2 | Dedicated Login screen | ✅ `app/login.tsx` | — | Firebase + backend login; token not displayed |
| 3 | Verified Backend Login API | — | ✅ `POST /api/auth/login` | Firebase Admin verification; legacy linking only for verified emails |
| 4 | Firebase Auth Session Persistence | ✅ `config/firebase.ts` | — | AsyncStorage (native) / browser storage (web) |
| 5 | Global Auth Context | ✅ `context/AuthContext.tsx` | — | login, register, logout (logout also unregisters the push token) |
| 6 | Protected Routes & Navigation Guard | ✅ `app/_layout.tsx` | — | Public `/s/<token>`; return to link after sign-in |
| 7 | Home dashboard | ✅ `app/index.tsx` | — | Sync status, unread alerts, notes shortcut, offline files, synced device count |
| 8 | Auth token verification route | — | ✅ `GET /api/auth` | |
| 9 | Secure User CRUD API | — | ✅ `/api/users` | Ownership; email locked to verified token |
| 10 | Health checks | — | ✅ `GET /api/health`, `GET /api/health/ready` | Liveness + readiness (database, migrations, storage, encryption key, real-time) — 503 when not ready, no internals exposed |
| 11 | Test echo endpoint | — | ✅ `POST /api/test/users` | Disabled in production |
| 12 | Firebase Admin init | — | ✅ `config/firebase.js` | |
| 13 | CORS allowlist | — | ✅ `middleware/security.js`, Socket.IO | `CORS_ORIGINS`; production check refuses localhost / http origins |
| 14 | PostgreSQL pool | — | ✅ `config/db.js` | Pool error handler (no crash on idle disconnect), numeric port, optional TLS, `withTransaction()` |
| 15 | Environment config & validation | — | ✅ `config/env.js` | `validateEnv()` at startup; server refuses to start with missing/unsafe config |
| 16 | Structured logging | — | ✅ `utils/log.js`, `middleware/logger.js` | JSON lines, levels, request ids (`X-Request-Id`), duration, secret/token redaction |
| 17 | Centralized error handling | — | ✅ `middleware/errorHandler.js` | `{ success, message, code, details?, requestId }`; malformed JSON 400; too large 413; JSON 404 for unknown routes; 500 internals hidden |
| 18 | Custom AppError | — | ✅ `utils/AppError.js` | Optional `code`, `details` |
| 19 | User service | — | ✅ `services/user.service.js` | Account deletion now removes all owned data atomically + stored files |
| 20 | Theme system | ✅ `constants/theme.ts` | — | |
| 21 | Color scheme hooks | ✅ hooks | — | |
| 22 | Themed UI primitives | ✅ components | — | |
| 23 | Tab navigation | ✅ `app-tabs.tsx`, `app-tabs.web.tsx` | — | Home, Files, Shared, Notes, Alerts (web shows unread count and sync status) |
| 24 | Animated splash | ✅ | — | |
| 25 | Folder API | — | ✅ `/api/folders` | CRUD, permissions, versions, change events; delete blocked if notes inside |
| 26 | File API | — | ✅ `/api/files` | Upload, list, metadata, download (`X-File-Version`), rename, move, delete, **new version upload**, versions + conflict detection |
| 27 | File Explorer | ✅ `FileExplorerScreen.tsx` | — | Live refresh on remote changes, notes section, "+ Note/Document here", upload new version, keep offline, sync badge |
| 28 | Mobile upload & download | ✅ | — | Native picker; download with progress; save/share |
| 29 | Sharing — DB & core services | — | ✅ | |
| 30 | Sharing — API & permission enforcement | — | ✅ `/api/shares`, `access.service.js` | |
| 31 | Share links | ✅ | ✅ `/api/public/links/:token` | Password, expiry, sign-in, view-only, folder containment |
| 32 | Share dialog | ✅ `ShareModal.tsx` | — | Users, WhatsApp, share sheet, copy, send copy |
| 33 | Shared tab | ✅ `app/shared.tsx` | — | Live updates when shared/revoked |
| 34 | Public link page | ✅ `app/s/[token].tsx` | — | |
| 35 | Encryption at rest | — | ✅ `utils/crypto.js`, `storage.service.js` | AES-256-GCM, streaming `DecryptStream` with tamper hold-back, both storage drivers |
| 36 | Security hardening | — | ✅ | helmet, rate limits, lockouts, limits |
| 37 | **Real-time sync (D)** | ✅ `context/SyncContext.tsx`, `services/sync.service.ts` | ✅ `realtime/socket.js`, `events.service.js` | Firebase-authenticated Socket.IO; private per-user rooms; events only to users with access; socket closed at token expiry; client reconnect with fresh token, backoff, NetInfo + foreground resync |
| 38 | **Change feed & offline catch-up (D)** | ✅ cursor in AsyncStorage | ✅ `/api/sync/changes`, `/api/sync/cursor`, `sync_events` | Ordered, paginated, per-user; retention pruning with watermark → `reset` = full reload |
| 39 | **Conflict detection (D)** | ✅ note editor conflict UI; file "new version" refresh | ✅ `version` on files/folders/notes | Atomic `WHERE version = expected`; 409 `CONFLICT` with current copy; never silently overwrites |
| 40 | **Sync devices (D)** | ✅ Home device count | ✅ `/api/sync/devices`, `sync_devices` | Tracked on socket connect and catch-up |
| 41 | **Offline files (D)** | ✅ `services/offline.service.ts`, Home list, 📥 on files | — | Android/iOS private copies; auto re-download on new version; removed when access revoked/file deleted. Not available on web |
| 42 | **Sync status indicator (D)** | ✅ `SyncStatusBadge.tsx` | — | Synced / Syncing / Connecting / Offline / Problem + "N waiting to sync"; tap to sync now |
| 43 | **Notes & documents (E)** | ✅ `app/notes.tsx`, `NoteEditorModal.tsx`, explorer notes section | ✅ `/api/notes`, `note.service.js`, `notes` table | CRUD, note/document kinds, folders, search, permissions from folder sharing, real-time sync, offline cache + outbox |
| 44 | **Notifications (E/F)** | ✅ `app/notifications.tsx`, unread counts | ✅ `/api/notifications`, `notification.service.js` | Share created / permission changed / revoked; uploads, deletes, notes in shared folders; history, read/unread, mark one/all, delete, real-time delivery, read state synced across devices |
| 45 | **Push notifications (F)** | ✅ `pushNotification.service.ts`, mounted in `_layout.tsx` (another session) | ✅ push token API + Expo transport | Delivery off unless `PUSH_ENABLED=true`; dead tokens pruned |
| 46 | **Activity / audit log (G/H)** | — (API only) | ✅ `/api/sync/activity`, `activity_log` | Uploads, edits, moves, deletes, downloads, link downloads, sharing; per-resource (viewers+) and personal feed |
| 47 | **Migration system (H)** | — | ✅ `migrate.mjs`, `migrations/001–005` | `npm run migrate` / `migrate:status`; baseline for core tables; advisory lock; transactional; idempotent; verified on a brand-new database |
| 48 | **Object storage driver (H)** | — | ✅ `S3Driver` in `storage.service.js` | AWS S3 / R2 / MinIO / B2; ciphertext only; mixed local+S3 reads. Verified with an in-memory S3 in tests, **not yet against a real bucket** |
| 49 | **Input validation (H/G)** | — | ✅ `middleware/validate.js` (zod) | All new endpoints + sharing endpoints; strict bodies (no mass assignment); control characters stripped |
| 50 | **Test runner (H)** | — | ✅ `run_tests.mjs` / `npm test` | Per-suite isolation, summary, cleanup of test rows, optional `TEST_DB_NAME` |
| 51 | **Google Sign-In (A)** | ✅ `components/auth/GoogleSignInButton.tsx`, `services/googleAuth.ts`, login & signup screens | ✅ `POST /api/auth/session` | Web: Firebase popup. Android/iOS: expo-auth-session ID token → Firebase. First sign-in creates the account from the verified Google email; an email already used by another account is refused (no takeover); unverified emails are never auto-registered |
| 52 | **Profile management (A)** | ✅ `components/profile/ProfileModal.tsx` (Home → Profile & account), `services/profile.service.ts` | ✅ `GET/PATCH/DELETE /api/users/me` | Edit name (DB + Firebase), email verification, change password (re-auth), reset email, sign-in method, usage stats, synced devices (forget), sign out, delete account (type DELETE + password/Google re-auth; server requires sign-in within 5 minutes; deletes all data and the Firebase account). Also "Forgot password?" on login |
| 53 | **File preview (B)** | ✅ `components/explorer/modals/FilePreviewModal.tsx` (tap a file) | — (uses authorised download) | Images incl. SVG (as image, no scripts), text/CSV/JSON/Markdown (first 200k chars), PDF (web + iOS), audio/video (web); 25MB limit; allow-listed render types; temporary native copies deleted on close; other types → Download / Open in another app |

---

## 2. Pending Features

| # | Feature | Priority | Reason not done / notes |
|---|---------|----------|-------|
| 1 | **Device testing of the app** | 🔴 High | Not possible in this environment (no device/emulator/browser automation). Needed for every client feature above |
| 2 | **Deployment: HTTPS, public web URL, Docker/hosting** | 🔴 High | Requires hosting decisions and a domain. Without it, share links point to localhost and data is not encrypted in transit |
| 3 | **Verify S3 driver against a real bucket** | 🟡 Medium | Needs real credentials (`S3_*`); none provided |
| 4 | **Mobile push delivery live** | 🟡 Medium | Needs an EAS project id in `app.json` (`extra.eas.projectId`) and `PUSH_ENABLED=true`; physical device required |
| 6 | **Folder move & recursive delete** | 🟡 Medium | Not started; only empty folders can be deleted |
| 7 | **Google Sign-In on Android/iOS — configuration** | 🟡 Medium | Code done; needs `EXPO_PUBLIC_GOOGLE_*_CLIENT_ID` and a development build (does not work in Expo Go). Web works once Google is enabled in Firebase |
| 8 | **Sign out of all devices** | 🔵 Low | Profile can "forget" a device record but cannot revoke its session yet (needs Firebase token revocation + revoked-token checks) |
| 8b | **PDF preview on Android, audio/video preview on mobile** | 🔵 Low | Shown via "Open in…" another app instead |
| 9 | **Activity log UI** | 🔵 Low | API exists; no screen |
| 10 | **Offline files on web** | 🔵 Low | Browsers have no reliable private file storage; would need a service worker / IndexedDB design |
| 11 | **CI pipeline** | 🔵 Low | `npm test` exists; not wired into CI |
| 12 | **Approvals / team workflows** | 🔵 Low | Roadmap differentiators, not started |

---

## 3. In-Progress Features

| # | Feature | Status | Files | Blocker |
|---|---------|--------|-------|---------|
| — | None | — | — | — |

---

## 4. Code Registry

### Server — API endpoints

| Area | Endpoints |
|---|---|
| Health | `GET /api/health` (liveness), `GET /api/health/ready` (readiness) |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, **`POST /api/auth/session`** (Google / any provider: sign in or create), `GET /api/auth` (+ `/auth` aliases) |
| Users | **`GET/PATCH/DELETE /api/users/me`** (own profile, stats, delete account with recent sign-in), `GET/POST /api/users`, `GET/PATCH/DELETE /api/users/:id` |
| Folders | `POST/GET /api/folders`, `GET/PATCH/PUT/DELETE /api/folders/:id` (`expected_version` on rename) |
| Files | `POST /api/files/upload`, `GET /api/files`, `GET/PATCH/PUT/DELETE /api/files/:id` (`expected_version`), `GET /api/files/:id/download`, `PATCH/PUT /api/files/:id/move`, **`PUT /api/files/:id/content`** (new version) |
| Sharing | `POST /api/shares`, `PATCH/DELETE /api/shares/:type/:shareId`, `GET /api/shares/with-me`, `GET /api/shares/by-me`, `GET /api/shares/resource/:type/:id`, `POST /api/shares/links`, `DELETE /api/shares/links/:linkId` |
| Public links | `GET /api/public/links/:token`, `GET …/:token/contents`, `GET …/:token/download` |
| **Notes** | `GET /api/notes?folder_id=&q=&kind=`, `POST /api/notes`, `GET/PATCH/PUT /api/notes/:id` (`expected_version` required), `DELETE /api/notes/:id?expected_version=` |
| **Notifications** | `GET /api/notifications?limit=&before=&unread=`, `GET /api/notifications/unread-count`, `POST /api/notifications/read-all`, `PATCH /api/notifications/:id/read`, `DELETE /api/notifications/:id`, `POST /api/notifications/push-tokens`, `DELETE /api/notifications/push-tokens[/:token]` |
| **Sync** | `GET /api/sync/cursor`, `GET /api/sync/changes?since=&limit=`, `GET/POST /api/sync/devices`, `DELETE /api/sync/devices/:deviceId` |
| **Activity** | `GET /api/sync/activity`, `GET /api/sync/activity/:type/:id` |
| **Real-time** | Socket.IO at `/socket.io` — auth `{ token, deviceId, platform }`; server events `sync:hello`, `sync:event`, `notification:new`, `notification:read`, `auth:expired` |

### Database tables & migrations

| Migration | Adds |
|---|---|
| `001_baseline.mjs` | `users`, `folders`, `files` (+ constraints/indexes) — no-op on existing DB, builds a fresh one |
| `002_sharing_tables.mjs` | `file_shares`, `folder_shares`, `share_links` |
| `003_sharing_api.mjs` | link passwords/access counts, `files.is_encrypted`, `files.uploaded_by_uid` |
| `004_sync_notes_notifications.mjs` | `files.version`, `folders.version`, `notes`, `notifications`, `activity_log`, `sync_events`, `sync_devices`, `push_tokens` (FKs, CHECKs, indexes) |
| `005_sync_state.mjs` | `sync_state` (change-feed prune watermark) |
| (runner) | `schema_migrations` |

Backups taken before migrating: `server/backups/pre_feature30_backup_*.json`, `pre_feature31_backup_*.json` (git-ignored).

### Server — new / changed modules (this phase)

| File | Purpose |
|---|---|
| `server.js` | HTTP server + Socket.IO, config validation, sync pruning timer, graceful shutdown |
| `src/realtime/socket.js` | Authenticated real-time channel, per-user rooms, token-expiry disconnect, device tracking |
| `src/services/events.service.js` | Audience calculation, change feed, real-time push, activity log, pruning |
| `src/services/sync.service.js` | Change feed queries, cursor, devices |
| `src/services/note.service.js` | Notes CRUD, permissions, conflicts, notifications |
| `src/services/notification.service.js` | Notifications, read state, push tokens, pluggable transports (Expo push) |
| `src/services/activity.service.js` | Activity history with access checks |
| `src/services/access.service.js` | + `requireNoteAccess` |
| `src/services/storage.service.js` | `LocalDriver`, `S3Driver`, `StorageService` |
| `src/services/health.service.js` | Readiness checks |
| `src/services/file.service.js`, `folder.service.js` | Versions, conflicts, change events, notifications, `replaceFileContent` |
| `src/services/share.service.js`, `controllers/share.controller.js` | Share notifications + events |
| `src/services/user.service.js` | Full account deletion |
| `src/middleware/validate.js` | zod validation helpers |
| `src/middleware/logger.js`, `src/utils/log.js` | Structured logging |
| `src/middleware/errorHandler.js` | Error format, request ids |
| `src/utils/crypto.js` | + `DecryptStream` |
| `src/config/db.js`, `src/config/env.js` | Pool hardening, `validateEnv()`, new settings |
| `src/routes/note.routes.js`, `notification.routes.js`, `sync.routes.js`, `share.routes.js`, `health.routes.js` | New/validated routes |
| `migrate.mjs`, `migrations/*`, `run_tests.mjs`, `test_phase_dh.mjs`, `test_db.js` | Infrastructure & tests |

### Client — new / changed (this phase)

| File | Purpose |
|---|---|
| `context/SyncContext.tsx` | Sync engine (socket, cursor catch-up, backoff, NetInfo, AppState, event bus, unread count) |
| `components/SyncTasks.tsx` | Background jobs: notes outbox flush, offline-file refresh |
| `components/SyncStatusBadge.tsx` | Status indicator |
| `services/sync.service.ts`, `device.ts` | Socket + change-feed API, device id, storage helpers |
| `services/notes.service.ts` | Notes API, offline cache, outbox, conflict store |
| `services/notification.service.ts` | Notifications API (+ push token calls) |
| `services/offline.service.ts` | Offline files (native) |
| `services/pushNotification.service.ts` | Expo push registration (another session) |
| `services/api.ts` | Network-error detection, PUT uploads, error codes/details |
| `services/file.service.ts` | `replaceFile` |
| `app/notes.tsx`, `components/notes/NoteEditorModal.tsx` | Notes list and editor with conflict resolution |
| `app/notifications.tsx` | Notification centre |
| `app/index.tsx` | Sync card, alerts, offline files |
| `hooks/useFileExplorer.ts`, `components/explorer/FileExplorerScreen.tsx`, `FileCard.tsx`, `modals/UploadModal.tsx` | Live refresh, notes section, new version, offline toggle |
| `app/_layout.tsx`, `components/app-tabs*.tsx` | SyncProvider, Notes & Alerts tabs |

---

## 5. Security mechanisms (current)

- Firebase ID token verification on every protected HTTP route and on every real-time connection (sockets closed at token expiry).
- Central permission checks (owner / editor / viewer) for files, folders and notes; notes inherit folder sharing; root notes private.
- IDOR protection tested for files, folders, notes, notifications, devices, shares, links and activity (changing ids returns 403/404).
- Real-time and change-feed events delivered only to users with current access; revocation stops delivery immediately.
- Optimistic concurrency (versions) so concurrent edits never silently overwrite.
- AES-256-GCM encryption at rest (local and S3), tamper detection, secrets never logged; scrypt link passwords; hashed link tokens.
- zod validation with strict bodies; control-character stripping; size limits (100kb JSON, 1MB notes, 50MB files).
- Rate limits: general, auth, share creation, link access, failed-attempt lockout.
- helmet headers, CORS allowlist (HTTP + Socket.IO), production config checks.
- Error responses never include stack traces, SQL errors, storage paths, credentials or internal user ids.

---

## 6. Known Issues & Limitations

### 🔴 High

| # | Issue | Details |
|---|-------|---------|
| 1 | **App not tested on a device/browser** | All new screens type-check and bundle, but runtime behaviour on Android/iOS/web is unverified |
| 2 | **Share links point to localhost** | Set `EXPO_PUBLIC_WEB_URL` to a reachable address |
| 3 | **No HTTPS yet** | Encryption in transit requires deploying behind TLS |
| 4 | **Encryption key backup** | Losing `FILE_ENCRYPTION_KEY` makes stored files unreadable; key lives on the same server (use a KMS in production) |

### 🟠 Medium

| # | Issue | Details |
|---|-------|---------|
| 5 | **Tests use the development database** | `npm test` defaults to `.env` DB; set `TEST_DB_NAME` to isolate. Test rows are cleaned up after each run |
| 6 | **S3 driver unverified against a real provider** | Tested with an in-memory S3 only |
| 7 | **Push delivery not configured** | Needs EAS `projectId`, `PUSH_ENABLED=true`, physical device |
| 8 | **Email enumeration via sharing** | Rate-limited (30/15 min/user) but not hidden |
| 9 | **Outdated packages / npm audit** | `expo-doctor` reports 7 packages behind patch versions; `npm audit` warnings unreviewed |
| 10 | **Offline notes: edits to a note created offline and then moved** | Moving notes requires a connection (shown as an error offline) |

### 🔵 Low

| # | Issue | Details |
|---|-------|---------|
| 11 | Owner UID visible to shared users in folder responses | Not secret, but unnecessary |
| 12 | Unowned legacy seed record `files` id=11 | Unreachable by any user |
| 13 | Placeholder users from uploads (`<uid>@sharesync.local`) | |
| 14 | `ThemedView` ignores `lightColor`/`darkColor`; unused `hint-row.tsx`; collapsible chevron rotation inverted | Cosmetic |
| 15 | `SHARESYNC_RESUME_CHECKPOINT.md` duplicates parts of this report and states ~85% completion | This file is authoritative |

### ✅ Resolved in this phase

- No `pool.on('error')` handler; `DB_PORT` passed as string
- `test_db.js` typo (now checks Firebase Admin + DB)
- Health response typo `sucess`, `};;`
- Web tab bar linking to Expo docs (replaced by sync status)
- No migrations for base tables / no migration runner
- User deletion left encrypted files on disk (now removes all data atomically)
- Small tampered files returned partial data before failing (now rejected before any byte is sent)
- Push token unregister route shadowed by `DELETE /:id` (found by the push suite, fixed)

---

## 7. Next Development Phase

1. **Run the app on Android, iOS and web** and fix runtime issues (sync, notes, notifications, offline, share dialog).
2. **Deploy**: HTTPS reverse proxy, managed PostgreSQL (`DB_SSL=true`), S3/R2 bucket (`STORAGE_DRIVER=s3`), `CORS_ORIGINS`, `EXPO_PUBLIC_WEB_URL`, `npm run migrate` on release; wire `npm test` into CI.
3. **Push notifications live**: EAS project id + `PUSH_ENABLED=true`.
4. **Folder move, recursive delete, sort by type.**
5. **Configure Google OAuth client IDs and test Google Sign-In on devices.**
6. **Activity log screen; approvals/team workflows.**

---

## 8. Last Updated

| Date | Changes |
|------|---------|
| 2026-11-20 | **Google Sign-In, profile management, file preview (Features 51–53).**<br>1. **Server:** `POST /api/auth/session` (sign in or create from a verified token; 409 `ACCOUNT_EXISTS` prevents takeover, 404 `REGISTRATION_REQUIRED` for unverified emails; auth rate limit applied); `GET/PATCH/DELETE /api/users/me` (profile + usage stats, zod-validated name, account deletion requiring sign-in within 5 minutes, removes all data and the Firebase account).<br>2. **Client:** "Continue with Google" on login/signup (web popup; native expo-auth-session, hidden safely when not configured), "Forgot password?"; Profile & account screen (name, verification email, password change with re-auth, reset link, usage, devices, sign out, delete account with re-auth); tap-to-preview for files with allow-listed rendering. Added `expo-auth-session`, `expo-crypto`, `react-native-webview`.<br>3. **Tests:** new `test_profile_google.mjs` (32). Full run: **664 passed, 0 failed** (11 suites). Client `tsc` clean; web + Android bundles build. Not yet run on a device. |
| 2026-11-20 | **Features D–H (Features 37–50): real-time sync, notes & documents, notifications, security, platform.**<br>1. **Database:** migration runner `server/migrate.mjs` (`npm run migrate`, advisory lock, transactional, `schema_migrations`); migrations 001 (baseline core tables), 002–003 (wrap feature 29/30), 004 (`notes`, `notifications`, `activity_log`, `sync_events`, `sync_devices`, `push_tokens`, `version` columns), 005 (`sync_state`). Backup taken first; verified idempotent and on a brand-new database.<br>2. **Real-time sync:** Socket.IO with Firebase-authenticated handshakes, per-user rooms, token-expiry disconnect; change feed with cursor catch-up, pagination and prune watermark; device tracking; client `SyncProvider` with reconnect backoff, NetInfo/AppState resync, status badge; explorer, Shared tab and notes refresh live.<br>3. **Conflict detection:** versions on files/folders/notes; `expected_version` on rename/move/delete/notes; new `PUT /api/files/:id/content`; 409 `CONFLICT` with current copy; note editor offers keep mine / use theirs / save as copy.<br>4. **Offline:** notes cached with an outbox flushed on reconnect (conflicts kept); files can be kept offline on Android/iOS and are refreshed or removed automatically.<br>5. **Notes & documents:** `/api/notes` CRUD with folder-based permissions, search, kinds; Notes tab, editor, notes inside explorer folders.<br>6. **Notifications:** shares, permission changes, revocations, uploads/deletes/notes in shared folders; history, unread count, mark read/all, delete, real-time delivery and read-state sync; Alerts tab. Push tokens + Expo transport (another session added client registration and a push suite; fixed a route-ordering bug it found).<br>7. **Security/platform:** zod validation, structured JSON logging with redaction and request ids, readiness probe, env validation, DB pool hardening, S3-compatible storage driver with shared `DecryptStream`, full account deletion, JSON 404s, safe error format, `npm test` runner.<br>8. **Tests:** new `test_phase_dh.mjs` (144). Full run: **632 passed, 0 failed** (10 suites). Client: `tsc` clean; web + Android bundles build. Not yet run on a device. |
| 2026-11-20 | **Comprehensive Audit & Status Verification of Features D through H:**<br>1. Audited actual codebase state following master-build execution for Features D, E, F, G, H.<br>2. Verified all 5 database migrations applied and verified clean migration runner on fresh database.<br>3. Verified dual-driver storage architecture (`LocalDriver` and `S3Driver`) with encryption roundtrips.<br>4. Verified Socket.IO real-time sync with authenticated user rooms, token expiration disconnect, change feed, and offline catch-up.<br>5. Verified Notes and Document workspace with PostgreSQL persistence, folder nesting, and 409 conflict detection.<br>6. Verified Notifications system with real-time push, unread badges, history pagination, and mark-read.<br>7. Verified 9 backend test suites passing with **612 passed assertions, 0 failed**.<br>8. Verified client TypeScript compilation (`npx tsc --noEmit`) passes with **0 errors**.<br>9. Updated progress report and generated `SHARESYNC_RESUME_CHECKPOINT.md`. |
| 2026-11-20 | **File & Folder Sharing — Phases 3 & 4 (Features 30–35):**<br>1. **Database:** `server/migrate_feature30_sharing_api.mjs` (idempotent, backup taken first) adds `share_links.password_hash`, `access_count`, `last_accessed_at`, `files.is_encrypted`, `files.uploaded_by_uid` and lookup indexes.<br>2. **Permission enforcement:** new `access.service.js`; every file/folder endpoint now allows owner / editor / viewer according to direct or inherited shares. Editors upload into shared folders (files stay owned by the folder owner, uploader recorded); move, share and deleting the shared root stay owner-only.<br>3. **Sharing API:** `/api/shares` (share by email, change permission, revoke, with-me, by-me, who-has-access, create/revoke links) and public `/api/public/links/:token` (info, folder contents, download) with optional login.<br>4. **Links:** view-only; token shown once and stored as SHA-256; expiry up to 1 year or never; optional scrypt-hashed password via `X-Share-Password`; optional sign-in requirement; folder links confined to the shared tree; error codes `PASSWORD_REQUIRED`, `PASSWORD_INCORRECT`, `SIGN_IN_REQUIRED`, `RECIPIENT_NOT_FOUND`.<br>5. **Encryption at rest:** AES-256-GCM per-file keys derived from `FILE_ENCRYPTION_KEY`; last chunk held back until the auth tag verifies so tampered files are never delivered complete; legacy plaintext still readable; `encrypt_existing_files.mjs`; server refuses to start without a key; `server/.env.example` added.<br>6. **Security:** link brute-force lockout (10 failures/15 min), link access and share-creation rate limits, token redaction in logs, `no-store`/`nosniff` on downloads, optional-auth middleware that rejects forged tokens.<br>7. **App:** `ShareModal` (send to user, manage people, links with expiry/password/sign-in, WhatsApp, More apps, Copy link, send a file copy), **Shared** tab (`app/shared.tsx`), reusable `FileExplorerScreen` with permission-aware actions, public link page `app/s/[token].tsx`, `sharesync://` deep-link scheme, app name "ShareSync", return-to-link after sign-in. Added `expo-clipboard`.<br>8. **Testing:** new `server/test_sharing_api.mjs` (132 assertions) covering viewer/editor/stranger access, revoke, file vs folder shares, links, passwords, sign-in, expiry, containment, encryption on disk, tamper detection (including a 3.4 MB file), CORS preflight, and lockout. All suites: **468 passed, 0 failed**. Client: `tsc --noEmit` clean; web and Android bundles build. |
| 2026-11-19 | **Mobile upload & download (Feature 28):** native document picker (`expo-document-picker`) in `UploadModal`; native downloads to app cache with progress via `expo-file-system`, then "Save to device" (Android folder picker) or "Save / Share" (`expo-sharing`); download progress banner and success/error notices in the explorer; readable error messages for 401/403/404/429. |
| 2026-11-19 | **Security hardening (Feature 36):** untracked `client/.env` and DB backups and git-ignored them; blocked email changes via `PATCH /api/users/:id` and foreign emails on `POST /api/users`; legacy-account linking only for Firebase-verified emails; removed on-screen ID token display; added `helmet`, `express-rate-limit` (general + auth), CORS allowlist (`CORS_ORIGINS`), 100kb JSON limit, safe 500 messages, strict storage path check; debug routes disabled in production; fixed Router import bug in health/test routes. All 336 existing assertions still passing. |
| 2026-11-19 | **File & Folder Sharing — Phases 1 & 2 (Feature 29):**<br>1. **Phase 1 Database Migration & Verification:** Created and verified transactional migration script `server/migrate_feature29_shares.mjs` creating `file_shares`, `folder_shares`, and `share_links` tables. Established foreign keys (`ON DELETE CASCADE` from `files`/`folders`), unique constraints (`uq_file_share`, `uq_folder_share`, `uq_share_links_token_hash`), check constraints (`chk_file_no_self_share`, `chk_folder_no_self_share`, `chk_file_shares_permission`, `chk_folder_shares_permission`, `chk_share_links_resource`, `chk_anonymous_viewer_only`, `chk_share_links_permission`), and lookup/partial indexes. Preserved all legacy records intact (`resume.pdf`, id=11; 3 users, 2 folders, 1 file) with full backup and verified idempotency on second run.<br>2. **Phase 2 Modular Sharing Services:** Implemented `server/src/services/share.service.js` with comprehensive access control:<br>&nbsp;&nbsp;• `resolvePermission(userUid, resourceType, resourceId)`: Enforces owner full access, direct file share precedence over inherited folder permissions, recursive CTE nearest explicitly shared ancestor folder inheritance, and returns null (deny) when no permission matches.<br>&nbsp;&nbsp;• `shareWithUser()`: Verifies resource ownership, resolves recipient email against registered users with valid Firebase UID, blocks self-sharing (400) and duplicate shares (409).<br>&nbsp;&nbsp;• `createShareLink()`: Generates 32-byte cryptographically secure random tokens, stores only SHA-256 hashes, enforces viewer-only anonymous access (400 for anonymous editor), and handles expiration timestamps.<br>&nbsp;&nbsp;• `revokeUserShare()` & `revokeShareLink()`: Owner-verified direct share deletion and soft revocation (`is_active = false`).<br>&nbsp;&nbsp;• `getSharedWithMe()` & `getSharedByMe()`: Clean parameterized queries returning safe metadata without internal storage paths or token hashes.<br>&nbsp;&nbsp;• `resolveShareLink()`: Verifies token hash, active status, expiration, and authentication requirement before returning safe resource metadata.<br>3. **Automated Testing:** Created unit & integration test suite `server/test_sharing_services.mjs` verifying 47 assertions across all sharing requirements (47/47 passed, 0 failures). Re-verified all existing test suites (File CRUD: 85, Folder CRUD: 58, Frontend Integration: 40, User CRUD: 43, Auth Login: 32, Auth Register: 31). Total passing test assertions across all suites: 336 passed, 0 failures. |
| 2026-11-19 | **File Explorer Frontend (Feature 28):**<br>1. Built complete, responsive cloud-storage File Explorer UI in `client/src/app/explore.tsx` with light/dark theme tokens, replacing stock Expo boilerplate.<br>2. Implemented nested folder navigation with interactive, scrollable breadcrumb trail (`client/src/components/explorer/BreadcrumbNav.tsx`).<br>3. Implemented centralized API service layer with automatic Firebase Bearer token injection (`api.ts`, `folder.service.ts`, `file.service.ts`) connecting seamlessly to backend endpoints (`/api/folders` and `/api/files`). Configured `EXPO_PUBLIC_API_URL` with mobile, web, and emulator support.<br>4. Built genuine multipart/form-data upload progress reporting via `XMLHttpRequest` upload events in `api.ts` and `UploadModal.tsx`, enforcing client-side 50MB limits.<br>5. Built responsive folder and file cards (`FolderCard.tsx`, `FileCard.tsx`) supporting both Grid view and List view with color-coded MIME category badges and human-readable size and date formatters (`fileFormatters.ts`).<br>6. Implemented all file and folder CRUD modals: `CreateFolderModal`, `UploadModal`, `RenameModal`, `MoveModal` (with folder tree selection), and `DeleteConfirmModal` (with safe cascade restriction guidance).<br>7. Added real-time in-memory search filtering, multi-field sorting (Name, Size, Date), view mode toggles, and empty/loading/error states.<br>8. Added "Open File Explorer" shortcut on Home screen (`client/src/app/index.tsx`) and updated tab branding to "ShareSync" and "Files".<br>9. Verified entire application passes TypeScript checks (`npx tsc --noEmit` with 0 errors). Created comprehensive automated frontend-to-backend integration test suite (`server/test_frontend_integration.mjs`) verifying 40 assertions (40/40 passed, 0 failures). Total passing assertions across all suites: 314 passed, 0 failures. |
| 2026-11-18 | **File Management API:**<br>1. Enhanced PostgreSQL `files` schema: added `owner_firebase_uid VARCHAR(128)`, `updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`, `idx_files_owner_firebase_uid`, and partial unique indexes `idx_files_unique_name_in_folder` (on `owner_firebase_uid, folder_id, LOWER(name)`) and `idx_files_unique_root_name` (on `owner_firebase_uid, LOWER(name)`) with predicate `WHERE owner_firebase_uid IS NOT NULL` to safely preserve legacy records without conflicts.<br>2. Preserved all legacy records intact, specifically `resume.pdf` (id=11) with `owner_id=1` and `folder_id=4`; maintained `owner_id NOT NULL` foreign key referencing `users(id)`.<br>3. Implemented decoupled storage layer `server/src/services/storage.service.js` with per-user directory isolation (`uploads/<ownerUid>/`), UUID filename generation via Node.js native `crypto.randomUUID()`, path traversal protection, and clean abstraction for future cloud storage integration (S3/GCS). Added `uploads/` to `.gitignore`.<br>4. Implemented file validation utility `server/src/utils/fileValidator.js`: enforces configurable 50MB file size limit (`MAX_FILE_SIZE`), sanitizes filenames against path traversal/control characters, and inspects magic byte signatures (PDF, PNG, JPEG, GIF, WEBP, ZIP/OpenXML, plain text) while explicitly detecting and rejecting disguised executables (PE, ELF, Mach-O).<br>5. Implemented `server/src/services/file.service.js` with `uploadFile`, `getFiles`, `getFileById`, `getFileForDownload`, `renameFile`, `moveFile`, `deleteFile`, and `getOrCreatePostgresUserId`.<br>6. Implemented `server/src/controllers/file.controller.js` for all 7 file endpoints with safe streaming download headers (RFC 5987 Content-Disposition) and zero exposure of internal storage paths.<br>7. Configured `server/src/routes/file.routes.js` with Multer memory storage and `authMiddleware`; mounted at `/api/files` and `/files` in `server/src/app.js`.<br>8. Built comprehensive test suite `server/test_file_crud.mjs` verifying 85 assertions across authentication, validation, upload, listing, retrieval, download streaming, renaming, moving, safe deletion, route aliases, and legacy record preservation (85/85 passed, 0 failures). Total passing test assertions across all suites: 249 passed, 0 failures. |
| 2026-11-17 | **Folder Management API:**<br>1. Migrated PostgreSQL `folders` schema: added `owner_firebase_uid VARCHAR(128)`, `parent_folder_id BIGINT REFERENCES folders(id) ON DELETE RESTRICT`, `updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`, dropped NOT NULL on legacy `owner_id`, added indexing on `owner_firebase_uid`, `parent_folder_id`, and partial unique indexes for root and child folder names.<br>2. Implemented `server/src/services/folder.service.js` with `createFolder`, `getFolders`, `getFolderById`, `renameFolder`, `deleteFolder`, `validateFolderName`, and `validateFolderId`. Uses parameterized queries and throws `AppError`.<br>3. Implemented `server/src/controllers/folder.controller.js` for all CRUD operations, binding caller to `req.user.uid`.<br>4. Implemented `server/src/routes/folder.routes.js` with `authMiddleware` protecting every endpoint.<br>5. Mounted `/api/folders` and `/folders` in `server/src/app.js`.<br>6. Implemented strict ownership checks (403 for non-owners, 404 for non-existent folders), nested parent ownership verification, duplicate folder name collision checks (409), and rejection of unsafe deletions for folders containing subfolders or files (400).<br>7. Created comprehensive automated test suite `server/test_folder_crud.mjs` verifying 58 assertions across authentication, validation, creation, nesting, listing, retrieval, renaming, safe/unsafe deletion, and route aliases (58/58 passed, 0 failures). Total passing test assertions across all suites: 189 passed, 0 failures. |
| 2026-11-16 | **User Registration & Backend Synchronization (Feature 18):**<br>1. Built `client/src/app/signup.tsx` with name, email, password fields, display name update, backend synchronization, and rollback on failure.<br>2. Implemented `register` in `client/src/context/AuthContext.tsx` using `createUserWithEmailAndPassword()` and `updateProfile()`.<br>3. Implemented `POST /api/auth/register` and `/auth/register` in `server/src/controllers/auth.controller.js` and `server/src/routes/auth.routes.js`.<br>4. Extracted UID and email strictly from verified Firebase ID token via `authMiddleware`; prevented duplicate registration via UID and email checks (409 Conflict); added name validation (400 Bad Request).<br>5. Audited and eliminated unsafe password storage: altered PostgreSQL `users.password_hash` to NULL, removed password insertion from `createUser` in `user.service.js` and `user.controller.js`.<br>6. Added links between Login and Signup screens.<br>7. Updated `NavigationGuard` in `_layout.tsx` to handle `/signup` without tab bar.<br>8. Added comprehensive automated test suite `server/test_auth_register.mjs` (31 assertions passed, 0 failures). Total passing test assertions across all suites: 131 passed, 0 failures. |
