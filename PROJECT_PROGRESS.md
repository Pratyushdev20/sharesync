# ShareSync — Project Progress Tracker

> **Purpose:** Living development tracker. Check before every task; update after every task.  
> **Stack:** React Native (Expo SDK 57) + TypeScript | Node.js (Express 5) + PostgreSQL + Firebase

---

## 1. Completed Features

| # | Feature | Client | Server | Notes |
|---|---------|--------|--------|-------|
| 1 | Firebase email/password login | ✅ `app/index.tsx` | — | `signInWithEmailAndPassword`; displays Firebase ID token for Postman testing |
| 2 | User CRUD API | — | ✅ `/users` routes | `GET`, `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id` — full CRUD |
| 3 | Health check endpoint | — | ✅ `GET /api/health` | Static response via `health.service.js` |
| 4 | Test echo endpoint | — | ✅ `POST /api/test/users` | Returns `req.body` back |
| 5 | Auth token verification route | — | ✅ `GET /auth` | Uses `authMiddleware` to verify Firebase Bearer token |
| 6 | Firebase Admin SDK config | — | ✅ `config/firebase.js` | Reads credentials from env vars (⚠️ never imported on boot) |
| 7 | PostgreSQL connection pool | — | ✅ `config/db.js` | Reads DB config from env vars |
| 8 | Environment config module | — | ✅ `config/env.js` | Exposes `port` and `nodeEnv` |
| 9 | Request logger middleware | — | ✅ `middleware/logger.js` | Logs `[METHOD] /path` to console |
| 10 | Error handler middleware | — | ✅ `middleware/errorHandler.js` | Central JSON error responses (has typos) |
| 11 | Custom AppError class | — | ✅ `utils/AppError.js` | `extends Error` with `statuscode` and `isoperational` |
| 12 | User service layer | — | ✅ `services/user.service.js` | Data-access for `users` table (getUsers, createUser, getUserById, updateUser, deleteUser) |
| 13 | Firebase client SDK init | ✅ `config/firebase.js` | — | Uses `EXPO_PUBLIC_FIREBASE_*` env vars; exports `auth` |
| 14 | Theme system (light/dark) | ✅ `constants/theme.ts` | — | `Colors`, `Fonts`, `Spacing`, `BottomTabInset`, `MaxContentWidth` |
| 15 | Color scheme hooks | ✅ hooks | — | `useColorScheme` (native + web hydration-safe), `useTheme` |
| 16 | Themed UI primitives | ✅ components | — | `ThemedText` (8 variants), `ThemedView`, `Collapsible`, `ExternalLink` |
| 17 | Tab navigation | ✅ `app/_layout.tsx` | — | Native tabs (`AppTabs`) + web tabs (`AppTabs.web`) via Expo Router |
| 18 | Animated splash overlay | ✅ `animated-icon.tsx` | — | Reanimated keyframe animations + splash screen hide |
| 19 | Explore screen | ✅ `app/explore.tsx` | — | Expo boilerplate docs/tutorial content |

---

## 2. Pending Features

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 1 | **File / content sharing (core feature)** | 🔴 High | App's core purpose — no implementation exists |
| 2 | **Real-time sync** | 🔴 High | No WebSocket or real-time infrastructure |
| 3 | **Auth state persistence (native)** | 🔴 High | `getAuth()` has no `AsyncStorage` persistence — sessions lost on app restart |
| 4 | **Auth guard / protected routes** | 🔴 High | No `onAuthStateChanged` listener; no route guard for main tabs |
| 5 | **User registration (client)** | 🔴 High | Only login exists; no sign-up screen |
| 6 | **Google sign-in** | 🟡 Medium | Not started |
| 7 | **Profile screen** | 🟡 Medium | No profile view/edit screen in client |
| 8 | **Folder management** | 🟡 Medium | `folder.controller.js`, `folder.routes.js`, `folder.service.js` are all 0-byte stubs |
| 9 | **CORS middleware** | 🟡 Medium | Missing — client cannot reach server cross-origin |
| 10 | **Database migrations / schema** | 🟡 Medium | `users` table schema exists only implicitly in SQL queries |
| 11 | **Input validation (server)** | 🟡 Medium | No Joi/Zod; manual checks only |
| 12 | **Password hashing** | 🔴 High | `createUser` stores raw `password_hash` — no bcrypt/argon2 |
| 13 | **Auth on user CRUD routes** | 🔴 High | All `/users` endpoints are completely unprotected |
| 14 | **Initialize Firebase on server boot** | 🔴 High | `firebase.js` is never imported by `server.js` or `app.js` |
| 15 | **Home screen content** | 🟡 Medium | `index.tsx` is a Firebase login test, not a real home screen |
| 16 | **Push notifications** | 🔵 Low | Not started |
| 17 | **Rate limiting** | 🔵 Low | No rate limiting middleware |
| 18 | **Structured logging** | 🔵 Low | Only `console.log/error` |

