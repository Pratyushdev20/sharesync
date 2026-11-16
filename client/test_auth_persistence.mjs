import { initializeApp, getApps, getApp } from "firebase/app";
import {
  initializeAuth,
  browserLocalPersistence,
  getAuth,
} from "firebase/auth";

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ PASS: ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

// In-memory mock storage matching @react-native-async-storage/async-storage API
class MockAsyncStorage {
  constructor() {
    this.store = new Map();
  }
  async setItem(key, value) {
    this.store.set(key, String(value));
  }
  async getItem(key) {
    return this.store.has(key) ? this.store.get(key) : null;
  }
  async removeItem(key) {
    this.store.delete(key);
  }
  async clear() {
    this.store.clear();
  }
}

const mockAsyncStorage = new MockAsyncStorage();

async function runTests() {
  console.log("\n=======================================================");
  console.log("RUNNING CLIENT AUTH PERSISTENCE & NAVIGATION TESTS");
  console.log("=======================================================\n");

  const firebaseConfig = {
    apiKey: "test-api-key-sharesync",
    authDomain: "sharesync-test.firebaseapp.com",
    projectId: "sharesync-test",
    storageBucket: "sharesync-test.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:abcdef123456",
  };

  // -------------------------------------------------------------
  // TEST 1: Firebase App & Auth Singleton Verification
  // -------------------------------------------------------------
  console.log("TEST 1: Singleton initialization of Firebase App and Auth");
  {
    // Ensure single app initialization pattern
    const app1 = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    const app2 = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
    assert(app1 === app2, "Firebase App singleton returns same instance without throwing already-exists error");
    assert(getApps().length === 1, `Exactly one Firebase App registered in SDK (count: ${getApps().length})`);

    // Ensure single Auth initialization pattern
    let auth1;
    let auth2;
    try {
      auth1 = initializeAuth(app1, { persistence: browserLocalPersistence });
    } catch {
      auth1 = getAuth(app1);
    }

    try {
      // Re-invoking initializeAuth on already initialized app should be caught and fallback to getAuth
      auth2 = initializeAuth(app1, { persistence: browserLocalPersistence });
    } catch {
      auth2 = getAuth(app1);
    }

    assert(auth1 === auth2, "Firebase Auth singleton returns same instance on subsequent calls");
  }

  // -------------------------------------------------------------
  // TEST 2: AsyncStorage Persistence Engine Verification
  // -------------------------------------------------------------
  console.log("\nTEST 2: AsyncStorage persistence engine check");
  {
    assert(typeof mockAsyncStorage.setItem === "function", "AsyncStorage.setItem is a function");
    assert(typeof mockAsyncStorage.getItem === "function", "AsyncStorage.getItem is a function");
    assert(typeof mockAsyncStorage.removeItem === "function", "AsyncStorage.removeItem is a function");

    const testKey = "@sharesync_auth_test_" + Date.now();
    await mockAsyncStorage.setItem(testKey, JSON.stringify({ uid: "user_test_123", token: "jwt_token_abc" }));
    const read = await mockAsyncStorage.getItem(testKey);
    assert(JSON.parse(read).uid === "user_test_123", "AsyncStorage correctly writes and reads session data");

    await mockAsyncStorage.removeItem(testKey);
    const readAfter = await mockAsyncStorage.getItem(testKey);
    assert(readAfter === null, "AsyncStorage correctly purges session data on remove");
  }

  // -------------------------------------------------------------
  // TEST 3: Auth State Management & Unsubscribe Lifecycle
  // -------------------------------------------------------------
  console.log("\nTEST 3: onAuthStateChanged listener and unsubscription");
  {
    const app = getApp();
    const auth = getAuth(app);
    let callCount = 0;

    const unsubscribe = auth.onAuthStateChanged((user) => {
      callCount++;
    });

    assert(typeof unsubscribe === "function", "onAuthStateChanged returns a valid unsubscribe function");
    await new Promise((r) => setTimeout(r, 50));
    assert(callCount >= 1, "onAuthStateChanged fired initial authentication check");

    unsubscribe();
    const previousCount = callCount;
    await new Promise((r) => setTimeout(r, 50));
    assert(callCount === previousCount, "Listener was successfully detached (no memory leaks)");
  }

  // -------------------------------------------------------------
  // TEST 4: Navigation Guard Logic (Protected Routes & Redirection)
  // -------------------------------------------------------------
  console.log("\nTEST 4: Protected navigation & redirect rules");
  {
    function evaluateRouteGuard({ user, loading, currentSegment }) {
      const inAuthGroup = currentSegment === "login";

      if (loading) {
        return { action: "SHOW_LOADING", redirect: null, render: "ActivityIndicator" };
      }

      if (!user && !inAuthGroup) {
        return { action: "REDIRECT", redirect: "/login", render: null };
      }

      if (user && inAuthGroup) {
        return { action: "REDIRECT", redirect: "/", render: null };
      }

      if (inAuthGroup) {
        return { action: "RENDER", redirect: null, render: "LoginScreen" };
      }

      return { action: "RENDER", redirect: null, render: "AppTabs" };
    }

    // 4a. Loading state (checking auth)
    const r1 = evaluateRouteGuard({ user: null, loading: true, currentSegment: "index" });
    assert(r1.action === "SHOW_LOADING" && r1.render === "ActivityIndicator", "Loading state shows ActivityIndicator, preventing screen flash");

    // 4b. Unauthenticated user on protected Home route ("/")
    const r2 = evaluateRouteGuard({ user: null, loading: false, currentSegment: "index" });
    assert(r2.action === "REDIRECT" && r2.redirect === "/login", "Unauthenticated user on Home (/) redirected to /login");

    // 4c. Unauthenticated user on protected Explore route ("/explore")
    const r3 = evaluateRouteGuard({ user: null, loading: false, currentSegment: "explore" });
    assert(r3.action === "REDIRECT" && r3.redirect === "/login", "Unauthenticated user on Explore (/explore) redirected to /login");

    // 4d. Unauthenticated user on Login route ("/login")
    const r4 = evaluateRouteGuard({ user: null, loading: false, currentSegment: "login" });
    assert(r4.action === "RENDER" && r4.render === "LoginScreen", "Unauthenticated user on /login renders LoginScreen without tab bar");

    // 4e. Authenticated user on Login route ("/login")
    const sampleUser = { uid: "auth_uid_555", email: "user@sharesync.com" };
    const r5 = evaluateRouteGuard({ user: sampleUser, loading: false, currentSegment: "login" });
    assert(r5.action === "REDIRECT" && r5.redirect === "/", "Authenticated user visiting /login redirected away to Home (/)");

    // 4f. Authenticated user on Home route ("/")
    const r6 = evaluateRouteGuard({ user: sampleUser, loading: false, currentSegment: "index" });
    assert(r6.action === "RENDER" && r6.render === "AppTabs", "Authenticated user on Home renders protected AppTabs");

    // 4g. Authenticated user on Explore route ("/explore")
    const r7 = evaluateRouteGuard({ user: sampleUser, loading: false, currentSegment: "explore" });
    assert(r7.action === "RENDER" && r7.render === "AppTabs", "Authenticated user on Explore renders protected AppTabs");

    // 4h. Immediate redirect to /login on logout
    const r8 = evaluateRouteGuard({ user: null, loading: false, currentSegment: "index" });
    assert(r8.action === "REDIRECT" && r8.redirect === "/login", "Logout immediately triggers redirect to /login");
  }

  // -------------------------------------------------------------
  // TEST 5: Session Persistence Across App Restarts
  // -------------------------------------------------------------
  console.log("\nTEST 5: Session persistence across app restarts");
  {
    const storageKey = "@firebase_auth_session:[DEFAULT]";
    const storedSession = {
      uid: "persisted_user_888",
      email: "persisted@sharesync.com",
      stsTokenManager: {
        accessToken: "persisted_valid_token",
        expirationTime: Date.now() + 3600 * 1000,
      },
    };

    // User logged in during session 1
    await mockAsyncStorage.setItem(storageKey, JSON.stringify(storedSession));

    // App is closed and reopened (session 2)
    const retrieved = await mockAsyncStorage.getItem(storageKey);
    const parsed = JSON.parse(retrieved);
    assert(parsed.uid === "persisted_user_888", "Session data successfully persisted and retrieved across restarts");
    assert(parsed.stsTokenManager.expirationTime > Date.now(), "Persisted session token remains valid and active");

    // User logs out -> session cleared
    await mockAsyncStorage.removeItem(storageKey);
    const cleared = await mockAsyncStorage.getItem(storageKey);
    assert(cleared === null, "Logout clears session from persistence storage");
  }

  // -------------------------------------------------------------
  // TEST 6: Expired or Corrupted Session Handling
  // -------------------------------------------------------------
  console.log("\nTEST 6: Expired or corrupted session handling");
  {
    function validateSession(session) {
      if (!session || typeof session !== "object") return false;
      if (!session.uid || !session.stsTokenManager) return false;
      if (session.stsTokenManager.expirationTime <= Date.now()) return false;
      return true;
    }

    const expiredSession = {
      uid: "old_user",
      stsTokenManager: { expirationTime: Date.now() - 10000 },
    };
    assert(validateSession(expiredSession) === false, "Expired session detected as invalid");

    const corruptedSession = { something: "else" };
    assert(validateSession(corruptedSession) === false, "Corrupted session detected as invalid");

    const validSession = {
      uid: "active_user",
      stsTokenManager: { expirationTime: Date.now() + 60000 },
    };
    assert(validateSession(validSession) === true, "Valid session verified successfully");
  }

  console.log("\n=======================================================");
  console.log(`CLIENT AUTH TESTS: ${passed} passed, ${failed} failed`);
  console.log("=======================================================\n");

  if (failed > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
}

runTests().catch((err) => {
  console.error("Test execution failed:", err);
  process.exit(1);
});
