import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { auth } from '@/config/firebase';
import { apiRequest, ApiError, getApiBaseUrl, getAuthToken, isNetworkError } from './api';
import { readJson, writeJson } from './device';
import { FileItem } from '@/types/explorer';

/**
 * "Available offline" files (Android / iOS).
 *
 * - A copy is stored in the app's private document directory and listed in a local index.
 * - On every sync the copies are checked against the server: a newer version is downloaded
 *   again; if access was revoked or the file was deleted, the local copy is removed.
 * - Web browsers are not supported (no reliable private file storage); `isSupported()` is false.
 */

export interface OfflineEntry {
  id: string;
  name: string;
  mimeType: string;
  version: number;
  size: number;
  uri: string;
  savedAt: string;
  checkedAt: string;
}

const indexKey = () => `sharesync.offline.${auth.currentUser?.uid || 'anon'}`;

export const offlineService = {
  isSupported(): boolean {
    return Platform.OS === 'ios' || Platform.OS === 'android';
  },

  async list(): Promise<OfflineEntry[]> {
    return readJson<OfflineEntry[]>(indexKey(), []);
  },

  async isOffline(fileId: string): Promise<boolean> {
    return (await this.list()).some((e) => e.id === String(fileId));
  },

  /** Downloads a private copy for offline use. */
  async add(file: FileItem): Promise<OfflineEntry> {
    if (!this.isSupported()) throw new Error('Offline files are available in the Android and iOS apps.');
    const entry = await download(String(file.id), file.name, file.mime_type, Number(file.version) || 1);
    const list = (await this.list()).filter((e) => e.id !== entry.id);
    list.unshift(entry);
    await writeJson(indexKey(), list);
    return entry;
  },

  async remove(fileId: string): Promise<void> {
    const list = await this.list();
    const entry = list.find((e) => e.id === String(fileId));
    if (entry) deleteLocal(entry.uri);
    await writeJson(indexKey(), list.filter((e) => e.id !== String(fileId)));
  },

  /** Opens / shares the local copy (works without a connection). */
  async open(entry: OfflineEntry): Promise<void> {
    if (!(await Sharing.isAvailableAsync())) throw new Error('Opening files is not available on this device.');
    await Sharing.shareAsync(entry.uri, { mimeType: entry.mimeType, dialogTitle: entry.name });
  },

  /**
   * Brings every offline copy up to date. Called by the sync engine after each catch-up
   * and when a file.updated event arrives for an offline file.
   */
  async refresh(onlyIds?: string[]): Promise<{ updated: number; removed: number }> {
    if (!this.isSupported()) return { updated: 0, removed: 0 };
    const list = await this.list();
    let updated = 0;
    let removed = 0;
    const next: OfflineEntry[] = [];
    for (const entry of list) {
      if (onlyIds && !onlyIds.includes(entry.id)) {
        next.push(entry);
        continue;
      }
      try {
        const res = await apiRequest<FileItem>(`/api/files/${encodeURIComponent(entry.id)}`);
        const meta = res.data!;
        const serverVersion = Number(meta.version) || 1;
        if (serverVersion !== entry.version || meta.name !== entry.name) {
          deleteLocal(entry.uri);
          next.push(await download(entry.id, meta.name, meta.mime_type, serverVersion));
          updated++;
        } else {
          next.push({ ...entry, checkedAt: new Date().toISOString() });
        }
      } catch (err) {
        const e = err as ApiError;
        if (isNetworkError(e)) {
          next.push(entry); // offline: keep using the local copy
        } else if (e.status === 403 || e.status === 404) {
          deleteLocal(entry.uri); // access revoked or file deleted: remove the private copy
          removed++;
        } else {
          next.push(entry);
        }
      }
    }
    await writeJson(indexKey(), next);
    return { updated, removed };
  },
};

function offlineDir(): Directory {
  const dir = new Directory(Paths.document, 'offline');
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  return dir;
}

function deleteLocal(uri: string) {
  try {
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch {}
}

async function download(id: string, name: string, mimeType: string, version: number): Promise<OfflineEntry> {
  const token = await getAuthToken();
  const safe = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_') || 'file';
  const dest = new File(offlineDir(), `${id}_v${version}_${safe}`);
  const file = await File.downloadFileAsync(`${getApiBaseUrl()}/api/files/${encodeURIComponent(id)}/download`, dest, {
    headers: { Authorization: `Bearer ${token}` },
    idempotent: true,
  });
  const now = new Date().toISOString();
  return { id, name, mimeType: mimeType || 'application/octet-stream', version, size: file.size ?? 0, uri: file.uri, savedAt: now, checkedAt: now };
}