---

## 3. In-Progress Features

| # | Feature | Status | Files | Blocker |
|---|---------|--------|-------|---------|
| 1 | Folder management | Scaffolded (empty stubs) | `folder.controller.js`, `folder.routes.js`, `folder.service.js` | All 3 files are 0 bytes; routes not mounted in `app.js` |

---

## 4. Code Registry

### Client — Screens & Layouts

| File | Path | Exports | Purpose |
|------|------|---------|---------|
| Root layout | `client/src/app/_layout.tsx` | `TabLayout` (default) | Splash screen, ThemeProvider, mounts `AppTabs` |
| Home / Login test | `client/src/app/index.tsx` | `HomeScreen` (default) | Firebase email/password login + ID token display |
| Explore | `client/src/app/explore.tsx` | `TabTwoScreen` (default) | Expo docs/tutorial boilerplate |

### Client — Reusable Components

| Component | Path | Exports | Purpose |
|-----------|------|---------|---------|
| `ThemedText` | `client/src/components/themed-text.tsx` | `ThemedText`, `ThemedTextProps` | Theme-aware text (default/title/small/smallBold/subtitle/link/linkPrimary/code) |
| `ThemedView` | `client/src/components/themed-view.tsx` | `ThemedView`, `ThemedViewProps` | Theme-aware view container |
| `Collapsible` | `client/src/components/ui/collapsible.tsx` | `Collapsible` | Expandable/collapsible section with animation |
| `ExternalLink` | `client/src/components/external-link.tsx` | `ExternalLink` | Opens URL in in-app browser (native) or new tab (web) |
| `AppTabs` | `client/src/components/app-tabs.tsx` | `AppTabs` (default) | Native bottom tab bar (Home, Explore) via `expo-router/unstable-native-tabs` |
| `AppTabs` (web) | `client/src/components/app-tabs.web.tsx` | `AppTabs` (default), `TabButton`, `CustomTabList` | Web tab bar with floating header |
| `AnimatedSplashOverlay` | `client/src/components/animated-icon.tsx` | `AnimatedSplashOverlay`, `AnimatedIcon` | Splash screen fade-out animation |
| `AnimatedSplashOverlay` (web) | `client/src/components/animated-icon.web.tsx` | `AnimatedSplashOverlay`, `AnimatedIcon` | Web version (returns null for overlay) |
| `HintRow` | `client/src/components/hint-row.tsx` | `HintRow` | Title + code snippet pill badge (⚠️ unused / dead code) |
| `WebBadge` | `client/src/components/web-badge.tsx` | `WebBadge` | Shows Expo SDK version badge on web |

### Client — Hooks

| Hook | Path | Purpose |
|------|------|---------|
| `useColorScheme` | `client/src/hooks/use-color-scheme.ts` | Re-export of RN `useColorScheme` (native) |
| `useColorScheme` (web) | `client/src/hooks/use-color-scheme.web.ts` | Hydration-safe color scheme for web SSR |
| `useTheme` | `client/src/hooks/use-theme.ts` | Returns active `Colors.light` or `Colors.dark` object |

### Client — Config & Constants

| File | Path | Exports | Purpose |
|------|------|---------|---------|
| Firebase config | `client/src/config/firebase.js` | `auth` | Firebase client init from `EXPO_PUBLIC_FIREBASE_*` env vars |
| Theme constants | `client/src/constants/theme.ts` | `Colors`, `ThemeColor`, `Fonts`, `Spacing`, `BottomTabInset`, `MaxContentWidth` | Design tokens: colors, fonts, spacing |
| Global CSS | `client/src/global.css` | — | CSS font family variables |

### Server — Entry & App

| File | Path | Exports | Purpose |
|------|------|---------|---------|
| Entry point | `server/server.js` | — | Starts Express on `env.port` |
| App setup | `server/src/app.js` | `app` (default) | Middleware pipeline, route mounting, error handler |

### Server — Routes

| File | Path | Endpoints |
|------|------|-----------|
| Auth routes | `server/src/routes/auth.routes.js` | `GET /auth/` (verifies Firebase token) |
| User routes | `server/src/routes/user.routes.js` | `GET /users/`, `POST /users/`, `GET /users/:id`, `PATCH /users/:id`, `DELETE /users/:id` |
| Health routes | `server/src/routes/health.routes.js` | `GET /api/health/` |
| Test routes | `server/src/routes/test.routes.js` | `POST /api/test/users` |
| Folder routes | `server/src/routes/folder.routes.js` | ⚠️ Empty file (0 bytes) |

