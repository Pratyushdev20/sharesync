import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const DEVICE_KEY = 'sharesync.deviceId';
let cached: string | null = null;

function randomId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let out = '';
  for (let i = 0; i < 24; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

/** Stable per-install device id (used for sync device tracking, not for security). */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;
  try {
    const existing = await AsyncStorage.getItem(DEVICE_KEY);
    if (existing && /^[A-Za-z0-9_-]{8,64}$/.test(existing)) {
      cached = existing;
      return existing;
    }
  } catch {}
  cached = `${Platform.OS}_${randomId()}`;
  try {
    await AsyncStorage.setItem(DEVICE_KEY, cached);
  } catch {}
  return cached;
}

export function getPlatform(): 'ios' | 'android' | 'web' | 'windows' | 'macos' {
  const os = Platform.OS as string;
  return (['ios', 'android', 'web', 'windows', 'macos'].includes(os) ? os : 'web') as any;
}

/** Small JSON helpers around AsyncStorage that never throw. */
export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export async function removeKey(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {}
}
