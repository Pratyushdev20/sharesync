import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import {
  initializeAuth,
  getReactNativePersistence,
  browserLocalPersistence,
  getAuth,
  Auth,
} from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Platform } from "react-native";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// Ensure Firebase App is initialized only once
export const app: FirebaseApp =
  getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Configure Firebase Auth with persistence, ensuring single initialization
function configureAuth(): Auth {
  try {
    const persistence =
      Platform.OS === "web"
        ? browserLocalPersistence
        : typeof getReactNativePersistence === "function"
        ? getReactNativePersistence(AsyncStorage)
        : browserLocalPersistence;

    return initializeAuth(app, {
      persistence,
    });
  } catch (_error) {
    // If initializeAuth was already called (e.g. fast refresh/HMR), get the existing instance
    return getAuth(app);
  }
}

export const auth: Auth = configureAuth();
export default auth;