### Server — Controllers

| Function | Path | Purpose |
|----------|------|---------|
| `getUsersController` | `server/src/controllers/user.controller.js` | List all users |
| `createUserController` | `server/src/controllers/user.controller.js` | Create user |
| `getUserByIdController` | `server/src/controllers/user.controller.js` | Get user by ID (with 404 check) |
| `updateUserController` | `server/src/controllers/user.controller.js` | Update user name/email (⚠️ no 404 check) |
| `deleteUserController` | `server/src/controllers/user.controller.js` | Delete user (with 404 check) |
| `getHealth` | `server/src/controllers/health.controller.js` | Health check response |
| `testApi` | `server/src/controllers/test.controller.js` | Echo `req.body` |
| `folder.controller.js` | `server/src/controllers/folder.controller.js` | ⚠️ Empty file (0 bytes) |

### Server — Middleware

| Function | Path | Purpose |
|----------|------|---------|
| `authMiddleware` | `server/src/middleware/auth.middleware.js` | Firebase `verifyIdToken` from Bearer header |
| `errorHandler` | `server/src/middleware/errorHandler.js` | Central JSON error response |
| `logger` | `server/src/middleware/logger.js` | Logs `[METHOD] /path` to console |

### Server — Services

| Function | Path | Purpose |
|----------|------|---------|
| `getUsers` | `server/src/services/user.service.js` | `SELECT * FROM users` |
| `createUser` | `server/src/services/user.service.js` | `INSERT INTO users (name, email, password_hash)` |
| `getUserById` | `server/src/services/user.service.js` | `SELECT * FROM users WHERE id = $1` |
| `updateUser` | `server/src/services/user.service.js` | Update name/email with branching if-else logic |
| `deleteUser` | `server/src/services/user.service.js` | `DELETE FROM users WHERE id = $1` |
| `getHealthStatus` | `server/src/services/health.service.js` | Returns static `{ service, status }` |
| `folder.service.js` | `server/src/services/folder.service.js` | ⚠️ Empty file (0 bytes) |

### Server — Utilities & Config

| File | Path | Exports | Purpose |
|------|------|---------|---------|
| `AppError` | `server/src/utils/AppError.js` | `AppError` (default class) | Custom error with `statuscode` and `isoperational` |
| DB pool | `server/src/config/db.js` | `pool` (default) | PostgreSQL `Pool` from env vars |
| Env config | `server/src/config/env.js` | `env` (default) | `{ port, nodeEnv }` with defaults |
| Firebase Admin | `server/src/config/firebase.js` | `firebaseApp` (default) | Firebase Admin init from env vars |

---

## 5. Duplicate Code

| # | Duplication | Locations | Recommendation |
|---|-------------|-----------|----------------|
| 1 | **Color scheme fallback** — `Colors[scheme === 'unspecified' ? 'light' : scheme]` repeated; crashes if `scheme` is `null` | `app-tabs.tsx`, `app-tabs.web.tsx`, `use-theme.ts` | Fix in `useTheme()` to safely default to `'light'`; use `useTheme()` everywhere |
| 2 | **Direct `useColorScheme` from react-native** — bypasses project's hydration-safe hook | `_layout.tsx`, `web-badge.tsx`, `app-tabs.tsx` | Always import from `@/hooks/use-color-scheme` |
| 3 | **Redundant `dotenv.config()`** — called in 3 separate config files | `config/db.js`, `config/env.js`, `config/firebase.js` | Call once in `server.js` entry point |
| 4 | **Flawed Express Router import** — `import Router from "express"` (gets `createApplication` not `Router`) | `auth.routes.js`, `health.routes.js`, `test.routes.js` | Use `import { Router } from "express"` or `express.Router()` |
| 5 | **`"sucess"` typo** — misspelled `success` key in JSON responses | `health.controller.js`, `auth.routes.js`, `errorHandler.js` | Fix spelling consistently |
| 6 | **Inconsistent error handling in controllers** — some use `next(error)`, others do manual `res.status(500)` | `getUsersController`, `createUserController` vs `getUserByIdController`, `updateUserController`, `deleteUserController` | Always delegate to `next(error)` + central `errorHandler` |
| 7 | **Animated icon native/web** — mirrored keyframe logic | `animated-icon.tsx`, `animated-icon.web.tsx` | Expected for platform files, but `AnimatedIcon` itself is unused/dead code |

---

## 6. Known Issues

