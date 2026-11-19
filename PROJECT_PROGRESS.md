# ShareSync — Project Progress Tracker

> **Purpose:** Living development tracker. Check before every task; update after every task.  
> **Stack:** React Native (Expo SDK 57) + TypeScript | Node.js (Express 5) + PostgreSQL + Firebase

---

## 1. Completed Features

| # | Feature | Client | Server | Notes |
|---|---------|--------|--------|-------|
| 1 | Dedicated Signup screen & Backend Sync | ✅ `app/signup.tsx` | ✅ `POST /api/auth/register` | `createUserWithEmailAndPassword`, `updateProfile` for display name, token verification, creates PostgreSQL record without storing passwords, rollback on failure |
| 2 | Dedicated Login screen | ✅ `app/login.tsx` | — | `signInWithEmailAndPassword`; backend integration; link to Signup; displays token |
| 3 | Verified Backend Login API | ✅ `app/login.tsx` | ✅ `POST /api/auth/login` | Accepts Firebase ID token via Bearer header or body, verifies with Firebase Admin SDK, extracts UID, fetches PostgreSQL user |
| 4 | Firebase Auth Session Persistence | ✅ `config/firebase.ts` | — | Configured with `initializeAuth()` and `getReactNativePersistence(AsyncStorage)`; singleton pattern |
| 5 | Global Auth Context & State Management | ✅ `context/AuthContext.tsx` | — | `AuthProvider`, `useAuth()`, `onAuthStateChanged()` listener with cleanup, `user` and `loading` states, `login`, `register`, `logout` |
| 6 | Protected Routes & Navigation Guard | ✅ `app/_layout.tsx` | — | Redirects unauthenticated users to `/login`; permits `/signup`; redirects authenticated users away from auth screens to `/`; prevents flashes and loops with loading screen |
| 7 | Protected Home Dashboard | ✅ `app/index.tsx` | — | Displays authenticated user info, UID, session state, Postman ID token viewer, sign out action |
| 8 | Auth token verification route | — | ✅ `GET /auth`, `GET /api/auth` | Uses `authMiddleware` to verify Firebase Bearer token |
| 9 | Secure User CRUD API | — | ✅ `/users`, `/api/users` routes | Protected by `authMiddleware`; strict ownership enforcement via `req.user.uid`; zero `password_hash` exposure or raw storage; proper 401/403/404 |
| 10 | Health check endpoint | — | ✅ `GET /api/health` | Static response via `health.service.js` |
| 11 | Test echo endpoint | — | ✅ `POST /api/test/users` | Returns `req.body` back |
| 12 | Firebase Admin SDK initialization on boot | — | ✅ `src/app.js`, `config/firebase.js` | Initialized at application startup; null-safe private key parsing |
| 13 | CORS middleware | — | ✅ `src/app.js` | Cross-origin headers enabled for web and mobile clients |
| 14 | PostgreSQL connection pool | — | ✅ `config/db.js` | Reads DB config from env vars |
| 15 | Environment config module | — | ✅ `config/env.js` | Exposes `port` and `nodeEnv` |
| 16 | Request logger middleware | — | ✅ `middleware/logger.js` | Logs `[METHOD] /path` to console |
| 17 | Standardized error handler | — | ✅ `middleware/errorHandler.js` | Central JSON error responses with `success: false` and HTTP status |
| 18 | Custom AppError class | — | ✅ `utils/AppError.js` | `extends Error` with `statusCode`/`statuscode` and `isOperational` |
| 19 | Secure User service layer | — | ✅ `services/user.service.js` | Data-access for `users` table without `password_hash` leaks; ownership queries; `getUserByEmail` |
| 20 | Theme system (light/dark) | ✅ `constants/theme.ts` | — | `Colors`, `Fonts`, `Spacing`, `BottomTabInset`, `MaxContentWidth` |
| 21 | Color scheme hooks (safe fallback) | ✅ hooks | — | `useColorScheme` (native + web hydration-safe), crash-proof `useTheme` defaulting safely to `'light'` |
| 22 | Themed UI primitives | ✅ components | — | `ThemedText` (8 variants), `ThemedView`, `Collapsible`, `ExternalLink` |
| 23 | Tab navigation | ✅ `app/_layout.tsx` | — | Native tabs (`AppTabs`) + web tabs (`AppTabs.web`) via Expo Router |
| 24 | Animated splash overlay | ✅ `animated-icon.tsx` | — | Reanimated keyframe animations + splash screen hide |
| 25 | Explore screen (protected) | ✅ `app/explore.tsx` | — | Protected behind NavigationGuard |
| 26 | Secure Folder Management API | — | ✅ `/folders`, `/api/folders` | Full CRUD (`POST`, `GET`, `GET /:id`, `PATCH`/`PUT /:id`, `DELETE`); strict Firebase UID ownership; nested folders & parent ownership validation; duplicate name prevention (409); unsafe deletion prevention for non-empty folders (400); parameterized SQL & AppError |
| 27 | Secure File Management API | — | ✅ `/files`, `/api/files` | Full file operations: upload (`POST /upload`), listing (`GET /`), metadata (`GET /:id`), secure streaming download (`GET /:id/download`), rename (`PATCH`/`PUT /:id`), move (`PATCH`/`PUT /:id/move`), delete (`DELETE /:id`); Multer memory storage with 50MB limit; magic bytes content validation against whitelist and executable detection; local disk storage abstraction (`storage.service.js`) with UUID isolation; strict Firebase UID ownership and folder access control; case-insensitive duplicate prevention (409); legacy records (`resume.pdf`, id=11) preserved |
| 28 | File Explorer Frontend | ✅ `app/explore.tsx`, components, hooks, services | — | Modern cloud-storage File Explorer UI in React Native (Expo SDK 57 + TypeScript); nested folder navigation with interactive breadcrumbs; folder creation, rename, and safe deletion; file upload with real-time progress tracking ($\le$50MB limit) and streaming downloads; file rename, move between folders, and deletion; search filtering, sorting (name/size/date), and grid/list view toggles; loading, empty, and error states; seamless integration with backend `/api/folders` and `/api/files` via Firebase ID tokens |
| 29 | File & Folder Sharing (Phases 1 & 2: Database Schema & Core Sharing Services) | — | ✅ `services/share.service.js`, schema migrations | Transactional PostgreSQL migration (`file_shares`, `folder_shares`, `share_links`) with foreign keys (`ON DELETE CASCADE`), uniqueness, and check constraints; centralized permission resolver (`resolvePermission`) enforcing owner > direct file share > nearest explicitly shared ancestor folder inheritance; email-based user sharing (`shareWithUser`) with self-share & duplicate prevention; secure link generation (`createShareLink`) storing 32-byte SHA-256 token hashes with expiry and anonymous viewer-only enforcement; share revocation (`revokeUserShare`, `revokeShareLink`); safe "Shared with Me" and "Shared by Me" queries; public/authenticated token resolver (`resolveShareLink`); zero exposure of internal storage paths or raw token hashes; 47 automated service tests passing |

