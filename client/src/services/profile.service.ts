import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendEmailVerification,
  sendPasswordResetEmail,
  signOut,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { auth } from '@/config/firebase';
import { apiRequest, ApiError } from './api';

export interface Profile {
  id: string;
  name: string;
  email: string;
  created_at: string;
  emailVerified: boolean;
  provider: string | null;
  stats: {
    files: number;
    storageBytes: number;
    folders: number;
    notes: number;
    sharesGiven: number;
    sharesReceived: number;
    activeLinks: number;
    devices: number;
  };
}

export interface SyncDevice {
  device_id: string;
  platform: string | null;
  device_name: string | null;
  last_seen_at: string;
}

function friendly(err: any): string {
  const code = err?.code || '';
  if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') return 'The current password is incorrect.';
  if (code === 'auth/weak-password') return 'The new password is too weak. Use at least 8 characters.';
  if (code === 'auth/too-many-requests') return 'Too many attempts. Please wait a few minutes and try again.';
  if (code === 'auth/requires-recent-login') return 'Please sign out and sign in again, then retry.';
  if (code === 'auth/network-request-failed') return 'No connection. Check your internet and try again.';
  return err?.message || 'Something went wrong.';
}

/** Which Firebase sign-in methods the current user has (password, google.com, ...). */
export function signInMethods(): string[] {
  return (auth.currentUser?.providerData || []).map((p) => p.providerId);
}

export const profileService = {
  async get(): Promise<Profile> {
    const res = await apiRequest<Profile>('/api/users/me');
    return res.data as Profile;
  },

  /** Updates the name in ShareSync and in the Firebase profile. */
  async updateName(name: string): Promise<Profile['name']> {
    const res = await apiRequest<{ name: string }>('/api/users/me', {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    });
    if (auth.currentUser) {
      await updateProfile(auth.currentUser, { displayName: res.data?.name || name }).catch(() => {});
    }
    return res.data?.name || name;
  },

  /** Changes the password (password accounts). Re-authenticates with the current password first. */
  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error('You are not signed in.');
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
      await updatePassword(user, newPassword);
    } catch (err) {
      throw new Error(friendly(err));
    }
  },

  async sendVerificationEmail(): Promise<void> {
    if (!auth.currentUser) throw new Error('You are not signed in.');
    try {
      await sendEmailVerification(auth.currentUser);
    } catch (err) {
      throw new Error(friendly(err));
    }
  },

  async sendPasswordReset(): Promise<void> {
    const email = auth.currentUser?.email;
    if (!email) throw new Error('No email on this account.');
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (err) {
      throw new Error(friendly(err));
    }
  },

  /** Confirms identity with the password (needed before deleting a password account). */
  async reauthenticateWithPassword(password: string): Promise<void> {
    const user = auth.currentUser;
    if (!user || !user.email) throw new Error('You are not signed in.');
    try {
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    } catch (err) {
      throw new Error(friendly(err));
    }
  },

  /**
   * Deletes the account. Must be called right after re-authentication: the server only accepts
   * deletion within 5 minutes of signing in (REAUTH_REQUIRED otherwise).
   */
  async deleteAccount(): Promise<void> {
    await auth.currentUser?.getIdToken(true); // fresh token carrying the new auth_time
    try {
      await apiRequest('/api/users/me', { method: 'DELETE' });
    } catch (err) {
      const e = err as ApiError;
      if (e.code === 'REAUTH_REQUIRED') throw new Error('Please confirm your identity again, then delete.');
      throw e;
    }
    await signOut(auth).catch(() => {});
  },

  async listDevices(): Promise<SyncDevice[]> {
    const res = await apiRequest<SyncDevice[]>('/api/sync/devices');
    return res.data || [];
  },

  async removeDevice(deviceId: string): Promise<void> {
    await apiRequest(`/api/sync/devices/${encodeURIComponent(deviceId)}`, { method: 'DELETE' });
  },
};
