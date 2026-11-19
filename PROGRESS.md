# ShareSync — Project Progress Tracker

> **Purpose:** Living development tracker. Check before every task; update after every task.  
> **Stack:** React Native (Expo SDK 57) + TypeScript | Node.js (Express 5) + PostgreSQL + Firebase

---

## 0. Status Summary (as of 2026-11-20)

**Overall roadmap completion: ~45%**

| Roadmap area | Status | Done | Notes |
|---|---|---|---|
| A. Accounts & authentication | 🟢 Mostly done | ~80% | Email/password, token verification, persistence, protected routes. Missing: Google Sign-In, profile screen |
| B. Workspace & file management | 🟢 Mostly done | ~85% | Full explorer on web **and** mobile (upload/download). Missing: file preview, move/recursive-delete folders, sort by type, global search |
| C. File & folder sharing | ✅ Done | ~95% | Users (viewer/editor), links (expiry, password, sign-in), Shared tab, WhatsApp/share sheet. Missing: notifications |
| D. Real-time synchronization | 🔴 Not started | 0% | No WebSocket/polling; devices update only on refresh |
| E. Notes & documents | 🔴 Not started | 0% | — |
| F. Notifications | 🔴 Not started | 0% | Recipients see shares only after refreshing the Shared tab |
| G. Security & access control | 🟢 Mostly done | ~85% | Permissions, encryption at rest, rate limits, headers, CORS allowlist. Missing: HTTPS deployment, schema-based input validation |
| H. Platform & infrastructure | 🟡 Partial | ~50% | Missing: cloud object storage, full migrations, test runner, structured logging, deployment |
| Differentiators (audit log, offline, approvals) | 🔴 Not started | 0% | Link open counts are the only activity tracking so far |

**Tests:** 8 suites, **468 assertions passing, 0 failing** (run with `NODE_ENV=test node <suite>.mjs` from `server/`).

| Suite | Assertions |
|---|---|
| `test_sharing_api.mjs` | 132 |
| `test_file_crud.mjs` | 85 |
| `test_folder_crud.mjs` | 58 |
| `test_sharing_services.mjs` | 47 |
| `test_user_crud.mjs` | 43 |
| `test_frontend_integration.mjs` | 40 |
| `test_auth_login.mjs` | 32 |
| `test_auth_register.mjs` | 31 |

**Not yet verified:** the new app screens (Share dialog, Shared tab, link page, mobile upload/download) pass type-check and build for web/Android but have not been exercised on a real device or browser.

---

## 1. Completed Features

