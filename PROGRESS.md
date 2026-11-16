# ShareSync — Project Progress Tracker

> **Purpose:** Living development tracker. Check before every task; update after every task.  
> **Stack:** React Native (Expo SDK 57) + TypeScript | Node.js (Express 5) + PostgreSQL + Firebase

---

## 1. Completed Features

| # | Feature | Client | Server | Notes |
|---|---------|--------|--------|-------|
| 1 | Firebase email/password login | ✅ `app/index.tsx` | — | `signInWithEmailAndPassword`; obtains Firebase ID token |
| 2 | Verified Backend Login API | ✅ `app/index.tsx` | ✅ `POST /api/auth/login` | Accepts Firebase ID token via Bearer header or body, verifies with Firebase Admin SDK, extracts UID, fetches PostgreSQL user |
| 3 | Auth token verification route | — | ✅ `GET /auth`, `GET /api/auth` | Uses `authMiddleware` to verify Firebase Bearer token |
| 4 | User CRUD API | — | ✅ `/users` routes | `GET`, `POST`, `GET /:id`, `PATCH /:id`, `DELETE /:id` |
| 5 | Health check endpoint | — | ✅ `GET /api/health` | Static response via `health.service.js` |
| 6 | Test echo endpoint | — | ✅ `POST /api/test/users` | Returns `req.body` back |
| 7 | Firebase Admin SDK initialization on boot | — | ✅ `src/app.js`, `config/firebase.js` | Initialized at application startup; null-safe private key parsing |
| 8 | CORS middleware | — | ✅ `src/app.js` | Cross-origin headers enabled for web and mobile clients |
| 9 | PostgreSQL connection pool | — | ✅ `config/db.js` | Reads DB config from env vars |
| 10 | Environment config module | — | ✅ `config/env.js` | Exposes `port` and `nodeEnv` |
| 11 | Request logger middleware | — | ✅ `middleware/logger.js` | Logs `[METHOD] /path` to console |
| 12 | Standardized error handler | — | ✅ `middleware/errorHandler.js` | Central JSON error responses with `success: false` and HTTP status |
| 13 | Custom AppError class | — | ✅ `utils/AppError.js` | `extends Error` with `statusCode`/`statuscode` and `isOperational` |
| 14 | User service layer | — | ✅ `services/user.service.js` | Data-access for `users` table including `getUserByFirebaseUid` |
| 15 | Firebase client SDK init | ✅ `config/firebase.js` | — | Uses `EXPO_PUBLIC_FIREBASE_*` env vars; exports `auth` |
| 16 | Theme system (light/dark) | ✅ `constants/theme.ts` | — | `Colors`, `Fonts`, `Spacing`, `BottomTabInset`, `MaxContentWidth` |
| 17 | Color scheme hooks | ✅ hooks | — | `useColorScheme` (native + web hydration-safe), `useTheme` |
| 18 | Themed UI primitives | ✅ components | — | `ThemedText` (8 variants), `ThemedView`, `Collapsible`, `ExternalLink` |
| 19 | Tab navigation | ✅ `app/_layout.tsx` | — | Native tabs (`AppTabs`) + web tabs (`AppTabs.web`) via Expo Router |
| 20 | Animated splash overlay | ✅ `animated-icon.tsx` | — | Reanimated keyframe animations + splash screen hide |
| 21 | Explore screen | ✅ `app/explore.tsx` | — | Expo boilerplate docs/tutorial content |

---

## 2. Pending Features

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 1 | **File / content sharing (core feature)** | 🔴 High | App's core purpose — no implementation exists |
| 2 | **Real-time sync** | 🔴 High | No WebSocket or real-time infrastructure |
| 3 | **Auth state persistence (native)** | 🔴 High | `getAuth()` has no `AsyncStorage` persistence — sessions lost on app restart |
| 4 | **Auth guard / protected routes** | 🔴 High | No `onAuthStateChanged` listener; no route guard for main tabs |
| 5 | **User registration (client & backend sync)**| 🔴 High | Need sign-up screen and backend user provisioning |
| 6 | **Password hashing** | 🔴 High | `createUser` stores raw `password_hash` — needs bcrypt/argon2 |
| 7 | **Auth on user CRUD routes** | 🔴 High | `/users` endpoints are public — needs `authMiddleware` guard |
| 8 | **Google sign-in** | 🟡 Medium | Not started |
| 9 | **Profile screen** | 🟡 Medium | No profile view/edit screen in client |
| 10 | **Folder management** | 🟡 Medium | `folder.controller.js`, `folder.routes.js`, `folder.service.js` are 0-byte stubs |
| 11 | **Database migrations / schema tool** | 🟡 Medium | Table structures need migration files (e.g. Knex/Prisma/SQL migrations) |
| 12 | **Input validation (server)** | 🟡 Medium | No Joi/Zod; manual checks only |
| 13 | **Home screen content** | 🟡 Medium | Needs actual home dashboard rather than login test screen |
| 14 | **Push notifications** | 🔵 Low | Not started |
| 15 | **Rate limiting** | 🔵 Low | No rate limiting middleware |
| 16 | **Structured logging** | 🔵 Low | Only `console.log/error` |

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
| Home / Login screen | `client/src/app/index.tsx` | `HomeScreen` (default) | Firebase login + Backend `POST /api/auth/login` integration + ID token display |
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
| `HintRow` | `client/src/components/hint-row.tsx` | `HintRow` | Title + code snippet pill badge (⚠️ unused) |
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
| App setup | `server/src/app.js` | `app` (default) | Firebase boot init, CORS middleware, routes, error handler |