| 30 | File & Folder Sharing (Phases 3 & 4: API, Permissions, Links, Encryption, App UI) | ✅ Share dialog, Shared tab, `/s/[token]` link page | ✅ `/api/shares`, `/api/public/links` | Share with registered users by email (viewer/editor), change/revoke; permissions enforced on every file/folder endpoint (viewer: view+download; editor: +upload/rename/delete contents; owner-only move/share); view-only links with expiry, optional scrypt-hashed password and sign-in requirement; folder links confined to the shared tree; WhatsApp / system share sheet / copy link / send file copy; AES-256-GCM encryption at rest with per-file keys and tamper detection; token redaction in logs; brute-force limits on links; 132 automated tests |
---

## 2. Pending Features

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 1 | **Share notifications** | 🔴 High | Sharing is done; recipients are not yet notified (push / in-app) |
| 2 | **Real-time sync** | 🔴 High | No WebSocket or real-time infrastructure |
| 3 | **Google sign-in** | 🟡 Medium | Not started |
| 4 | **Profile screen** | 🟡 Medium | No profile view/edit screen in client |
| 5 | **Database migrations / schema tool** | 🟡 Medium | Table structures need migration files (e.g. Knex/Prisma/SQL migrations) |
| 6 | **Input validation (server)** | 🟡 Medium | No Joi/Zod; manual checks only |
| 7 | **Push notifications** | 🔵 Low | Not started |
| 8 | **Rate limiting** | 🔵 Low | No rate limiting middleware |
| 9 | **Structured logging** | 🔵 Low | Only `console.log/error` |

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
| Root layout | `client/src/app/_layout.tsx` | `RootLayout` (default) | AuthProvider, ThemeProvider, NavigationGuard (route protection for `/login`, `/signup`, `/`) |
| Signup screen | `client/src/app/signup.tsx` | `SignupScreen` (default) | User registration with name, email, password, display name update, backend sync, failure rollback |
| Login screen | `client/src/app/login.tsx` | `LoginScreen` (default) | Dedicated login screen with Firebase + Backend authentication, link to signup |
| Home screen | `client/src/app/index.tsx` | `HomeScreen` (default) | Protected home screen: user info, UID, shortcut to File Explorer, Postman token viewer, sign out |
| File Explorer | `client/src/app/explore.tsx` | `FileExplorerScreen` (default) | Cloud-storage file explorer with breadcrumbs, grid/list view, search, upload with progress, and full CRUD modals |

