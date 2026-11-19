import { Platform } from 'react-native';
import {
  GoogleAuthProvider,
  signInWithCredential,
  signInWithPopup,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut,
  User,
} from 'firebase/auth';
import { auth } from '@/config/firebase';
import { apiRequest, ApiError } from './api';

/**
 * Google Sign-In.
 *
 * - Web: Firebase popup (needs the Google provider enabled in Firebase Console → Authentication).
 * - Android / iOS: Google OAuth via expo-auth-session returns an ID token, which is exchanged for
 *   a Firebase session (needs EXPO_PUBLIC_GOOGLE_*_CLIENT_ID and a development build).
 *
 * After Firebase sign-in, POST /api/auth/session creates or loads the ShareSync account.
 */

export const googleClientIds = {
  web: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
  android: process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID || '',
  ios: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '',
};

/** True when Google Sign-In can be offered on this platform. */
export function isGoogleSignInConfigured(): boolean {
  if (Platform.OS === 'web') return true; // uses the Firebase project's Google provider
  if (Platform.OS === 'android') return !!googleClientIds.android && !!googleClientIds.web;
  if (Platform.OS === 'ios') return !!googleClientIds.ios && !!googleClientIds.web;
  return false;
}

/** One-time message shown on the login screen after an automatic sign-out. */
let pendingAuthNotice: string | null = null;
export function setAuthNotice(message: string) {
  pendingAuthNotice = message;
}
export function takeAuthNotice(): string | null {
  const m = pendingAuthNotice;
  pendingAuthNotice = null;
  return m;
}

function friendlyFirebaseError(err: any): string {
  const code = err?.code || '';
  if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return '';
  if (code === 'auth/popup-blocked') return 'Your browser blocked the Google window. Allow pop-ups for this site and try again.';
  if (code === 'auth/account-exists-with-different-credential') {
    return 'This email already has a ShareSync password account. Sign in with your email and password.';
  }
  if (code === 'auth/operation-not-allowed') return 'Google sign-in is not enabled for this ShareSync project yet.';
  if (code === 'auth/network-request-failed') return 'No connection. Check your internet and try again.';
  return err?.message || 'Google sign-in failed.';
}

/** Creates / loads the ShareSync account for the Firebase user that just signed in. */
async function establishSession(): Promise<{ created: boolean }> {
  try {
    const res = (await apiRequest('/api/auth/session', {
      method: 'POST',
      body: JSON.stringify({ name: auth.currentUser?.displayName || undefined }),
    })) as any;
    return { created: res.created === true };
  } catch (err) {
    const e = err as ApiError;
    if (e.code === 'ACCOUNT_EXISTS' || e.code === 'REGISTRATION_REQUIRED') {
      // Do not leave a half-signed-in session behind
      setAuthNotice(e.message);
      await signOut(auth).catch(() => {});
    }
    throw e;
  }
}

/** Web: Google popup → Firebase → ShareSync session. Returns null if the user closed the popup. */
export async function signInWithGoogleWeb(): Promise<{ created: boolean } | null> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    const message = friendlyFirebaseError(err);
    if (!message) return null;
    throw new Error(message);
  }
  return establishSession();
}

/** Native: ID token from Google OAuth → Firebase → ShareSync session. */
export async function signInWithGoogleIdToken(idToken: string): Promise<{ created: boolean }> {
  try {
    await signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
  } catch (err) {
    throw new Error(friendlyFirebaseError(err) || 'Google sign-in was cancelled.');
  }
  return establishSession();
}

/** Re-authenticates a Google user (required before deleting the account). */
export async function reauthenticateWithGoogle(user: User, idToken?: string): Promise<void> {
  try {
    if (Platform.OS === 'web') {
      await reauthenticateWithPopup(user, new GoogleAuthProvider());
    } else {
      if (!idToken) throw new Error('Google confirmation was cancelled.');
      await reauthenticateWithCredential(user, GoogleAuthProvider.credential(idToken));
    }
  } catch (err) {
    const message = friendlyFirebaseError(err);
    throw new Error(message || 'Google confirmation was cancelled.');
  }
}