| # | Feature | Client | Server | Notes |
|---|---------|--------|--------|-------|
| 1 | Dedicated Signup screen & Backend Sync | ✅ `app/signup.tsx` | ✅ `POST /api/auth/register` | `createUserWithEmailAndPassword`, `updateProfile` for display name, token verification, creates PostgreSQL record without storing passwords, rollback on failure |
| 2 | Dedicated Login screen | ✅ `app/login.tsx` | — | `signInWithEmailAndPassword`; backend integration; link to Signup (ID token is no longer displayed on screen) |
| 3 | Verified Backend Login API | ✅ `app/login.tsx` | ✅ `POST /api/auth/login` | Accepts Firebase ID token via Bearer header or body, verifies with Firebase Admin SDK, extracts UID, fetches PostgreSQL user; links legacy records by email only when Firebase reports `email_verified` |
| 4 | Firebase Auth Session Persistence | ✅ `config/firebase.ts` | — | `initializeAuth()` with `getReactNativePersistence(AsyncStorage)` (native) / `browserLocalPersistence` (web); singleton pattern |
| 5 | Global Auth Context & State Management | ✅ `context/AuthContext.tsx` | — | `AuthProvider`, `useAuth()`, `onAuthStateChanged()` listener with cleanup, `user` and `loading` states, `login`, `register`, `logout` |
| 6 | Protected Routes & Navigation Guard | ✅ `app/_layout.tsx` | — | Redirects unauthenticated users to `/login`; permits `/signup` and public share links `/s/<token>`; returns to a pending share link after sign-in |
| 7 | Protected Home Dashboard | ✅ `app/index.tsx` | — | Displays authenticated user info, UID, shortcut to File Explorer, sign out |
| 8 | Auth token verification route | — | ✅ `GET /auth`, `GET /api/auth` | Uses `authMiddleware` to verify Firebase Bearer token |
| 9 | Secure User CRUD API | — | ✅ `/users`, `/api/users` | Ownership enforced via `req.user.uid`; email comes only from the verified token and cannot be changed via `PATCH` (prevents email takeover) |
| 10 | Health check endpoint | — | ✅ `GET /api/health` | Static response via `health.service.js` |
| 11 | Test echo endpoint | — | ✅ `POST /api/test/users` | Debug only — disabled when `NODE_ENV=production` (as is `GET /error`) |
| 12 | Firebase Admin SDK initialization on boot | — | ✅ `src/app.js`, `config/firebase.js` | Initialized at startup; null-safe private key parsing |
| 13 | CORS allowlist | — | ✅ `middleware/security.js` | Only origins in `CORS_ORIGINS` (default `localhost:8081`, `localhost:19006`); native apps (no Origin) unaffected; allows `X-Share-Password`, exposes `Content-Disposition` |
| 14 | PostgreSQL connection pool | — | ✅ `config/db.js` | Reads DB config from env vars |
| 15 | Environment config module | — | ✅ `config/env.js` | `port`, `nodeEnv`, `maxFileSize`, `uploadDir`, `corsOrigins`, rate-limit settings |
| 16 | Request logger middleware | — | ✅ `middleware/logger.js` | Logs `[METHOD] /path`; share-link tokens redacted |
| 17 | Standardized error handler | — | ✅ `middleware/errorHandler.js` | JSON `{ success:false, message, code? }`; hides internal details of unexpected 500 errors |
| 18 | Custom AppError class | — | ✅ `utils/AppError.js` | `statusCode`, `isOperational`, optional machine-readable `code` (e.g. `PASSWORD_REQUIRED`) |
| 19 | Secure User service layer | — | ✅ `services/user.service.js` | Data access for `users` without `password_hash` leaks |
| 20 | Theme system (light/dark) | ✅ `constants/theme.ts` | — | `Colors`, `Fonts`, `Spacing`, `BottomTabInset`, `MaxContentWidth` |
| 21 | Color scheme hooks (safe fallback) | ✅ hooks | — | `useColorScheme` (native + web hydration-safe), crash-proof `useTheme` |
| 22 | Themed UI primitives | ✅ components | — | `ThemedText`, `ThemedView`, `Collapsible`, `ExternalLink` |
| 23 | Tab navigation | ✅ `app-tabs.tsx`, `app-tabs.web.tsx` | — | Tabs: **Home**, **Files**, **Shared** (native + web) |
| 24 | Animated splash overlay | ✅ `animated-icon.tsx` | — | Reanimated keyframe animations + splash screen hide |
| 25 | Secure Folder Management API | — | ✅ `/folders`, `/api/folders` | Full CRUD; nested folders; duplicate prevention (409); non-empty delete blocked (400); all access through `access.service.js` (owner / editor / viewer) |
| 26 | Secure File Management API | — | ✅ `/files`, `/api/files` | Upload, list, metadata, streaming download, rename, move (owner only), delete; 50MB limit; magic-byte validation and executable rejection; permission checks through `access.service.js` |
| 27 | File Explorer Frontend | ✅ `components/explorer/FileExplorerScreen.tsx` | — | Breadcrumbs, grid/list, search, sort (name/size/date), all CRUD modals, upload progress, download progress banner, success/error notices; actions shown according to permission |
| 28 | Mobile upload & download | ✅ `UploadModal.tsx`, `file.service.ts`, `useFileExplorer.ts` | — | Native document picker (`expo-document-picker`); downloads to app cache with progress (`expo-file-system`), then "Save to device" (Android folder picker) or "Save / Share" (`expo-sharing`) |
| 29 | Sharing — database & core services | — | ✅ `services/share.service.js`, `migrate_feature29_shares.mjs` | `file_shares`, `folder_shares`, `share_links` with FKs (`ON DELETE CASCADE`) and constraints; `resolvePermission` (owner > direct share > nearest shared ancestor folder) |
| 30 | Sharing — API & permission enforcement | — | ✅ `/api/shares`, `access.service.js` | Share by email (viewer/editor), change permission, revoke, who-has-access, Shared with me / by me. Viewer: view + download. Editor: + upload, create subfolders, rename, delete contents. Owner only: move, share, delete the shared root. Re-sharing by recipients blocked |
| 31 | Share links | ✅ Share dialog | ✅ `/api/shares/links`, `/api/public/links/:token` | View-only links; 256-bit tokens stored as SHA-256 hashes and shown once; expiry (1 day–1 year or never); optional password (scrypt hash, `X-Share-Password` header); optional sign-in requirement; revoke; open counts; folder links confined to the shared folder tree |
| 32 | Share dialog | ✅ `modals/ShareModal.tsx` | — | Send to a ShareSync user by email, manage people and permissions, create/turn off links, share via **WhatsApp**, system share sheet ("More apps"), copy link, send a copy of the file itself |
| 33 | Shared tab | ✅ `app/shared.tsx` | — | Items others shared with you ("From X • Can view/edit"); browse into shared folders; upload/rename/delete when editor |
| 34 | Public link page | ✅ `app/s/[token].tsx` | — | Opens links with or without an account; password prompt; sign-in prompt; browse folder links; download; "Open in the ShareSync app" (`sharesync://s/<token>`) |
| 35 | Encryption at rest | — | ✅ `utils/crypto.js`, `storage.service.js` | AES-256-GCM with per-file keys (HKDF from `FILE_ENCRYPTION_KEY`); tamper detection (a modified file is never delivered complete); legacy plaintext files still readable; `encrypt_existing_files.mjs` to encrypt old files; server refuses to start without a key |
| 36 | Security hardening | — | ✅ `middleware/security.js` | `helmet` headers, `x-powered-by` off, general rate limit (300/15 min), auth limit (20/15 min), share-creation limit (30/15 min per user), link limit (120/15 min) and failed-attempt lockout (10/15 min), JSON body limit 100kb, `no-store` + `nosniff` on downloads, strict path-traversal check |

---