### Client — Contexts & State

| File | Path | Exports | Purpose |
|------|------|---------|---------|
| Auth Context | `client/src/context/AuthContext.tsx` | `AuthProvider`, `useAuth`, `AuthContextType` | Centralized Firebase auth state, persistence listener, login, register, logout |

### Client — Reusable Components

| Component | Path | Exports | Purpose |
|-----------|------|---------|---------|
| `ThemedText` | `client/src/components/themed-text.tsx` | `ThemedText`, `ThemedTextProps` | Theme-aware text (default/title/small/smallBold/subtitle/link/linkPrimary/code) |
| `ThemedView` | `client/src/components/themed-view.tsx` | `ThemedView`, `ThemedViewProps` | Theme-aware view container |
| `Collapsible` | `client/src/components/ui/collapsible.tsx` | `Collapsible` | Expandable/collapsible section with animation |
| `ExternalLink` | `client/src/components/external-link.tsx` | `ExternalLink` | Opens URL in in-app browser (native) or new tab (web) |
| `AppTabs` | `client/src/components/app-tabs.tsx` | `AppTabs` (default) | Native bottom tab bar (Home, Explore) via `expo-router/unstable-native-tabs` with safe theme fallback |
| `AppTabs` (web) | `client/src/components/app-tabs.web.tsx` | `AppTabs` (default), `TabButton`, `CustomTabList` | Web tab bar with floating header and safe theme fallback |
| `AnimatedSplashOverlay` | `client/src/components/animated-icon.tsx` | `AnimatedSplashOverlay`, `AnimatedIcon` | Splash screen fade-out animation |
| `AnimatedSplashOverlay` (web) | `client/src/components/animated-icon.web.tsx` | `AnimatedSplashOverlay`, `AnimatedIcon` | Web version (returns null for overlay) |
| `BreadcrumbNav` | `client/src/components/explorer/BreadcrumbNav.tsx` | `BreadcrumbNav` | Interactive breadcrumb navigation bar with parent folder jump and action triggers |
| `ExplorerToolbar` | `client/src/components/explorer/ExplorerToolbar.tsx` | `ExplorerToolbar` | Search bar, sort controls (name/size/date), view mode toggle, item counter |
| `FolderCard` | `client/src/components/explorer/FolderCard.tsx` | `FolderCard` | Folder card supporting both grid and list view with open, rename, and delete actions |
| `FileCard` | `client/src/components/explorer/FileCard.tsx` | `FileCard` | File card supporting both grid and list view with MIME icon, download, rename, move, delete |
| `EmptyState` | `client/src/components/explorer/EmptyState.tsx` | `EmptyState` | Empty folder visual representation with search empty handling and call-to-actions |
| `CreateFolderModal` | `client/src/components/explorer/modals/CreateFolderModal.tsx` | `CreateFolderModal` | Dialog modal for creating folders with validation and duplicate error handling |
| `UploadModal` | `client/src/components/explorer/modals/UploadModal.tsx` | `UploadModal` | Upload modal with file picker, 50MB size guard, and real-time progress bar |
| `RenameModal` | `client/src/components/explorer/modals/RenameModal.tsx` | `RenameModal` | Reusable modal for renaming files and folders with validation |
| `MoveModal` | `client/src/components/explorer/modals/MoveModal.tsx` | `MoveModal` | Folder selector tree modal for moving files between folders or to root |
| `DeleteConfirmModal` | `client/src/components/explorer/modals/DeleteConfirmModal.tsx` | `DeleteConfirmModal` | Deletion confirmation modal with cascade restriction warnings |
| `HintRow` | `client/src/components/hint-row.tsx` | `HintRow` | Title + code snippet pill badge (⚠️ unused) |
| `WebBadge` | `client/src/components/web-badge.tsx` | `WebBadge` | Shows Expo SDK version badge on web |

### Client — Hooks

| Hook | Path | Purpose |
|------|------|---------|
| `useColorScheme` | `client/src/hooks/use-color-scheme.ts` | Re-export of RN `useColorScheme` (native) |
| `useColorScheme` (web) | `client/src/hooks/use-color-scheme.web.ts` | Hydration-safe color scheme for web SSR |
| `useTheme` | `client/src/hooks/use-theme.ts` | Crash-safe theme resolver defaulting safely to `'light'` |
| `useFileExplorer` | `client/src/hooks/useFileExplorer.ts` | Comprehensive state manager for file explorer navigation, breadcrumbs, search, and CRUD |

### Client — Services & Utilities