### Server — Routes

| File | Path | Endpoints |
|------|------|-----------|
| Auth routes | `server/src/routes/auth.routes.js` | `POST /api/auth/login`, `GET /api/auth` (and `/auth` aliases) |
| User routes | `server/src/routes/user.routes.js` | `GET /users/`, `POST /users/`, `GET /users/:id`, `PATCH /users/:id`, `DELETE /users/:id` |
| Health routes | `server/src/routes/health.routes.js` | `GET /api/health/` |
| Test routes | `server/src/routes/test.routes.js` | `POST /api/test/users` |
| Folder routes | `server/src/routes/folder.routes.js` | ⚠️ Empty file (0 bytes) |

### Server — Controllers

| Function | Path | Purpose |
|----------|------|---------|
| `loginController` | `server/src/controllers/auth.controller.js` | Authenticates verified UID from Firebase token, fetches PostgreSQL user |
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
| `authMiddleware` | `server/src/middleware/auth.middleware.js` | Verifies Firebase ID token from `Authorization: Bearer <token>` or `body.idToken`, sets `req.user` |
| `errorHandler` | `server/src/middleware/errorHandler.js` | Central JSON error response (`{ success: false, message }`) |
| `logger` | `server/src/middleware/logger.js` | Logs `[METHOD] /path` to console |

### Server — Services

| Function | Path | Purpose |
|----------|------|---------|
| `getUserByFirebaseUid` | `server/src/services/user.service.js` | Fetches user from `users` table by `firebase_uid` (excludes `password_hash`) |
| `getUsers` | `server/src/services/user.service.js` | `SELECT * FROM users` |
| `createUser` | `server/src/services/user.service.js` | `INSERT INTO users (name, email, password_hash)` |
| `getUserById` | `server/src/services/user.service.js` | `SELECT * FROM users WHERE id = $1` |
| `updateUser` | `server/src/services/user.service.js` | Update name/email |
| `deleteUser` | `server/src/services/user.service.js` | `DELETE FROM users WHERE id = $1` |
| `getHealthStatus` | `server/src/services/health.service.js` | Returns static `{ service, status }` |
| `folder.service.js` | `server/src/services/folder.service.js` | ⚠️ Empty file (0 bytes) |

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
| 1 | **Color scheme fallback** — `Colors[scheme === 'unspecified' ? 'light' : scheme]` repeated; crashes if `scheme` is `null` | `app-tabs.tsx`, `app-tabs.web.tsx`, `use-theme.ts` | Fix in `useTheme()` to safely default to `'light'`; use `useTheme()` everywhere |
| 2 | **Direct `useColorScheme` from react-native** — bypasses project's hydration-safe hook | `_layout.tsx`, `web-badge.tsx`, `app-tabs.tsx` | Always import from `@/hooks/use-color-scheme` |
| 3 | **Redundant `dotenv.config()`** — called in config files | `config/db.js`, `config/env.js`, `config/firebase.js` | Call once in entry point |
| 4 | **Flawed Express Router import** — `import Router from "express"` | `health.routes.js`, `test.routes.js` (fixed in `auth.routes.js`) | Use `express.Router()` consistently |
| 5 | **Inconsistent error handling in controllers** — some use `next(error)`, others do manual `res.status(500)` | `getUsersController`, `createUserController` vs `getUserByIdController`, `updateUserController`, `deleteUserController` | Always delegate to `next(error)` + central `errorHandler` |
| 6 | **Animated icon native/web** — mirrored keyframe logic | `animated-icon.tsx`, `animated-icon.web.tsx` | Expected for platform files, but `AnimatedIcon` itself is unused/dead code |

---

