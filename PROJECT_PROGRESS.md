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
| 4 | Secure User CRUD API | — | ✅ `/users`, `/api/users` routes | Protected by `authMiddleware`; strict ownership enforcement via `req.user.uid`; zero `password_hash` exposure; proper 401/403/404 |
| 5 | Health check endpoint | — | ✅ `GET /api/health` | Static response via `health.service.js` |
| 6 | Test echo endpoint | — | ✅ `POST /api/test/users` | Returns `req.body` back |
| 7 | Firebase Admin SDK initialization on boot | — | ✅ `src/app.js`, `config/firebase.js` | Initialized at application startup; null-safe private key parsing |
| 8 | CORS middleware | — | ✅ `src/app.js` | Cross-origin headers enabled for web and mobile clients |
| 9 | PostgreSQL connection pool | — | ✅ `config/db.js` | Reads DB config from env vars |
| 10 | Environment config module | — | ✅ `config/env.js` | Exposes `port` and `nodeEnv` |
| 11 | Request logger middleware | — | ✅ `middleware/logger.js` | Logs `[METHOD] /path` to console |
| 12 | Standardized error handler | — | ✅ `middleware/errorHandler.js` | Central JSON error responses with `success: false` and HTTP status |
| 13 | Custom AppError class | — | ✅ `utils/AppError.js` | `extends Error` with `statusCode`/`statuscode` and `isOperational` |
| 14 | Secure User service layer | — | ✅ `services/user.service.js` | Data-access for `users` table without `password_hash` leaks; ownership queries |
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
| 7 | **Google sign-in** | 🟡 Medium | Not started |
| 8 | **Profile screen** | 🟡 Medium | No profile view/edit screen in client |
| 9 | **Folder management** | 🟡 Medium | `folder.controller.js`, `folder.routes.js`, `folder.service.js` are 0-byte stubs |
| 10 | **Database migrations / schema tool** | 🟡 Medium | Table structures need migration files (e.g. Knex/Prisma/SQL migrations) |
| 11 | **Input validation (server)** | 🟡 Medium | No Joi/Zod; manual checks only |
| 12 | **Home screen content** | 🟡 Medium | Needs actual home dashboard rather than login test screen |
| 13 | **Push notifications** | 🔵 Low | Not started |
| 14 | **Rate limiting** | 🔵 Low | No rate limiting middleware |
| 15 | **Structured logging** | 🔵 Low | Only `console.log/error` |

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
| User routes | `server/src/routes/user.routes.js` | `GET /api/users/`, `POST /api/users/`, `GET /api/users/:id`, `PATCH /api/users/:id`, `DELETE /api/users/:id` (all protected by `authMiddleware`) |
| Health routes | `server/src/routes/health.routes.js` | `GET /api/health/` |
| Test routes | `server/src/routes/test.routes.js` | `POST /api/test/users` |
| Folder routes | `server/src/routes/folder.routes.js` | ⚠️ Empty file (0 bytes) |

### Server — Controllers

| Function | Path | Purpose |
|----------|------|---------|
| `loginController` | `server/src/controllers/auth.controller.js` | Authenticates verified UID from Firebase token, fetches PostgreSQL user |
| `getUsersController` | `server/src/controllers/user.controller.js` | Lists records owned by authenticated user (`req.user.uid`) |
| `createUserController` | `server/src/controllers/user.controller.js` | Creates user bound to `req.user.uid` |
| `getUserByIdController` | `server/src/controllers/user.controller.js` | Gets user by ID with ownership check (403 for other users) |
| `updateUserController` | `server/src/controllers/user.controller.js` | Updates user by ID with ownership check (403 for other users) |
| `deleteUserController` | `server/src/controllers/user.controller.js` | Deletes user by ID with ownership check (403 for other users) |
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
| `getUsers` | `server/src/services/user.service.js` | Queries `users` by `firebase_uid`, excludes `password_hash` |
| `createUser` | `server/src/services/user.service.js` | `INSERT INTO users` with `firebase_uid`, excludes `password_hash` |
| `getUserById` | `server/src/services/user.service.js` | `SELECT` by ID or `firebase_uid`, excludes `password_hash` |
| `updateUser` | `server/src/services/user.service.js` | `UPDATE users`, excludes `password_hash` |
| `deleteUser` | `server/src/services/user.service.js` | `DELETE FROM users`, excludes `password_hash` |
| `getUserByFirebaseUid` | `server/src/services/user.service.js` | Fetches user by `firebase_uid`, excludes `password_hash` |
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
| 4 | **Flawed Express Router import** — `import Router from "express"` | `health.routes.js`, `test.routes.js` | Use `express.Router()` consistently |
| 5 | **Animated icon native/web** — mirrored keyframe logic | `animated-icon.tsx`, `animated-icon.web.tsx` | Expected for platform files, but `AnimatedIcon` itself is unused/dead code |