| File | Path | Exports | Purpose |
|------|------|---------|---------|
| `api.ts` | `client/src/services/api.ts` | `getApiBaseUrl`, `getAuthToken`, `apiRequest`, `uploadFileWithProgress` | HTTP fetch and XHR client with Firebase ID token injection and progress tracking |
| `folder.service.ts` | `client/src/services/folder.service.ts` | `folderService` | Client API methods for folder operations (getFolders, getAllFolders, createFolder, renameFolder, deleteFolder) |
| `file.service.ts` | `client/src/services/file.service.ts` | `fileService` | Client API methods for file operations (getFiles, getFileById, uploadFile, downloadFile, renameFile, moveFile, deleteFile) |
| `explorer.ts` | `client/src/types/explorer.ts` | `FolderItem`, `FileItem`, `BreadcrumbItem`, `ViewMode`, `SortField`, `UploadProgress` | Core TypeScript interfaces and domain models for file explorer |
| `fileFormatters.ts` | `client/src/utils/fileFormatters.ts` | `formatFileSize`, `formatDate`, `getFileTypeInfo` | Human-readable byte formatting, date formatting, and MIME category color/icon mapping |

### Client — Config & Constants

| File | Path | Exports | Purpose |
|------|------|---------|---------|
| Firebase config | `client/src/config/firebase.ts` | `app`, `auth` (default) | Firebase client init with `AsyncStorage` persistence & singleton pattern |
| Type augmentations | `client/src/types/firebase-auth.d.ts` | — | Declares `getReactNativePersistence` for TypeScript |
| Theme constants | `client/src/constants/theme.ts` | `Colors`, `ThemeColor`, `Fonts`, `Spacing`, `BottomTabInset`, `MaxContentWidth` | Design tokens: colors, fonts, spacing |
| Global CSS | `client/src/global.css` | — | CSS font family variables |

### Server — Entry & App

| File | Path | Exports | Purpose |
|------|------|---------|---------|
| Entry point | `server/server.js` | — | Starts Express on `env.port` |
| App setup | `server/src/app.js` | `app` (default) | Firebase boot init, CORS middleware, routes, error handler |

### Server — Routes

