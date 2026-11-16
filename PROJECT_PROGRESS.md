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

---

## 2. Pending Features

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 1 | **File / content sharing (core feature)** | 🔴 High | App's core purpose — no implementation exists |
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
| Home screen | `client/src/app/index.tsx` | `HomeScreen` (default) | Protected home screen: user info, UID, Postman token viewer, sign out |
| Explore | `client/src/app/explore.tsx` | `TabTwoScreen` (default) | Protected Explore screen |

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
| `HintRow` | `client/src/components/hint-row.tsx` | `HintRow` | Title + code snippet pill badge (⚠️ unused) |
| `WebBadge` | `client/src/components/web-badge.tsx` | `WebBadge` | Shows Expo SDK version badge on web |

### Client — Hooks

| Hook | Path | Purpose |
|------|------|---------|
| `useColorScheme` | `client/src/hooks/use-color-scheme.ts` | Re-export of RN `useColorScheme` (native) |
| `useColorScheme` (web) | `client/src/hooks/use-color-scheme.web.ts` | Hydration-safe color scheme for web SSR |
| `useTheme` | `client/src/hooks/use-theme.ts` | Crash-safe theme resolver defaulting safely to `'light'` |

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

### Server — Utilities & Config

| File | Path | Exports | Purpose |
|------|------|---------|---------|
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
| 2026-11-17 | **Folder Management API:**<br>1. Migrated PostgreSQL `folders` schema: added `owner_firebase_uid VARCHAR(128)`, `parent_folder_id BIGINT REFERENCES folders(id) ON DELETE RESTRICT`, `updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP`, dropped NOT NULL on legacy `owner_id`, added indexing on `owner_firebase_uid`, `parent_folder_id`, and partial unique indexes for root and child folder names.<br>2. Implemented `server/src/services/folder.service.js` with `createFolder`, `getFolders`, `getFolderById`, `renameFolder`, `deleteFolder`, `validateFolderName`, and `validateFolderId`. Uses parameterized queries and throws `AppError`.<br>3. Implemented `server/src/controllers/folder.controller.js` for all CRUD operations, binding caller to `req.user.uid`.<br>4. Implemented `server/src/routes/folder.routes.js` with `authMiddleware` protecting every endpoint.<br>5. Mounted `/api/folders` and `/folders` in `server/src/app.js`.<br>6. Implemented strict ownership checks (403 for non-owners, 404 for non-existent folders), nested parent ownership verification, duplicate folder name collision checks (409), and rejection of unsafe deletions for folders containing subfolders or files (400).<br>7. Created comprehensive automated test suite `server/test_folder_crud.mjs` verifying 58 assertions across authentication, validation, creation, nesting, listing, retrieval, renaming, safe/unsafe deletion, and route aliases (58/58 passed, 0 failures). Total passing test assertions across all suites: 189 passed, 0 failures. |
| 2026-11-16 | **User Registration & Backend Synchronization (Feature 18):**<br>1. Built `client/src/app/signup.tsx` with name, email, password fields, display name update, backend synchronization, and rollback on failure.<br>2. Implemented `register` in `client/src/context/AuthContext.tsx` using `createUserWithEmailAndPassword()` and `updateProfile()`.<br>3. Implemented `POST /api/auth/register` and `/auth/register` in `server/src/controllers/auth.controller.js` and `server/src/routes/auth.routes.js`.<br>4. Extracted UID and email strictly from verified Firebase ID token via `authMiddleware`; prevented duplicate registration via UID and email checks (409 Conflict); added name validation (400 Bad Request).<br>5. Audited and eliminated unsafe password storage: altered PostgreSQL `users.password_hash` to NULL, removed password insertion from `createUser` in `user.service.js` and `user.controller.js`.<br>6. Added links between Login and Signup screens.<br>7. Updated `NavigationGuard` in `_layout.tsx` to handle `/signup` without tab bar.<br>8. Added comprehensive automated test suite `server/test_auth_register.mjs` (31 assertions passed, 0 failures). Total passing test assertions across all suites: 131 passed, 0 failures. |