## 2. Pending Features

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 1 | **Real-time synchronization** | 🔴 High | Socket.IO with Firebase-authenticated connections; push changes to owners and shared users; sync status; conflict handling via `updated_at` |
| 2 | **Share notifications** | 🔴 High | In-app + push (`expo-notifications`) when something is shared, changed or revoked |
| 3 | **HTTPS deployment & public web URL** | 🔴 High | Share links use `EXPO_PUBLIC_WEB_URL` (defaults to `localhost`, so links don't work on other devices yet); TLS needed for encryption in transit |
| 4 | **File preview** | 🟡 Medium | Images, PDF, text |
| 5 | **Folder move & recursive delete** | 🟡 Medium | Only empty folders can be deleted; folders cannot be moved |
| 6 | **Google sign-in** | 🟡 Medium | Not started |
| 7 | **Profile screen** | 🟡 Medium | View/edit name, change password, delete account |
| 8 | **Migrations for base tables** | 🟡 Medium | Only sharing (feature 29/30) tables have scripts; `users`/`folders`/`files` were altered by hand |
| 9 | **Cloud object storage** | 🟡 Medium | Files on local disk; `storage.service.js` is ready to swap for S3/GCS/Firebase Storage |
| 10 | **Test runner & test database** | 🟡 Medium | Suites are standalone scripts against the real DB; no `npm test` |
| 11 | **Notes & documents** | 🟡 Medium | Not started |
| 12 | **Schema-based input validation** | 🔵 Low | Manual checks only (no Joi/Zod) |
| 13 | **Structured logging** | 🔵 Low | Only `console.log/error` |
| 14 | **Activity / audit log, offline mode, approvals** | 🔵 Low | Differentiators from the roadmap |

---

## 3. In-Progress Features

| # | Feature | Status | Files | Blocker |
|---|---------|--------|-------|---------|
| — | None | — | — | — |

---

## 4. Code Registry

### Client — Screens & Layouts

| File | Path | Exports | Purpose |
|------|------|---------|---------|
| Root layout | `client/src/app/_layout.tsx` | `RootLayout` (default) | AuthProvider, ThemeProvider, NavigationGuard (protects app; `/login`, `/signup`, `/s/*` are public; pending redirect after sign-in) |
| Signup screen | `client/src/app/signup.tsx` | default | Registration with backend sync and rollback |
| Login screen | `client/src/app/login.tsx` | default | Firebase + backend login |
| Home screen | `client/src/app/index.tsx` | default | User info, shortcut to File Explorer, sign out |
| Files tab | `client/src/app/explore.tsx` | default | Renders `FileExplorerScreen mode="mine"` |
| Shared tab | `client/src/app/shared.tsx` | default | Renders `FileExplorerScreen mode="shared"` |
| Share link page | `client/src/app/s/[token].tsx` | default | Public link viewer: password/sign-in prompts, folder browsing, downloads |

### Client — Contexts & State

| File | Path | Exports | Purpose |
|------|------|---------|---------|
| Auth Context | `client/src/context/AuthContext.tsx` | `AuthProvider`, `useAuth`, `AuthContextType` | Firebase auth state, login, register, logout |

### Client — Reusable Components

| Component | Path | Exports | Purpose |
|-----------|------|---------|---------|
| `ThemedText` | `client/src/components/themed-text.tsx` | `ThemedText`, `ThemedTextProps` | Theme-aware text |
| `ThemedView` | `client/src/components/themed-view.tsx` | `ThemedView`, `ThemedViewProps` | Theme-aware view |
| `Collapsible` | `client/src/components/ui/collapsible.tsx` | `Collapsible` | Expandable section |
| `ExternalLink` | `client/src/components/external-link.tsx` | `ExternalLink` | Opens URL in in-app browser / new tab |
| `AppTabs` | `client/src/components/app-tabs.tsx` | default | Native tab bar: Home, Files, Shared |
| `AppTabs` (web) | `client/src/components/app-tabs.web.tsx` | default, `TabButton`, `CustomTabList` | Web tab bar: Home, Files, Shared |
| `AnimatedSplashOverlay` | `client/src/components/animated-icon.tsx` (+ `.web.tsx`) | `AnimatedSplashOverlay`, `AnimatedIcon` | Splash fade-out |
| `FileExplorerScreen` | `client/src/components/explorer/FileExplorerScreen.tsx` | `FileExplorerScreen` | Shared explorer UI for "mine" and "shared" modes; permission-aware actions; download banner; Share dialog |
| `BreadcrumbNav` | `client/src/components/explorer/BreadcrumbNav.tsx` | `BreadcrumbNav` | Breadcrumbs; "+ Folder"/"Upload" shown only when allowed |
| `ExplorerToolbar` | `client/src/components/explorer/ExplorerToolbar.tsx` | `ExplorerToolbar` | Search, sort, view toggle, item count |
| `FolderCard` | `client/src/components/explorer/FolderCard.tsx` | `FolderCard` | Grid/list folder card; optional share/rename/delete; subtitle ("From X • Can view") |
| `FileCard` | `client/src/components/explorer/FileCard.tsx` | `FileCard` | Grid/list file card; download + optional share/rename/move/delete; subtitle |
| `EmptyState` | `client/src/components/explorer/EmptyState.tsx` | `EmptyState` | Empty/search states; custom title/message; optional actions |
| `CreateFolderModal` | `client/src/components/explorer/modals/CreateFolderModal.tsx` | `CreateFolderModal` | Create folder |
| `UploadModal` | `client/src/components/explorer/modals/UploadModal.tsx` | `UploadModal` | Web file input / native document picker, 50MB guard, progress |
| `RenameModal` | `client/src/components/explorer/modals/RenameModal.tsx` | `RenameModal` | Rename file/folder |
| `MoveModal` | `client/src/components/explorer/modals/MoveModal.tsx` | `MoveModal` | Move file between folders |
| `DeleteConfirmModal` | `client/src/components/explorer/modals/DeleteConfirmModal.tsx` | `DeleteConfirmModal` | Delete confirmation |
| `ShareModal` | `client/src/components/explorer/modals/ShareModal.tsx` | `ShareModal`, `ShareTarget` | Share with users, manage access, create/turn off links, WhatsApp / share sheet / copy, send file copy |
| `HintRow` | `client/src/components/hint-row.tsx` | `HintRow` | ⚠️ unused |
| `WebBadge` | `client/src/components/web-badge.tsx` | `WebBadge` | Expo SDK badge on web |

### Client — Hooks

| Hook | Path | Purpose |
|------|------|---------|
| `useColorScheme` | `client/src/hooks/use-color-scheme.ts` (+ `.web.ts`) | Color scheme (hydration-safe on web) |
| `useTheme` | `client/src/hooks/use-theme.ts` | Crash-safe theme resolver |
| `useFileExplorer` | `client/src/hooks/useFileExplorer.ts` | Explorer state for `mine`/`shared` modes: navigation, current access level, shared-item info, CRUD, upload, download with progress and save/share prompt, notices, share target |

### Client — Services & Utilities

| File | Path | Exports | Purpose |
|------|------|---------|---------|
| `api.ts` | `client/src/services/api.ts` | `getApiBaseUrl`, `getAuthToken`, `apiRequest`, `uploadFileWithProgress` | Authenticated fetch/XHR; errors carry `status` and `code` |
| `folder.service.ts` | `client/src/services/folder.service.ts` | `folderService` | Folder API calls |
| `file.service.ts` | `client/src/services/file.service.ts` | `fileService`, `SelectedFile`, `NativeDownloadResult` | File API calls; `pickNativeFile`, `downloadFile`, `downloadFromUrl`, `saveToDeviceFolder`, `shareDownloadedFile` |
| `share.service.ts` | `client/src/services/share.service.ts` | `shareService`, `LinkError` | Sharing API (users, permissions, links, Shared with me) and public link access (info, contents, download) |
| `shareTargets.ts` | `client/src/utils/shareTargets.ts` | `buildShareUrl`, `buildAppDeepLink`, `buildShareMessage`, `copyText`, `shareViaWhatsApp`, `shareViaSystemSheet`, `sendFileCopy`, `getWebAppUrl` | Sending links/files to WhatsApp and other apps |
| `pendingRedirect.ts` | `client/src/utils/pendingRedirect.ts` | `setPendingRedirect`, `takePendingRedirect` | Return to a share link after sign-in (in-app paths only) |
| `explorer.ts` | `client/src/types/explorer.ts` | File/folder, sharing and link types | Domain models |
| `fileFormatters.ts` | `client/src/utils/fileFormatters.ts` | `formatFileSize`, `formatDate`, `getFileTypeInfo` | Display formatting |

### Client — Config & Constants

| File | Path | Exports | Purpose |
|------|------|---------|---------|
| Firebase config | `client/src/config/firebase.ts` | `app`, `auth` (default) | Firebase client init with persistence |
| Type augmentations | `client/src/types/firebase-auth.d.ts` | — | Declares `getReactNativePersistence` |
| Theme constants | `client/src/constants/theme.ts` | `Colors`, `Fonts`, `Spacing`, ... | Design tokens |
| Global CSS | `client/src/global.css` | — | Font variables |
| App config | `client/app.json` | — | Name "ShareSync", scheme `sharesync`, plugins incl. `expo-sharing` |
| Env | `client/.env` (git-ignored), `.env.example` | — | `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL`, Firebase web config |

### Server — Entry & App

| File | Path | Exports | Purpose |
|------|------|---------|---------|
| Entry point | `server/server.js` | — | Verifies `FILE_ENCRYPTION_KEY`, starts Express on `env.port` |
| App setup | `server/src/app.js` | `app` (default) | Security headers, CORS, JSON limit, logger, rate limits, routes, error handler; debug routes only outside production |

### Server — Routes

| File | Path | Endpoints |
|------|------|-----------|
| Auth routes | `server/src/routes/auth.routes.js` | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth` (+ `/auth` aliases) |
| User routes | `server/src/routes/user.routes.js` | `GET/POST /api/users`, `GET/PATCH/DELETE /api/users/:id` |
| Health routes | `server/src/routes/health.routes.js` | `GET /api/health` |
| Test routes | `server/src/routes/test.routes.js` | `POST /api/test/users` (non-production only) |
| Folder routes | `server/src/routes/folder.routes.js` | `POST/GET /api/folders`, `GET/PATCH/PUT/DELETE /api/folders/:id` |
| File routes | `server/src/routes/file.routes.js` | `POST /api/files/upload`, `GET /api/files`, `GET/PATCH/PUT/DELETE /api/files/:id`, `GET /api/files/:id/download`, `PATCH/PUT /api/files/:id/move` |
| Share routes | `server/src/routes/share.routes.js` | `POST /api/shares`, `PATCH/DELETE /api/shares/:type/:shareId`, `GET /api/shares/with-me`, `GET /api/shares/by-me`, `GET /api/shares/resource/:type/:id`, `POST /api/shares/links`, `DELETE /api/shares/links/:linkId` |
| Public link routes | `server/src/routes/publicLink.routes.js` | `GET /api/public/links/:token`, `GET .../:token/contents?folder_id=`, `GET .../:token/download?file_id=` (optional login) |

### Server — Controllers

| File | Path | Purpose |
|------|------|---------|
| Auth | `server/src/controllers/auth.controller.js` | Register / login from verified token |
| Users | `server/src/controllers/user.controller.js` | User CRUD with ownership; email locked to token |
| Health / Test | `health.controller.js`, `test.controller.js` | Health check; echo |
| Folders | `server/src/controllers/folder.controller.js` | Folder CRUD |
| Files | `server/src/controllers/file.controller.js` | Upload, list, metadata, download (via `sendFileStream`), rename, move, delete |
| Shares | `server/src/controllers/share.controller.js` | Share/update/revoke, with-me/by-me, access list, create/revoke links, public link info/contents/download |

### Server — Middleware

| Function | Path | Purpose |
|----------|------|---------|
| `authMiddleware` | `server/src/middleware/auth.middleware.js` | Requires a valid Firebase ID token |
| `optionalAuthMiddleware` | `server/src/middleware/auth.middleware.js` | Public link routes: anonymous if no header, rejects invalid tokens |
| `securityHeaders`, `cors`, `apiLimiter`, `authLimiter`, `shareCreateLimiter`, `linkAccessLimiter`, `linkFailureLimiter` | `server/src/middleware/security.js` | Headers, CORS allowlist, rate limits |
| `errorHandler` | `server/src/middleware/errorHandler.js` | JSON errors with optional `code`; hides internal 500 details |
| `logger`, `redactUrl` | `server/src/middleware/logger.js` | Request log with token redaction |

### Server — Services

| Function | Path | Purpose |
|----------|------|---------|
| User service | `server/src/services/user.service.js` | `getUsers`, `createUser`, `getUserByEmail`, `getUserById`, `updateUser`, `deleteUser`, `getUserByFirebaseUid` |
| `requireFileAccess`, `requireFolderAccess`, `hasAtLeast`, `isFolderWithin` | `server/src/services/access.service.js` | Central permission checks (owner/editor/viewer) and folder-tree containment |
| Folder service | `server/src/services/folder.service.js` | `createFolder`, `getFolders`, `getFolderById` (returns `access`), `renameFolder`, `deleteFolder`, validators |
| File service | `server/src/services/file.service.js` | `uploadFile` (encrypted; into shared folders for editors), `getFiles`, `getFileById` (returns `access`), `getFileForDownload`, `openFileStream`, `renameFile`, `moveFile` (owner only), `deleteFile`, `getOrCreatePostgresUserId` |
| Share service | `server/src/services/share.service.js` | `resolvePermission`, `shareWithUser`, `updateUserSharePermission`, `revokeUserShare`, `createShareLink` (password), `revokeShareLink`, `loadActiveLink`, `resolveShareLink`, `getSharedWithMe`, `getSharedByMe`, `getResourceAccess` |
| Link service | `server/src/services/link.service.js` | `getLinkInfo`, `getLinkFolderContents`, `getLinkFileForDownload` (folder links confined to tree) |
| `storageService` | `server/src/services/storage.service.js` | Local disk storage: encrypted `saveFile`, decrypting `getFileStream` with tamper hold-back, `deleteFile`, `fileExists` |
| `getHealthStatus` | `server/src/services/health.service.js` | Static health response |

### Server — Utilities, Config & Scripts

| File | Path | Purpose |
|------|------|---------|
| `fileValidator` | `server/src/utils/fileValidator.js` | Filename/ID validation, magic bytes, size and type whitelist |
| `crypto` | `server/src/utils/crypto.js` | AES-256-GCM file encryption, scrypt link passwords, token hashing |
| `sendFile` | `server/src/utils/sendFile.js` | Safe download headers and stream abort on integrity failure |
| `authHelpers` | `server/src/utils/authHelpers.js` | `getVerifiedEmail` |
| `AppError` | `server/src/utils/AppError.js` | Operational errors with optional `code` |
| DB pool / Env / Firebase Admin | `server/src/config/*.js` | Configuration |
| Env | `server/.env` (git-ignored), `server/.env.example` | DB, Firebase Admin, **`FILE_ENCRYPTION_KEY`** (back it up), `CORS_ORIGINS`, limits |
| Migrations | `server/migrate_feature29_shares.mjs`, `server/migrate_feature30_sharing_api.mjs` | Sharing tables; link passwords, access counts, `files.is_encrypted`, `files.uploaded_by_uid`, indexes (idempotent) |
| `encrypt_existing_files.mjs` | `server/` | Encrypts pre-encryption files (dry run by default, `--apply` to run) |
| Backups | `server/backups/` (git-ignored) | Pre-migration JSON/SQL backups |

---

## 5. Duplicate Code

| # | Duplication | Locations | Recommendation |
|---|-------------|-----------|----------------|
| 1 | **Redundant `dotenv.config()`** | `config/db.js`, `config/env.js`, `config/firebase.js` | Call once in the entry point |
| 2 | **Animated icon native/web** | `animated-icon.tsx`, `animated-icon.web.tsx` | Expected for platform files, but `AnimatedIcon` itself is unused |
| 3 | **Save/share prompt after download** | `hooks/useFileExplorer.ts`, `app/s/[token].tsx` | Extract a shared `promptSaveOrShare()` helper |

---

## 6. Known Issues

### 🔴 High

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 1 | **Share links point to localhost** | `utils/shareTargets.ts` | Without `EXPO_PUBLIC_WEB_URL` set to a reachable address, links sent via WhatsApp cannot be opened on other devices |
| 2 | **No HTTPS yet** | Deployment | Data is encrypted at rest, but not in transit until the API is served over TLS |
| 3 | **Encryption key must be backed up** | `server/.env` | Losing `FILE_ENCRYPTION_KEY` makes every uploaded file unreadable; key lives on the same server as the files (use a KMS in production) |

### 🟠 Medium

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 4 | **No real-time sync** | Client/Server | Other devices and recipients only see changes after refreshing |
| 5 | **No migrations for base tables** | Server | `users`/`folders`/`files` structure only partly scripted |
| 6 | **Tests use the real database** | `server/test_*.mjs` | Suites insert and clean up data in the development DB; no isolated test DB or `npm test` |
| 7 | **Email enumeration via sharing** | `POST /api/shares` | Response reveals whether an email has an account (rate-limited to 30/15 min per user) |
| 8 | **No database pool error handler** | `server/src/config/db.js` | No `pool.on('error')`; an idle client disconnect can crash the server |
| 9 | **Deleting a user who owns files likely fails** | `DELETE /api/users/:id` | `files.owner_id` is a required FK, so the delete is expected to error (not yet tested); the Firebase account is not removed |
| 10 | **New screens not device-tested** | Client | Share dialog, Shared tab, link page and mobile upload/download pass type-check and bundle builds only |
| 11 | **Outdated packages** | Client/Server | `expo-doctor` reports 7 SDK packages behind patch versions; `npm audit` warnings not reviewed |

### 🔵 Low

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 12 | **Owner UID visible to shared users** | Folder API responses | `owner_firebase_uid` is returned to recipients (not secret, but unnecessary) |
| 13 | **Unowned legacy seed record** | `files` id=11 (`resume.pdf`) | Fake storage path and no owner; unreachable by any user |
| 14 | **Placeholder users from uploads** | `getOrCreatePostgresUserId` | May create users with `<uid>@sharesync.local` emails |
| 15 | **`test_db.js` typo** | `server/test_db.js:1` | `import irebaseApp`; tests Firebase, not the DB |
| 16 | **`DB_PORT` passed as string** | `server/src/config/db.js:14` | Not parsed as an integer |
| 17 | **Branding remnants** | `app-tabs.web.tsx`, `app.json` | Web tab bar links to Expo docs; app slug is still `client` |
| 18 | **Dead code** | `hint-row.tsx`, `AnimatedIcon` | Unused components |
| 19 | **`ThemedView` unused props** | `themed-view.tsx` | `lightColor`/`darkColor` accepted but ignored |
| 20 | **Health service quirks** | `health.service.js:5`, `health.controller.js` | `};;` and response key `sucess` |
| 21 | **Collapsible chevron rotation inverted** | `client/src/components/ui/collapsible.tsx:26` | 90deg when closed, -90deg when open |

### ✅ Resolved since last update

- Express Router import bug in `health.routes.js` / `test.routes.js` (now `import { Router } from "express"`)
- `client/.env` and DB backups were tracked in git (now ignored and untracked)
- `env.js` default `"devlopment"` typo
- Explore screen boilerplate (replaced by the File Explorer)
- Firebase ID token shown on Login/Home screens
- Open CORS (`*`), no rate limiting, no security headers
- Email takeover via `PATCH /api/users/:id`; legacy-account claiming via unverified email
- Mobile upload did nothing / mobile download did not save
- Shared users could not access anything (permissions now enforced via `access.service.js`)

---

## 7. Last Updated

| Date | Changes |
|------|---------|
| 2026-11-20 | **File & Folder Sharing — Phases 3 & 4 (Features 30–35):**<br>1. **Database:** `server/migrate_feature30_sharing_api.mjs` (idempotent, backup taken first) adds `share_links.password_hash`, `access_count`, `last_accessed_at`, `files.is_encrypted`, `files.uploaded_by_uid` and lookup indexes.<br>2. **Permission enforcement:** new `access.service.js`; every file/folder endpoint now allows owner / editor / viewer according to direct or inherited shares. Editors upload into shared folders (files stay owned by the folder owner, uploader recorded); move, share and deleting the shared root stay owner-only.<br>3. **Sharing API:** `/api/shares` (share by email, change permission, revoke, with-me, by-me, who-has-access, create/revoke links) and public `/api/public/links/:token` (info, folder contents, download) with optional login.<br>4. **Links:** view-only; token shown once and stored as SHA-256; expiry up to 1 year or never; optional scrypt-hashed password via `X-Share-Password`; optional sign-in requirement; folder links confined to the shared tree; error codes `PASSWORD_REQUIRED`, `PASSWORD_INCORRECT`, `SIGN_IN_REQUIRED`, `RECIPIENT_NOT_FOUND`.<br>5. **Encryption at rest:** AES-256-GCM per-file keys derived from `FILE_ENCRYPTION_KEY`; last chunk held back until the auth tag verifies so tampered files are never delivered complete; legacy plaintext still readable; `encrypt_existing_files.mjs`; server refuses to start without a key; `server/.env.example` added.<br>6. **Security:** link brute-force lockout (10 failures/15 min), link access and share-creation rate limits, token redaction in logs, `no-store`/`nosniff` on downloads, optional-auth middleware that rejects forged tokens.<br>7. **App:** `ShareModal` (send to user, manage people, links with expiry/password/sign-in, WhatsApp, More apps, Copy link, send a file copy), **Shared** tab (`app/shared.tsx`), reusable `FileExplorerScreen` with permission-aware actions, public link page `app/s/[token].tsx`, `sharesync://` deep-link scheme, app name "ShareSync", return-to-link after sign-in. Added `expo-clipboard`.<br>8. **Testing:** new `server/test_sharing_api.mjs` (132 assertions) covering viewer/editor/stranger access, revoke, file vs folder shares, links, passwords, sign-in, expiry, containment, encryption on disk, tamper detection (including a 3.4 MB file), CORS preflight, and lockout. All suites: **468 passed, 0 failed**. Client: `tsc --noEmit` clean; web and Android bundles build. |
| 2026-11-19 | **Mobile upload & download (Feature 28):** native document picker (`expo-document-picker`) in `UploadModal`; native downloads to app cache with progress via `expo-file-system`, then "Save to device" (Android folder picker) or "Save / Share" (`expo-sharing`); download progress banner and success/error notices in the explorer; readable error messages for 401/403/404/429. |
| 2026-11-19 | **Security hardening (Feature 36):** untracked `client/.env` and DB backups and git-ignored them; blocked email changes via `PATCH /api/users/:id` and foreign emails on `POST /api/users`; legacy-account linking only for Firebase-verified emails; removed on-screen ID token display; added `helmet`, `express-rate-limit` (general + auth), CORS allowlist (`CORS_ORIGINS`), 100kb JSON limit, safe 500 messages, strict storage path check; debug routes disabled in production; fixed Router import bug in health/test routes. All 336 existing assertions still passing. |
| 2026-11-19 | **File & Folder Sharing — Phases 1 & 2 (Feature 29):**<br>1. **Phase 1 Database Migration & Verification:** Created and verified transactional migration script `server/migrate_feature29_shares.mjs` creating `file_shares`, `folder_shares`, and `share_links` tables. Established foreign keys (`ON DELETE CASCADE` from `files`/`folders`), unique constraints (`uq_file_share`, `uq_folder_share`, `uq_share_links_token_hash`), check constraints (`chk_file_no_self_share`, `chk_folder_no_self_share`, `chk_file_shares_permission`, `chk_folder_shares_permission`, `chk_share_links_resource`, `chk_anonymous_viewer_only`, `chk_share_links_permission`), and lookup/partial indexes. Preserved all legacy records intact (`resume.pdf`, id=11; 3 users, 2 folders, 1 file) with full backup and verified idempotency on second run.<br>2. **Phase 2 Modular Sharing Services:** Implemented `server/src/services/share.service.js` with comprehensive access control:<br>&nbsp;&nbsp;• `resolvePermission(userUid, resourceType, resourceId)`: Enforces owner full access, direct file share precedence over inherited folder permissions, recursive CTE nearest explicitly shared ancestor folder inheritance, and returns null (deny) when no permission matches.<br>&nbsp;&nbsp;• `shareWithUser()`: Verifies resource ownership, resolves recipient email against registered users with valid Firebase UID, blocks self-sharing (400) and duplicate shares (409).<br>&nbsp;&nbsp;• `createShareLink()`: Generates 32-byte cryptographically secure random tokens, stores only SHA-256 hashes, enforces viewer-only anonymous access (400 for anonymous editor), and handles expiration timestamps.<br>&nbsp;&nbsp;• `revokeUserShare()` & `revokeShareLink()`: Owner-verified direct share deletion and soft revocation (`is_active = false`).<br>&nbsp;&nbsp;• `getSharedWithMe()` & `getSharedByMe()`: Clean parameterized queries returning safe metadata without internal storage paths or token hashes.<br>&nbsp;&nbsp;• `resolveShareLink()`: Verifies token hash, active status, expiration, and authentication requirement before returning safe resource metadata.<br>3. **Automated Testing:** Created unit & integration test suite `server/test_sharing_services.mjs` verifying 47 assertions across all sharing requirements (47/47 passed, 0 failures). Re-verified all existing test suites (File CRUD: 85, Folder CRUD: 58, Frontend Integration: 40, User CRUD: 43, Auth Login: 32, Auth Register: 31). Total passing test assertions across all suites: 336 passed, 0 failures. |
| 2026-11-19 | **File Explorer Frontend (Feature 28):**<br>1. Built complete, responsive cloud-storage File Explorer UI in `client/src/app/explore.tsx` with light/dark theme tokens, replacing stock Expo boilerplate.<br>2. Implemented nested folder navigation with interactive, scrollable breadcrumb trail (`client/src/components/explorer/BreadcrumbNav.tsx`).<br>3. Implemented centralized API service layer with automatic Firebase Bearer token injection (`api.ts`, `folder.service.ts`, `file.service.ts`) connecting seamlessly to backend endpoints (`/api/folders` and `/api/files`). Configured `EXPO_PUBLIC_API_URL` with mobile, web, and emulator support.<br>4. Built genuine multipart/form-data upload progress reporting via `XMLHttpRequest` upload events in `api.ts` and `UploadModal.tsx`, enforcing client-side 50MB limits.<br>5. Built responsive folder and file cards (`FolderCard.tsx`, `FileCard.tsx`) supporting both Grid view and List view with color-coded MIME category badges and human-readable size and date formatters (`fileFormatters.ts`).<br>6. Implemented all file and folder CRUD modals: `CreateFolderModal`, `UploadModal`, `RenameModal`, `MoveModal` (with folder tree selection), and `DeleteConfirmModal` (with safe cascade restriction guidance).<br>7. Added real-time in-memory search filtering, multi-field sorting (Name, Size, Date), view mode toggles, and empty/loading/error states.<br>8. Added "Open File Explorer" shortcut on Home screen (`client/src/app/index.tsx`) and updated tab branding to "ShareSync" and "Files".<br>9. Verified entire application passes TypeScript checks (`npx tsc --noEmit` with 0 errors). Created comprehensive automated frontend-to-backend integration test suite (`server/test_frontend_integration.mjs`) verifying 40 assertions (40/40 passed, 0 failures). Total passing assertions across all suites: 314 passed, 0 failures. |
| 2026-11-18 | **File Management API:**<br>1. Enhanced PostgreSQL `files` schema: added `owner_firebase_uid VARCHAR(128)`, `updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`, `idx_files_owner_firebase_uid`, and partial unique indexes `idx_files_unique_name_in_folder` (on `owner_firebase_uid, folder_id, LOWER(name)`) and `idx_files_unique_root_name` (on `owner_firebase_uid, LOWER(name)`) with predicate `WHERE owner_firebase_uid IS NOT NULL` to safely preserve legacy records without conflicts.<br>2. Preserved all legacy records intact, specifically `resume.pdf` (id=11) with `owner_id=1` and `folder_id=4`; maintained `owner_id NOT NULL` foreign key referencing `users(id)`.<br>3. Implemented decoupled storage layer `server/src/services/storage.service.js` with per-user directory isolation (`uploads/<ownerUid>/`), UUID filename generation via Node.js native `crypto.randomUUID()`, path traversal protection, and clean abstraction for future cloud storage integration (S3/GCS). Added `uploads/` to `.gitignore`.<br>4. Implemented file validation utility `server/src/utils/fileValidator.js`: enforces configurable 50MB file size limit (`MAX_FILE_SIZE`), sanitizes filenames against path traversal/control characters, and inspects magic byte signatures (PDF, PNG, JPEG, GIF, WEBP, ZIP/OpenXML, plain text) while explicitly detecting and rejecting disguised executables (PE, ELF, Mach-O).<br>5. Implemented `server/src/services/file.service.js` with `uploadFile`, `getFiles`, `getFileById`, `getFileForDownload`, `renameFile`, `moveFile`, `deleteFile`, and `getOrCreatePostgresUserId`.<br>6. Implemented `server/src/controllers/file.controller.js` for all 7 file endpoints with safe streaming download headers (RFC 5987 Content-Disposition) and zero exposure of internal storage paths.<br>7. Configured `server/src/routes/file.routes.js` with Multer memory storage and `authMiddleware`; mounted at `/api/files` and `/files` in `server/src/app.js`.<br>8. Built comprehensive test suite `server/test_file_crud.mjs` verifying 85 assertions across authentication, validation, upload, listing, retrieval, download streaming, renaming, moving, safe deletion, route aliases, and legacy record preservation (85/85 passed, 0 failures). Total passing test assertions across all suites: 249 passed, 0 failures. |
| 2026-11-17 | **Folder Management API:**<br>1. Migrated PostgreSQL `folders` schema: added `owner_firebase_uid VARCHAR(128)`, `parent_folder_id BIGINT REFERENCES folders(id) ON DELETE RESTRICT`, `updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`, dropped NOT NULL on legacy `owner_id`, added indexing on `owner_firebase_uid`, `parent_folder_id`, and partial unique indexes for root and child folder names.<br>2. Implemented `server/src/services/folder.service.js` with `createFolder`, `getFolders`, `getFolderById`, `renameFolder`, `deleteFolder`, `validateFolderName`, and `validateFolderId`. Uses parameterized queries and throws `AppError`.<br>3. Implemented `server/src/controllers/folder.controller.js` for all CRUD operations, binding caller to `req.user.uid`.<br>4. Implemented `server/src/routes/folder.routes.js` with `authMiddleware` protecting every endpoint.<br>5. Mounted `/api/folders` and `/folders` in `server/src/app.js`.<br>6. Implemented strict ownership checks (403 for non-owners, 404 for non-existent folders), nested parent ownership verification, duplicate folder name collision checks (409), and rejection of unsafe deletions for folders containing subfolders or files (400).<br>7. Created comprehensive automated test suite `server/test_folder_crud.mjs` verifying 58 assertions across authentication, validation, creation, nesting, listing, retrieval, renaming, safe/unsafe deletion, and route aliases (58/58 passed, 0 failures). Total passing test assertions across all suites: 189 passed, 0 failures. |
| 2026-11-16 | **User Registration & Backend Synchronization (Feature 18):**<br>1. Built `client/src/app/signup.tsx` with name, email, password fields, display name update, backend synchronization, and rollback on failure.<br>2. Implemented `register` in `client/src/context/AuthContext.tsx` using `createUserWithEmailAndPassword()` and `updateProfile()`.<br>3. Implemented `POST /api/auth/register` and `/auth/register` in `server/src/controllers/auth.controller.js` and `server/src/routes/auth.routes.js`.<br>4. Extracted UID and email strictly from verified Firebase ID token via `authMiddleware`; prevented duplicate registration via UID and email checks (409 Conflict); added name validation (400 Bad Request).<br>5. Audited and eliminated unsafe password storage: altered PostgreSQL `users.password_hash` to NULL, removed password insertion from `createUser` in `user.service.js` and `user.controller.js`.<br>6. Added links between Login and Signup screens.<br>7. Updated `NavigationGuard` in `_layout.tsx` to handle `/signup` without tab bar.<br>8. Added comprehensive automated test suite `server/test_auth_register.mjs` (31 assertions passed, 0 failures). Total passing test assertions across all suites: 131 passed, 0 failures. |