## 6. Known Issues

### 🔴 Critical

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 1 | **All `/users` CRUD endpoints unprotected** | `server/src/routes/user.routes.js` | No `authMiddleware` on any CRUD route — anyone can list/create/modify/delete users |
| 2 | **Password hash exposed in user CRUD queries** | `server/src/services/user.service.js` | User CRUD queries use `SELECT *` / `RETURNING *` (`getUserByFirebaseUid` excludes it) |
| 3 | **No password hashing** | `server/src/services/user.service.js:14` | `password_hash` stored as raw input — no bcrypt/argon2 |
| 4 | **Color scheme crash** | `use-theme.ts`, `app-tabs.tsx`, `app-tabs.web.tsx` | `Colors[null]` → `undefined` → crash on property access when `useColorScheme()` returns `null` |
| 5 | **No auth session persistence on native** | `client/src/config/firebase.js` | Uses `getAuth(app)` without `AsyncStorage` persistence — session lost on app restart |

### 🟡 High

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 6 | **Inconsistent route prefixes** | `server/src/app.js` | `/api/health`, `/api/test`, `/api/auth` vs `/users` — namespace `/api/users` |
| 7 | **`updateUser` returns undefined on non-existent user** | `server/src/controllers/user.controller.js:38-49` | No 404 check — returns `200 OK` with `{ data: undefined }` |
| 8 | **Express Router import bug** | `health.routes.js`, `test.routes.js` | `import Router from "express"` creates Express app instance instead of Router |
| 9 | **`test_db.js` typo** | `server/test_db.js:1` | `import irebaseApp` missing 'f'; file tests Firebase not DB despite name |
| 10 | **`.env` not in client `.gitignore`** | `client/.gitignore` | Only `.env*.local` ignored — `client/.env` with Firebase keys could be committed |

### 🟠 Medium

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 11 | **No database schema / migrations** | Server | `users` table structure only implied by SQL queries — no version-controlled schema |
| 12 | **`env.js` typo** | `server/src/config/env.js:7` | Default `"devlopment"` instead of `"development"` |
| 13 | **Clunky update logic** | `server/src/services/user.service.js:25-45` | Rigid if-else branches for name/email combos; can't update other fields |
| 14 | **Branding remnants** | `app-tabs.web.tsx`, `app.json` | Shows "Expo Starter" and app slug/name is "client" |
| 15 | **`firebase.js` is `.js` in TS project** | `client/src/config/firebase.js` | Excluded from TypeScript type-checking |

### 🔵 Low

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 16 | **Dead code** | `hint-row.tsx`, `AnimatedIcon` in `animated-icon.tsx` | Unused components |
| 17 | **`ThemedView` dead props** | `themed-view.tsx` | `lightColor`/`darkColor` destructured but never used |
| 18 | **Health service double semicolon** | `health.service.js:5` | `};;` syntax quirk |
| 19 | **Explore screen is boilerplate** | `client/src/app/explore.tsx` | Expo template content, not ShareSync-specific |
| 20 | **Collapsible chevron rotation inverted** | `client/src/components/ui/collapsible.tsx:26` | 90deg when closed (pointing down), -90deg when open (pointing up) |
| 21 | **`DB_PORT` passed as string** | `server/src/config/db.js:14` | Not parsed as integer |
| 22 | **No `pool.on('error')` handler** | `server/src/config/db.js` | Idle client disconnect crashes server |

---

## 7. Last Updated

| Date | Changes |
|------|---------|
| 2026-11-16 | **Backend Login API Secured & Verified:**<br>1. Removed raw `firebase_uid` authentication loophole from request body.<br>2. Implemented `POST /api/auth/login` and `POST /auth/login` to accept and verify Firebase ID tokens via Bearer header or body `idToken`.<br>3. Extracted verified UID from decoded Firebase token (`req.user.uid`).<br>4. Added `getUserByFirebaseUid` in `user.service.js` to fetch user from PostgreSQL without exposing `password_hash`.<br>5. Added `firebase_uid` column to PostgreSQL `users` table.<br>6. Standardized response format `{ success: true, message: "Login successful", data: user, user: user }`.<br>7. Added 401 handling for missing, invalid, and expired tokens.<br>8. Fixed critical bugs: Firebase Admin initialized on server boot; fixed `/error` fatal crash; added CORS middleware; fixed `errorHandler.js` typos.<br>9. Created comprehensive test suite `server/test_auth_login.mjs` (10 test suites, 32 assertions passed).<br>10. Updated client `index.tsx` to call `POST /api/auth/login` with the ID token, with loading states and error handling. Verified client compiles with zero TypeScript errors. |