---

## 6. Known Issues

### 🔴 Critical

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 1 | **No password hashing** | `server/src/services/user.service.js` | `password_hash` stored as raw input — needs bcrypt/argon2 |
| 2 | **Color scheme crash** | `use-theme.ts`, `app-tabs.tsx`, `app-tabs.web.tsx` | `Colors[null]` → `undefined` → crash on property access when `useColorScheme()` returns `null` |
| 3 | **No auth session persistence on native** | `client/src/config/firebase.js` | Uses `getAuth(app)` without `AsyncStorage` persistence — session lost on app restart |

### 🟡 High

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 4 | **Express Router import bug** | `health.routes.js`, `test.routes.js` | `import Router from "express"` creates Express app instance instead of Router |
| 5 | **`test_db.js` typo** | `server/test_db.js:1` | `import irebaseApp` missing 'f'; file tests Firebase not DB despite name |
| 6 | **`.env` not in client `.gitignore`** | `client/.gitignore` | Only `.env*.local` ignored — `client/.env` with Firebase keys could be committed |

### 🟠 Medium

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 7 | **No database schema / migrations** | Server | `users` table structure only implied by SQL queries — no version-controlled schema |
| 8 | **`env.js` typo** | `server/src/config/env.js:7` | Default `"devlopment"` instead of `"development"` |
| 9 | **Branding remnants** | `app-tabs.web.tsx`, `app.json` | Shows "Expo Starter" and app slug/name is "client" |
| 10 | **`firebase.js` is `.js` in TS project** | `client/src/config/firebase.js` | Excluded from TypeScript type-checking |

### 🔵 Low

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 11 | **Dead code** | `hint-row.tsx`, `AnimatedIcon` in `animated-icon.tsx` | Unused components |
| 12 | **`ThemedView` dead props** | `themed-view.tsx` | `lightColor`/`darkColor` destructured but never used |
| 13 | **Health service double semicolon** | `health.service.js:5` | `};;` syntax quirk |
| 14 | **Explore screen is boilerplate** | `client/src/app/explore.tsx` | Expo template content, not ShareSync-specific |
| 15 | **Collapsible chevron rotation inverted** | `client/src/components/ui/collapsible.tsx:26` | 90deg when closed (pointing down), -90deg when open (pointing up) |
| 16 | **`DB_PORT` passed as string** | `server/src/config/db.js:14` | Not parsed as integer |
| 17 | **No `pool.on('error')` handler** | `server/src/config/db.js` | Idle client disconnect crashes server |

---

## 7. Last Updated

| Date | Changes |
|------|---------|
| 2026-11-16 | **User CRUD APIs Secured & Verified:**<br>1. Applied `authMiddleware` to all user routes (`GET /`, `POST /`, `GET /:id`, `PATCH /:id`, `DELETE /:id`).<br>2. Enforced ownership using verified Firebase UID from `req.user.uid`.<br>3. Blocked cross-user access, updates, and deletes with HTTP 403 Forbidden.<br>4. Completely removed `password_hash` from all user service queries (`SELECT` and `RETURNING`).<br>5. Added proper 401, 403, and 404 error handling across all controllers.<br>6. Mounted `/api/users` alongside `/users`.<br>7. Added comprehensive automated test suite `server/test_user_crud.mjs` (43 passed tests, 0 failures). Total automated test assertions passing across suites: 75.<br>8. Verified regression-free with all 32 auth login tests passing. |
