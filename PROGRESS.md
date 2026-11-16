# ShareSync — Project Progress Tracker

> **Purpose:** Living development tracker. Check before every task; update after every task.  
> **Stack:** React Native (Expo SDK 57) + TypeScript | Node.js (Express 5) + PostgreSQL + Firebase

---

## 1. Completed Features

| # | Feature | Client | Server | Notes |
|---|---------|--------|--------|-------|
| 1 | Dedicated Login screen | ✅ `app/login.tsx` | — | `signInWithEmailAndPassword`; backend integration; displays token |
| 2 | Verified Backend Login API | ✅ `app/login.tsx` | ✅ `POST /api/auth/login` | Accepts Firebase ID token via Bearer header or body, verifies with Firebase Admin SDK, extracts UID, fetches PostgreSQL user |
| 3 | Firebase Auth Session Persistence | ✅ `config/firebase.ts` | — | Configured with `initializeAuth()` and `getReactNativePersistence(AsyncStorage)`; singleton pattern |
| 4 | Global Auth Context & State Management | ✅ `context/AuthContext.tsx` | — | `AuthProvider`, `useAuth()`, `onAuthStateChanged()` listener with cleanup, `user` and `loading` states, `login`, `logout` |
| 5 | Protected Routes & Navigation Guard | ✅ `app/_layout.tsx` | — | Redirects unauthenticated users to `/login`; redirects authenticated users away from `/login` to `/`; prevents flashes and loops with loading screen |
| 6 | Protected Home Dashboard | ✅ `app/index.tsx` | — | Displays authenticated user info, UID, session state, Postman ID token viewer, sign out action |
| 7 | Auth token verification route | — | ✅ `GET /auth`, `GET /api/auth` | Uses `authMiddleware` to verify Firebase Bearer token |
| 8 | Secure User CRUD API | — | ✅ `/users`, `/api/users` routes | Protected by `authMiddleware`; strict ownership enforcement via `req.user.uid`; zero `password_hash` exposure; proper 401/403/404 |
| 9 | Health check endpoint | — | ✅ `GET /api/health` | Static response via `health.service.js` |
| 10 | Test echo endpoint | — | ✅ `POST /api/test/users` | Returns `req.body` back |
| 11 | Firebase Admin SDK initialization on boot | — | ✅ `src/app.js`, `config/firebase.js` | Initialized at application startup; null-safe private key parsing |
| 12 | CORS middleware | — | ✅ `src/app.js` | Cross-origin headers enabled for web and mobile clients |
| 13 | PostgreSQL connection pool | — | ✅ `config/db.js` | Reads DB config from env vars |
| 14 | Environment config module | — | ✅ `config/env.js` | Exposes `port` and `nodeEnv` |
| 15 | Request logger middleware | — | ✅ `middleware/logger.js` | Logs `[METHOD] /path` to console |
| 16 | Standardized error handler | — | ✅ `middleware/errorHandler.js` | Central JSON error responses with `success: false` and HTTP status |
| 17 | Custom AppError class | — | ✅ `utils/AppError.js` | `extends Error` with `statusCode`/`statuscode` and `isOperational` |
| 18 | Secure User service layer | — | ✅ `services/user.service.js` | Data-access for `users` table without `password_hash` leaks; ownership queries |
| 19 | Theme system (light/dark) | ✅ `constants/theme.ts` | — | `Colors`, `Fonts`, `Spacing`, `BottomTabInset`, `MaxContentWidth` |
| 20 | Color scheme hooks (safe fallback) | ✅ hooks | — | `useColorScheme` (native + web hydration-safe), crash-proof `useTheme` defaulting safely to `'light'` |
| 21 | Themed UI primitives | ✅ components | — | `ThemedText` (8 variants), `ThemedView`, `Collapsible`, `ExternalLink` |
| 22 | Tab navigation | ✅ `app/_layout.tsx` | — | Native tabs (`AppTabs`) + web tabs (`AppTabs.web`) via Expo Router |
| 23 | Animated splash overlay | ✅ `animated-icon.tsx` | — | Reanimated keyframe animations + splash screen hide |
| 24 | Explore screen (protected) | ✅ `app/explore.tsx` | — | Protected behind NavigationGuard |

---

## 2. Pending Features