| File | Path | Endpoints |
|------|------|-----------|
| Auth routes | `server/src/routes/auth.routes.js` | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth` (and `/auth` aliases) |
| User routes | `server/src/routes/user.routes.js` | `GET /api/users/`, `POST /api/users/`, `GET /api/users/:id`, `PATCH /api/users/:id`, `DELETE /api/users/:id` (all protected by `authMiddleware`) |
| Health routes | `server/src/routes/health.routes.js` | `GET /api/health/` |
| Test routes | `server/src/routes/test.routes.js` | `POST /api/test/users` |
| Folder routes | `server/src/routes/folder.routes.js` | Protected folder endpoints (`/`, `/:id`); full CRUD operations |
| File routes | `server/src/routes/file.routes.js` | Protected file endpoints (`/upload`, `/`, `/:id`, `/:id/download`, `/:id/move`); full file operations |

### Server — Controllers

| Function | Path | Purpose |
|----------|------|---------|
| `registerController` | `server/src/controllers/auth.controller.js` | Verifies Firebase ID token, extracts UID/email, creates PostgreSQL user record (409 on duplicate, 400 on missing name) |
| `loginController` | `server/src/controllers/auth.controller.js` | Authenticates verified UID from Firebase token, fetches PostgreSQL user |
| `getUsersController` | `server/src/controllers/user.controller.js` | Lists records owned by authenticated user (`req.user.uid`) |
| `createUserController` | `server/src/controllers/user.controller.js` | Creates user bound to `req.user.uid` |
| `getUserByIdController` | `server/src/controllers/user.controller.js` | Gets user by ID with ownership check (403 for other users) |
| `updateUserController` | `server/src/controllers/user.controller.js` | Updates user by ID with ownership check (403 for other users) |
| `deleteUserController` | `server/src/controllers/user.controller.js` | Deletes user by ID with ownership check (403 for other users) |
| `getHealth` | `server/src/controllers/health.controller.js` | Health check response |
| `testApi` | `server/src/controllers/test.controller.js` | Echo `req.body` |
| `createFolderController` | `server/src/controllers/folder.controller.js` | Handles folder creation with `req.user.uid` |
| `getFoldersController` | `server/src/controllers/folder.controller.js` | Lists folders owned by user, with optional `parent_folder_id` filter |
| `getFolderByIdController` | `server/src/controllers/folder.controller.js` | Gets folder by ID with strict ownership, subfolders, and files |
| `renameFolderController` | `server/src/controllers/folder.controller.js` | Renames folder with name collision checks and updated_at update |
| `deleteFolderController` | `server/src/controllers/folder.controller.js` | Deletes empty folder, rejecting non-empty deletion |
| `uploadFileController` | `server/src/controllers/file.controller.js` | Handles multipart upload with validation and storage |
| `getFilesController` | `server/src/controllers/file.controller.js` | Lists files owned by user, with optional folder_id filter |
| `getFileByIdController` | `server/src/controllers/file.controller.js` | Retrieves file metadata by ID with strict ownership validation |
| `downloadFileController` | `server/src/controllers/file.controller.js` | Streams file download with authentication and Content-Disposition |
| `renameFileController` | `server/src/controllers/file.controller.js` | Renames file with duplicate collision check |
| `moveFileController` | `server/src/controllers/file.controller.js` | Moves file between folders with target folder ownership check |
| `deleteFileController` | `server/src/controllers/file.controller.js` | Deletes file from database and local storage |

### Server — Middleware

| Function | Path | Purpose |
|----------|------|---------|
| `authMiddleware` | `server/src/middleware/auth.middleware.js` | Verifies Firebase ID token from `Authorization: Bearer <token>` or `body.idToken`, sets `req.user` |
| `errorHandler` | `server/src/middleware/errorHandler.js` | Central JSON error response (`{ success: false, message }`) |
| `logger` | `server/src/middleware/logger.js` | Logs `[METHOD] /path` to console |

### Server — Services

| Function | Path | Purpose |
|----------|------|---------|
| `getUserByEmail` | `server/src/services/user.service.js` | Fetches user by `email`, excludes `password_hash` |
| `getUserByFirebaseUid` | `server/src/services/user.service.js` | Fetches user by `firebase_uid`, excludes `password_hash` |
| `createUser` | `server/src/services/user.service.js` | `INSERT INTO users (name, email, firebase_uid)` (no passwords stored in PostgreSQL) |
| `getUsers` | `server/src/services/user.service.js` | Queries `users` by `firebase_uid`, excludes `password_hash` |
| `getUserById` | `server/src/services/user.service.js` | `SELECT` by ID or `firebase_uid`, excludes `password_hash` |
| `updateUser` | `server/src/services/user.service.js` | `UPDATE users`, excludes `password_hash` |
| `deleteUser` | `server/src/services/user.service.js` | `DELETE FROM users`, excludes `password_hash` |
| `getHealthStatus` | `server/src/services/health.service.js` | Returns static `{ service, status }` |
| `createFolder` | `server/src/services/folder.service.js` | Inserts folder into `folders` with parameterized query, checks parent ownership and duplicates |
| `getFolders` | `server/src/services/folder.service.js` | Queries folders by `owner_firebase_uid`, supports `parent_folder_id` filtering |
| `getFolderById` | `server/src/services/folder.service.js` | Fetches folder by ID, enforces `owner_firebase_uid === req.user.uid`, returns subfolders & files |
| `renameFolder` | `server/src/services/folder.service.js` | Updates folder name and `updated_at`, prevents duplicate collisions in same parent |
| `deleteFolder` | `server/src/services/folder.service.js` | Deletes folder, validates empty state (rejects if subfolders or files exist) |
| `validateFolderName` | `server/src/services/folder.service.js` | Validates non-empty string, length 1-255, rejects path separators/control chars |
| `validateFolderId` | `server/src/services/folder.service.js` | Validates positive numeric ID format |
| `uploadFile` | `server/src/services/file.service.js` | Validates content, writes to storage, creates DB record |
| `getFiles` | `server/src/services/file.service.js` | Queries files by owner_firebase_uid and optional folder_id |
| `getFileById` | `server/src/services/file.service.js` | Fetches file metadata, enforcing owner_firebase_uid |
| `getFileForDownload` | `server/src/services/file.service.js` | Fetches file record and readable stream for download |
| `renameFile` | `server/src/services/file.service.js` | Updates file name with duplicate collision validation |
| `moveFile` | `server/src/services/file.service.js` | Updates file folder_id with target folder validation |
| `deleteFile` | `server/src/services/file.service.js` | Removes file record and deletes from storage |
| `getOrCreatePostgresUserId` | `server/src/services/file.service.js` | Resolves or creates PostgreSQL user for owner_id FK |
| `storageService` | `server/src/services/storage.service.js` | Storage abstraction layer for local disk (saveFile, getFileStream, deleteFile, fileExists) |
| `resolvePermission` | `server/src/services/share.service.js` | Resolves permission ('owner', 'editor', 'viewer', null) with nearest ancestor folder inheritance and direct file precedence |
| `shareWithUser` | `server/src/services/share.service.js` | Shares file/folder with registered user via verified email, blocking self-sharing & duplicates |
| `createShareLink` | `server/src/services/share.service.js` | Generates 32-byte secure random tokens, stores SHA-256 hash, enforces viewer-only anonymous access |
| `revokeUserShare` | `server/src/services/share.service.js` | Owner-verified deletion of direct user share records |
| `revokeShareLink` | `server/src/services/share.service.js` | Creator-verified soft revocation of share links (`is_active = false`) |
| `getSharedWithMe` | `server/src/services/share.service.js` | Returns safe metadata of files and folders directly shared with user |
| `getSharedByMe` | `server/src/services/share.service.js` | Returns safe metadata of active shares and links created by user |
| `resolveShareLink` | `server/src/services/share.service.js` | Verifies and resolves public/authenticated share link tokens against SHA-256 hashes |

### Server — Utilities & Config

| File | Path | Exports | Purpose |
|------|------|---------|---------|
| `fileValidator` | `server/src/utils/fileValidator.js` | `validateFileName`, `validateFileId`, `detectMagicBytes`, `validateFileContent` | Validates filename safety, numeric IDs, file size, and magic byte signatures |
| `AppError` | `server/src/utils/AppError.js` | `AppError` (default class) | Custom error with `statusCode`/`statuscode` and `isOperational` |
| DB pool | `server/src/config/db.js` | `pool` (default) | PostgreSQL `Pool` from env vars |
| Env config | `server/src/config/env.js` | `env` (default) | `{ port, nodeEnv }` with defaults |
| Firebase Admin | `server/src/config/firebase.js` | `firebaseApp` (default) | Firebase Admin init with null-safe private key parsing |

---

## 5. Duplicate Code

| # | Duplication | Locations | Recommendation |
|---|-------------|-----------|----------------|
| 1 | **Redundant `dotenv.config()`** — called in config files | `config/db.js`, `config/env.js`, `config/firebase.js` | Call once in entry point |
| 2 | **Flawed Express Router import** — `import Router from "express"` | `health.routes.js`, `test.routes.js` | Use `express.Router()` consistently |
| 3 | **Animated icon native/web** — mirrored keyframe logic | `animated-icon.tsx`, `animated-icon.web.tsx` | Expected for platform files, but `AnimatedIcon` itself is unused/dead code |

---

## 6. Known Issues

### 🟡 High

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 1 | **Express Router import bug** | `health.routes.js`, `test.routes.js` | `import Router from "express"` creates Express app instance instead of Router |
| 2 | **`test_db.js` typo** | `server/test_db.js:1` | `import irebaseApp` missing 'f'; file tests Firebase not DB despite name |
| 3 | **`.env` not in client `.gitignore`** | `client/.gitignore` | Only `.env*.local` ignored — `client/.env` with Firebase keys could be committed |

### 🟠 Medium

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 4 | **No database schema / migrations** | Server | `users` table structure only implied by SQL queries — no version-controlled schema |
| 5 | **`env.js` typo** | `server/src/config/env.js:7` | Default `"devlopment"` instead of `"development"` |
| 6 | **Branding remnants** | `app-tabs.web.tsx`, `app.json` | Shows "Expo Starter" and app slug/name is "client" |

### 🔵 Low

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 7 | **Dead code** | `hint-row.tsx`, `AnimatedIcon` in `animated-icon.tsx` | Unused components |
| 8 | **`ThemedView` dead props** | `themed-view.tsx` | `lightColor`/`darkColor` destructured but never used |
| 9 | **Health service double semicolon** | `health.service.js:5` | `};;` syntax quirk |
| 10 | **Explore screen is boilerplate** | `client/src/app/explore.tsx` | Expo template content, not ShareSync-specific |
| 11 | **Collapsible chevron rotation inverted** | `client/src/components/ui/collapsible.tsx:26` | 90deg when closed (pointing down), -90deg when open (pointing up) |
| 12 | **`DB_PORT` passed as string** | `server/src/config/db.js:14` | Not parsed as integer |
| 13 | **No `pool.on('error')` handler** | `server/src/config/db.js` | Idle client disconnect crashes server |

---

## 7. Last Updated

| Date | Changes |
|------|---------|
| 2026-11-20 | **Sharing complete (Feature 30):** sharing API + permission enforcement, share links (expiry, password, sign-in), folder-link containment, encryption at rest (`FILE_ENCRYPTION_KEY`), Share dialog, Shared tab, public link page, `sharesync://` deep links. Migration `migrate_feature30_sharing_api.mjs`; tests `test_sharing_api.mjs` (132 passed). All suites: 468 passed, 0 failed. Also: security hardening (helmet, rate limits, CORS allowlist, email-change lock, verified-email linking) and mobile upload/download. |
| 2026-11-19 | **File & Folder Sharing — Phases 1 & 2 (Feature 29):**<br>1. **Phase 1 Database Migration & Verification:** Created and verified transactional migration script `server/migrate_feature29_shares.mjs` creating `file_shares`, `folder_shares`, and `share_links` tables. Established foreign keys (`ON DELETE CASCADE` from `files`/`folders`), unique constraints (`uq_file_share`, `uq_folder_share`, `uq_share_links_token_hash`), check constraints (`chk_file_no_self_share`, `chk_folder_no_self_share`, `chk_file_shares_permission`, `chk_folder_shares_permission`, `chk_share_links_resource`, `chk_anonymous_viewer_only`, `chk_share_links_permission`), and lookup/partial indexes. Preserved all legacy records intact (`resume.pdf`, id=11; 3 users, 2 folders, 1 file) with full backup and verified idempotency on second run.<br>2. **Phase 2 Modular Sharing Services:** Implemented `server/src/services/share.service.js` with comprehensive access control:<br>&nbsp;&nbsp;• `resolvePermission(userUid, resourceType, resourceId)`: Enforces owner full access, direct file share precedence over inherited folder permissions, recursive CTE nearest explicitly shared ancestor folder inheritance, and returns null (deny) when no permission matches.<br>&nbsp;&nbsp;• `shareWithUser()`: Verifies resource ownership, resolves recipient email against registered users with valid Firebase UID, blocks self-sharing (400) and duplicate shares (409).<br>&nbsp;&nbsp;• `createShareLink()`: Generates 32-byte cryptographically secure random tokens, stores only SHA-256 hashes, enforces viewer-only anonymous access (400 for anonymous editor), and handles expiration timestamps.<br>&nbsp;&nbsp;• `revokeUserShare()` & `revokeShareLink()`: Owner-verified direct share deletion and soft revocation (`is_active = false`).<br>&nbsp;&nbsp;• `getSharedWithMe()` & `getSharedByMe()`: Clean parameterized queries returning safe metadata without internal storage paths or token hashes.<br>&nbsp;&nbsp;• `resolveShareLink()`: Verifies token hash, active status, expiration, and authentication requirement before returning safe resource metadata.<br>3. **Automated Testing:** Created unit & integration test suite `server/test_sharing_services.mjs` verifying 47 assertions across all sharing requirements (47/47 passed, 0 failures). Re-verified all existing test suites (File CRUD: 85, Folder CRUD: 58, Frontend Integration: 40, User CRUD: 43, Auth Login: 32, Auth Register: 31). Total passing test assertions across all suites: 336 passed, 0 failures. |
| 2026-11-19 | **File Explorer Frontend (Feature 28):**<br>1. Built complete, responsive cloud-storage File Explorer UI in `client/src/app/explore.tsx` with light/dark theme tokens, replacing stock Expo boilerplate.<br>2. Implemented nested folder navigation with interactive, scrollable breadcrumb trail (`client/src/components/explorer/BreadcrumbNav.tsx`).<br>3. Implemented centralized API service layer with automatic Firebase Bearer token injection (`api.ts`, `folder.service.ts`, `file.service.ts`) connecting seamlessly to backend endpoints (`/api/folders` and `/api/files`). Configured `EXPO_PUBLIC_API_URL` with mobile, web, and emulator support.<br>4. Built genuine multipart/form-data upload progress reporting via `XMLHttpRequest` upload events in `api.ts` and `UploadModal.tsx`, enforcing client-side 50MB limits.<br>5. Built responsive folder and file cards (`FolderCard.tsx`, `FileCard.tsx`) supporting both Grid view and List view with color-coded MIME category badges and human-readable size and date formatters (`fileFormatters.ts`).<br>6. Implemented all file and folder CRUD modals: `CreateFolderModal`, `UploadModal`, `RenameModal`, `MoveModal` (with folder tree selection), and `DeleteConfirmModal` (with safe cascade restriction guidance).<br>7. Added real-time in-memory search filtering, multi-field sorting (Name, Size, Date), view mode toggles, and empty/loading/error states.<br>8. Added "Open File Explorer" shortcut on Home screen (`client/src/app/index.tsx`) and updated tab branding to "ShareSync" and "Files".<br>9. Verified entire application passes TypeScript checks (`npx tsc --noEmit` with 0 errors). Created comprehensive automated frontend-to-backend integration test suite (`server/test_frontend_integration.mjs`) verifying 40 assertions (40/40 passed, 0 failures). Total passing assertions across all suites: 314 passed, 0 failures. |
| 2026-11-18 | **File Management API:**<br>1. Enhanced PostgreSQL `files` schema: added `owner_firebase_uid VARCHAR(128)`, `updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`, `idx_files_owner_firebase_uid`, and partial unique indexes `idx_files_unique_name_in_folder` (on `owner_firebase_uid, folder_id, LOWER(name)`) and `idx_files_unique_root_name` (on `owner_firebase_uid, LOWER(name)`) with predicate `WHERE owner_firebase_uid IS NOT NULL` to safely preserve legacy records without conflicts.<br>2. Preserved all legacy records intact, specifically `resume.pdf` (id=11) with `owner_id=1` and `folder_id=4`; maintained `owner_id NOT NULL` foreign key referencing `users(id)`.<br>3. Implemented decoupled storage layer `server/src/services/storage.service.js` with per-user directory isolation (`uploads/<ownerUid>/`), UUID filename generation via Node.js native `crypto.randomUUID()`, path traversal protection, and clean abstraction for future cloud storage integration (S3/GCS). Added `uploads/` to `.gitignore`.<br>4. Implemented file validation utility `server/src/utils/fileValidator.js`: enforces configurable 50MB file size limit (`MAX_FILE_SIZE`), sanitizes filenames against path traversal/control characters, and inspects magic byte signatures (PDF, PNG, JPEG, GIF, WEBP, ZIP/OpenXML, plain text) while explicitly detecting and rejecting disguised executables (PE, ELF, Mach-O).<br>5. Implemented `server/src/services/file.service.js` with `uploadFile`, `getFiles`, `getFileById`, `getFileForDownload`, `renameFile`, `moveFile`, `deleteFile`, and `getOrCreatePostgresUserId`.<br>6. Implemented `server/src/controllers/file.controller.js` for all 7 file endpoints with safe streaming download headers (RFC 5987 Content-Disposition) and zero exposure of internal storage paths.<br>7. Configured `server/src/routes/file.routes.js` with Multer memory storage and `authMiddleware`; mounted at `/api/files` and `/files` in `server/src/app.js`.<br>8. Built comprehensive test suite `server/test_file_crud.mjs` verifying 85 assertions across authentication, validation, upload, listing, retrieval, download streaming, renaming, moving, safe deletion, route aliases, and legacy record preservation (85/85 passed, 0 failures). Total passing test assertions across all suites: 249 passed, 0 failures. |
| 2026-11-17 | **Folder Management API:**<br>1. Migrated PostgreSQL `folders` schema: added `owner_firebase_uid VARCHAR(128)`, `parent_folder_id BIGINT REFERENCES folders(id) ON DELETE RESTRICT`, `updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`, dropped NOT NULL on legacy `owner_id`, added indexing on `owner_firebase_uid`, `parent_folder_id`, and partial unique indexes for root and child folder names.<br>2. Implemented `server/src/services/folder.service.js` with `createFolder`, `getFolders`, `getFolderById`, `renameFolder`, `deleteFolder`, `validateFolderName`, and `validateFolderId`. Uses parameterized queries and throws `AppError`.<br>3. Implemented `server/src/controllers/folder.controller.js` for all CRUD operations, binding caller to `req.user.uid`.<br>4. Implemented `server/src/routes/folder.routes.js` with `authMiddleware` protecting every endpoint.<br>5. Mounted `/api/folders` and `/folders` in `server/src/app.js`.<br>6. Implemented strict ownership checks (403 for non-owners, 404 for non-existent folders), nested parent ownership verification, duplicate folder name collision checks (409), and rejection of unsafe deletions for folders containing subfolders or files (400).<br>7. Created comprehensive automated test suite `server/test_folder_crud.mjs` verifying 58 assertions across authentication, validation, creation, nesting, listing, retrieval, renaming, safe/unsafe deletion, and route aliases (58/58 passed, 0 failures). Total passing test assertions across all suites: 189 passed, 0 failures. |
| 2026-11-16 | **User Registration & Backend Synchronization (Feature 18):**<br>1. Built `client/src/app/signup.tsx` with name, email, password fields, display name update, backend synchronization, and rollback on failure.<br>2. Implemented `register` in `client/src/context/AuthContext.tsx` using `createUserWithEmailAndPassword()` and `updateProfile()`.<br>3. Implemented `POST /api/auth/register` and `/auth/register` in `server/src/controllers/auth.controller.js` and `server/src/routes/auth.routes.js`.<br>4. Extracted UID and email strictly from verified Firebase ID token via `authMiddleware`; prevented duplicate registration via UID and email checks (409 Conflict); added name validation (400 Bad Request).<br>5. Audited and eliminated unsafe password storage: altered PostgreSQL `users.password_hash` to NULL, removed password insertion from `createUser` in `user.service.js` and `user.controller.js`.<br>6. Added links between Login and Signup screens.<br>7. Updated `NavigationGuard` in `_layout.tsx` to handle `/signup` without tab bar.<br>8. Added comprehensive automated test suite `server/test_auth_register.mjs` (31 assertions passed, 0 failures). Total passing test assertions across all suites: 131 passed, 0 failures. |