### 🔴 Critical

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 1 | **Firebase Admin never initialized on boot** | `server/server.js`, `server/src/app.js` | `config/firebase.js` is never imported → `authMiddleware` crashes with "default Firebase app does not exist" |
| 2 | **`GET /error` route crashes server** | `server/src/app.js:17-19` | `new error(...)` (lowercase) and `next` is not a parameter — double `ReferenceError` |
| 3 | **All `/users` endpoints unprotected** | `server/src/routes/user.routes.js` | No `authMiddleware` on any CRUD route — anyone can list/create/modify/delete users |
| 4 | **Password hash exposed in all responses** | `server/src/services/user.service.js` | Every query uses `SELECT *` / `RETURNING *` — `password_hash` leaked in JSON |
| 5 | **No password hashing** | `server/src/services/user.service.js:14` | `password_hash` stored as raw input — no bcrypt/argon2 |
| 6 | **Color scheme crash** | `use-theme.ts`, `app-tabs.tsx`, `app-tabs.web.tsx` | `Colors[null]` → `undefined` → crash on property access when `useColorScheme()` returns `null` |
| 7 | **No auth session persistence on native** | `client/src/config/firebase.js` | Uses `getAuth(app)` without `AsyncStorage` persistence — session lost on app restart |

### 🟡 High

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 8 | **No CORS middleware** | `server/src/app.js` | Client requests blocked cross-origin |
| 9 | **Inconsistent route prefixes** | `server/src/app.js` | `/api/health`, `/api/test` vs `/users`, `/auth` — no consistent API namespace |
| 10 | **`updateUser` returns undefined on non-existent user** | `server/src/controllers/user.controller.js:38-49` | No 404 check — returns `200 OK` with `{ data: undefined }` |
| 11 | **Express Router import bug** | `auth.routes.js`, `health.routes.js`, `test.routes.js` | `import Router from "express"` imports `createApplication` — works incidentally but creates a full Express app instead of a lightweight Router |
| 12 | **`test_db.js` typo** | `server/test_db.js:1` | `import irebaseApp` missing 'f'; file tests Firebase not DB despite name |
| 13 | **`.env` not in client `.gitignore`** | `client/.gitignore` | Only `.env*.local` ignored — `client/.env` with Firebase keys could be committed |

### 🟠 Medium

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 14 | **No database schema / migrations** | Server | `users` table structure only implied by SQL queries — no version-controlled schema |
| 15 | **`env.js` typo** | `server/src/config/env.js:7` | Default `"devlopment"` instead of `"development"` |
| 16 | **`errorHandler.js` typos** | `server/src/middleware/errorHandler.js` | `"sucess"` and `"INternal server error"` |
| 17 | **`AppError` property casing** | `server/src/utils/AppError.js` | Uses `statuscode` / `isoperational` instead of `statusCode` / `isOperational` — must match `errorHandler.js` |
| 18 | **`firebase.js` unsafe property access** | `server/src/config/firebase.js:10` | `.replace()` on `FIREBASE_PRIVATE_KEY` crashes if env var undefined |
| 19 | **Clunky update logic** | `server/src/services/user.service.js:25-45` | Rigid if-else branches for name/email combos; can't update other fields |
| 20 | **Branding remnants** | `app-tabs.web.tsx`, `app.json` | Shows "Expo Starter" and app slug/name is "client" |
| 21 | **`firebase.js` is `.js` in TS project** | `client/src/config/firebase.js` | Excluded from TypeScript type-checking |

### 🔵 Low

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 22 | **Dead code** | `hint-row.tsx`, `AnimatedIcon` in `animated-icon.tsx` | Unused components |
| 23 | **`ThemedView` dead props** | `themed-view.tsx` | `lightColor`/`darkColor` destructured but never used |
| 24 | **Health service double semicolon** | `health.service.js:5` | `};;` syntax quirk |
| 25 | **`deleteUser` SQL casing** | `user.service.js:47` | `WHERE ID = $1` (uppercase) vs lowercase elsewhere |
| 26 | **Explore screen is boilerplate** | `client/src/app/explore.tsx` | Expo template content, not ShareSync-specific |
| 27 | **No test framework (server)** | Server | No Jest/Mocha; `test_db.js` is a manual script |
| 28 | **Collapsible chevron rotation inverted** | `client/src/components/ui/collapsible.tsx:26` | 90deg when closed (pointing down), -90deg when open (pointing up) |
| 29 | **`DB_PORT` passed as string** | `server/src/config/db.js:14` | Not parsed as integer |
| 30 | **No `pool.on('error')` handler** | `server/src/config/db.js` | Idle client disconnect crashes server |

---

## 7. Last Updated

| Date | Changes |
|------|---------|
| 2026-11-16 | **Initial tracker created.** Full codebase audit of client (Expo/React Native, 20 source files) and server (Express/PostgreSQL, 20 source files). Catalogued 19 completed features, 18 pending features, 1 in-progress feature (folder stubs), 7 duplicate code areas, and 30 known issues (7 critical, 6 high, 8 medium, 9 low). |