| # | Feature | Priority | Notes |
|---|---------|----------|-------|
| 1 | **File / content sharing (core feature)** | 🔴 High | App's core purpose — no implementation exists |
| 2 | **Real-time sync** | 🔴 High | No WebSocket or real-time infrastructure |
| 3 | **User registration (client & backend sync)**| 🔴 High | Need sign-up screen and backend user provisioning |
| 4 | **Password hashing** | 🔴 High | `createUser` stores raw `password_hash` — needs bcrypt/argon2 |
| 5 | **Google sign-in** | 🟡 Medium | Not started |
| 6 | **Profile screen** | 🟡 Medium | No profile view/edit screen in client |
| 7 | **Folder management** | 🟡 Medium | `folder.controller.js`, `folder.routes.js`, `folder.service.js` are 0-byte stubs |
| 8 | **Database migrations / schema tool** | 🟡 Medium | Table structures need migration files (e.g. Knex/Prisma/SQL migrations) |
| 9 | **Input validation (server)** | 🟡 Medium | No Joi/Zod; manual checks only |
| 10 | **Push notifications** | 🔵 Low | Not started |
| 11 | **Rate limiting** | 🔵 Low | No rate limiting middleware |
| 12 | **Structured logging** | 🔵 Low | Only `console.log/error` |

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
| Root layout | `client/src/app/_layout.tsx` | `RootLayout` (default) | AuthProvider, ThemeProvider, NavigationGuard (route protection) |
| Login screen | `client/src/app/login.tsx` | `LoginScreen` (default) | Dedicated login screen with Firebase + Backend authentication |
| Home screen | `client/src/app/index.tsx` | `HomeScreen` (default) | Protected home screen: user info, UID, Postman token viewer, sign out |
| Explore | `client/src/app/explore.tsx` | `TabTwoScreen` (default) | Protected Explore screen |

### Client — Contexts & State

| File | Path | Exports | Purpose |
|------|------|---------|---------|
| Auth Context | `client/src/context/AuthContext.tsx` | `AuthProvider`, `useAuth`, `AuthContextType` | Centralized Firebase auth state, persistence listener, login/logout |

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
| 1 | **Redundant `dotenv.config()`** — called in config files | `config/db.js`, `config/env.js`, `config/firebase.js` | Call once in entry point |
| 2 | **Flawed Express Router import** — `import Router from "express"` | `health.routes.js`, `test.routes.js` | Use `express.Router()` consistently |
| 3 | **Animated icon native/web** — mirrored keyframe logic | `animated-icon.tsx`, `animated-icon.web.tsx` | Expected for platform files, but `AnimatedIcon` itself is unused/dead code |

---

## 6. Known Issues

### 🔴 Critical

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 1 | **No password hashing** | `server/src/services/user.service.js` | `password_hash` stored as raw input — needs bcrypt/argon2 |

### 🟡 High

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 2 | **Express Router import bug** | `health.routes.js`, `test.routes.js` | `import Router from "express"` creates Express app instance instead of Router |
| 3 | **`test_db.js` typo** | `server/test_db.js:1` | `import irebaseApp` missing 'f'; file tests Firebase not DB despite name |
| 4 | **`.env` not in client `.gitignore`** | `client/.gitignore` | Only `.env*.local` ignored — `client/.env` with Firebase keys could be committed |

### 🟠 Medium

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 5 | **No database schema / migrations** | Server | `users` table structure only implied by SQL queries — no version-controlled schema |
| 6 | **`env.js` typo** | `server/src/config/env.js:7` | Default `"devlopment"` instead of `"development"` |
| 7 | **Branding remnants** | `app-tabs.web.tsx`, `app.json` | Shows "Expo Starter" and app slug/name is "client" |

### 🔵 Low

| # | Issue | Location | Details |
|---|-------|----------|---------|
| 8 | **Dead code** | `hint-row.tsx`, `AnimatedIcon` in `animated-icon.tsx` | Unused components |
| 9 | **`ThemedView` dead props** | `themed-view.tsx` | `lightColor`/`darkColor` destructured but never used |
| 10 | **Health service double semicolon** | `health.service.js:5` | `};;` syntax quirk |
| 11 | **Explore screen is boilerplate** | `client/src/app/explore.tsx` | Expo template content, not ShareSync-specific |
| 12 | **Collapsible chevron rotation inverted** | `client/src/components/ui/collapsible.tsx:26` | 90deg when closed (pointing down), -90deg when open (pointing up) |
| 13 | **`DB_PORT` passed as string** | `server/src/config/db.js:14` | Not parsed as integer |
| 14 | **No `pool.on('error')` handler** | `server/src/config/db.js` | Idle client disconnect crashes server |

---

## 7. Last Updated

| Date | Changes |
|------|---------|
| 2026-11-16 | **Firebase Auth Persistence & Protected Routes Implemented (Feature 17):**<br>1. Installed `@react-native-async-storage/async-storage` via Expo.<br>2. Configured `client/src/config/firebase.ts` with `initializeAuth()` and `getReactNativePersistence(AsyncStorage)` ensuring singleton initialization.<br>3. Implemented `AuthProvider` and `useAuth()` hook in `client/src/context/AuthContext.tsx` with `onAuthStateChanged()` lifecycle tracking and unsubscription.<br>4. Built `NavigationGuard` in `client/src/app/_layout.tsx`: unauthenticated users redirected to `/login`; authenticated users redirected away from `/login` to `/`; loading screen rendered during auth resolution.<br>5. Created dedicated `client/src/app/login.tsx` (renders without tab bar).<br>6. Updated `client/src/app/index.tsx` as protected Home dashboard with user session details, Postman ID token viewer, and logout action.<br>7. Fixed color scheme crashes across `app-tabs.tsx`, `app-tabs.web.tsx`, and `use-theme.ts`.<br>8. Verified TypeScript compilation: 0 errors.<br>9. Automated tests passing: 25 client auth tests, 32 server login tests, 43 user CRUD tests (100 total passing assertions). |
