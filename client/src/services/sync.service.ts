import { io, Socket } from 'socket.io-client';
import { auth } from '@/config/firebase';
import { apiRequest, getApiBaseUrl } from './api';
import { getDeviceId, getPlatform, readJson, writeJson } from './device';

export interface SyncEvent {
  id: string;
  type: string; // e.g. "file.created", "note.updated", "share.revoked"
  resourceType: string;
  resourceId: string | null;
  folderId: string | null;
  payload: Record<string, any>;
  createdAt?: string;
}

export interface AppNotification {
  id: string;
  type: string;
  title: string;
  body: string;
  resource_type: 'file' | 'folder' | 'note' | null;
  resource_id: string | null;
  data: Record<string, any>;
  read: boolean;
  read_at: string | null;
  created_at: string;
}

export interface ChangesPage {
  events: SyncEvent[];
  cursor: string;
  hasMore: boolean;
  reset: boolean;
}

export const syncApi = {
  async getChanges(since: string, limit = 200): Promise<ChangesPage> {
    const res = await apiRequest<ChangesPage>(`/api/sync/changes?since=${encodeURIComponent(since)}&limit=${limit}`);
    return res.data as ChangesPage;
  },
  async getCursor(): Promise<string> {
    const res = await apiRequest<{ cursor: string }>('/api/sync/cursor');
    return res.data?.cursor || '0';
  },
  async registerDevice(cursor?: string) {
    await apiRequest('/api/sync/devices', {
      method: 'POST',
      body: JSON.stringify({ deviceId: await getDeviceId(), platform: getPlatform(), ...(cursor ? { cursor } : {}) }),
    });
  },
  async listDevices() {
    const res = await apiRequest<any[]>('/api/sync/devices');
    return res.data || [];
  },
};

const cursorKey = (uid: string) => `sharesync.syncCursor.${uid}`;
export const loadCursor = (uid: string) => readJson<string | null>(cursorKey(uid), null);
export const saveCursor = (uid: string, cursor: string) => writeJson(cursorKey(uid), cursor);

/**
 * Opens the authenticated real-time connection. The `auth` callback runs on every
 * (re)connect, so an expired Firebase token is replaced by a fresh one automatically.
 */
export async function openSocket(): Promise<Socket> {
  const deviceId = await getDeviceId();
  const platform = getPlatform();
  return io(getApiBaseUrl(), {
    path: '/socket.io',
    transports: ['websocket'],
    autoConnect: true,
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 30000,
    randomizationFactor: 0.5,
    timeout: 15000,
    auth: (cb) => {
      const user = auth.currentUser;
      if (!user) return cb({});
      user
        .getIdToken()
        .then((token) => cb({ token, deviceId, platform }))
        .catch(() => cb({ deviceId, platform }));
    },
  });
}
