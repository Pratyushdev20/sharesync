import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import type { Socket } from 'socket.io-client';
import { useAuth } from '@/context/AuthContext';
import { AppNotification, loadCursor, openSocket, saveCursor, SyncEvent, syncApi } from '@/services/sync.service';
import { notificationService } from '@/services/notification.service';

/**
 * Real-time synchronisation for web and mobile.
 *
 * - Keeps an authenticated Socket.IO connection while signed in.
 * - Persists the last processed change-feed id ("cursor"); after being offline it fetches
 *   everything missed (`/api/sync/changes`), then continues live.
 * - Watches connectivity (NetInfo) and app foregrounding to resync immediately.
 * - Retries failed catch-ups with exponential backoff.
 * - Screens subscribe with `useSyncEvents()` and refresh what changed.
 * - Background jobs (notes outbox, offline files) register with `registerSyncTask()`.
 */

export type SyncStatus = 'offline' | 'connecting' | 'syncing' | 'synced' | 'error';

type EventListener = (event: SyncEvent | { type: 'reset' }) => void;
type NotificationListener = (n: AppNotification) => void;
type SyncTask = () => Promise<void>;

interface SyncContextValue {
  status: SyncStatus;
  isOnline: boolean;
  lastSyncedAt: Date | null;
  lastError: string | null;
  unreadCount: number;
  pendingChanges: number;
  setPendingChanges: (n: number) => void;
  refreshUnread: () => Promise<void>;
  setUnreadCount: (n: number) => void;
  subscribe: (listener: EventListener) => () => void;
  subscribeNotifications: (listener: NotificationListener) => () => void;
  registerSyncTask: (name: string, task: SyncTask) => () => void;
  syncNow: () => Promise<void>;
}

const SyncContext = createContext<SyncContextValue | undefined>(undefined);

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [status, setStatus] = useState<SyncStatus>('connecting');
  const [isOnline, setIsOnline] = useState(true);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [pendingChanges, setPendingChanges] = useState(0);

  const socketRef = useRef<Socket | null>(null);
  const cursorRef = useRef<string | null>(null);
  const listeners = useRef(new Set<EventListener>());
  const notifListeners = useRef(new Set<NotificationListener>());
  const tasks = useRef(new Map<string, SyncTask>());
  const catchingUp = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryDelay = useRef(1000);
  const uidRef = useRef<string | null>(null);

  const dispatch = useCallback((event: SyncEvent | { type: 'reset' }) => {
    listeners.current.forEach((l) => {
      try {
        l(event);
      } catch (err) {
        console.warn('sync listener failed', err);
      }
    });
  }, []);

  const advanceCursor = useCallback((id: string) => {
    const uid = uidRef.current;
    if (!uid || !/^\d+$/.test(id)) return;
    if (cursorRef.current && BigInt(id) <= BigInt(cursorRef.current)) return;
    cursorRef.current = id;
    saveCursor(uid, id);
  }, []);

  const refreshUnread = useCallback(async () => {
    try {
      setUnreadCount(await notificationService.unreadCount());
    } catch {}
  }, []);

  const runTasks = useCallback(async () => {
    for (const [name, task] of tasks.current) {
      try {
        await task();
      } catch (err) {
        console.warn(`sync task "${name}" failed`, err);
      }
    }
  }, []);

  /** Fetches every change since the stored cursor, then runs background sync tasks. */
  const catchUp = useCallback(async () => {
    const uid = uidRef.current;
    if (!uid || catchingUp.current) return;
    catchingUp.current = true;
    setStatus('syncing');
    try {
      if (!cursorRef.current) cursorRef.current = await loadCursor(uid);
      if (!cursorRef.current) {
        // First run on this device: start from "now" and let screens load fresh data
        const c = await syncApi.getCursor();
        advanceCursor(c);
        cursorRef.current = c;
        dispatch({ type: 'reset' });
      } else {
        let since = cursorRef.current;
        for (let page = 0; page < 50; page++) {
          const res = await syncApi.getChanges(since);
          if (res.reset) {
            dispatch({ type: 'reset' });
            advanceCursor(await syncApi.getCursor());
            break;
          }
          res.events.forEach((e) => dispatch(e));
          if (res.cursor) advanceCursor(res.cursor);
          since = res.cursor;
          if (!res.hasMore) break;
        }
      }
      await runTasks();
      await refreshUnread();
      syncApi.registerDevice(cursorRef.current || undefined).catch(() => {});
      setLastSyncedAt(new Date());
      setLastError(null);
      retryDelay.current = 1000;
      setStatus(socketRef.current?.connected ? 'synced' : 'connecting');
    } catch (err: any) {
      setLastError(err?.message || 'Sync failed');
      setStatus(err?.network ? 'offline' : 'error');
      // Retry with exponential backoff (max 60s)
      if (retryTimer.current) clearTimeout(retryTimer.current);
      const delay = retryDelay.current;
      retryDelay.current = Math.min(delay * 2, 60000);
      retryTimer.current = setTimeout(() => {
        catchingUp.current = false;
        catchUp();
      }, delay);
      catchingUp.current = false;
      return;
    }
    catchingUp.current = false;
  }, [advanceCursor, dispatch, refreshUnread, runTasks]);

  // Connect / disconnect with the signed-in user
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      uidRef.current = null;
      cursorRef.current = null;
      socketRef.current?.disconnect();
      socketRef.current = null;
      setUnreadCount(0);
      return;
    }
    uidRef.current = user.uid;
    cursorRef.current = null;
    setStatus('connecting');

    openSocket().then((socket) => {
      if (cancelled) {
        socket.disconnect();
        return;
      }
      socketRef.current = socket;
      socket.on('connect', () => {
        catchUp();
      });
      socket.on('disconnect', () => setStatus('connecting'));
      socket.on('connect_error', () => setStatus((s) => (s === 'offline' ? s : 'connecting')));
      socket.on('sync:event', (event: SyncEvent) => {
        dispatch(event);
        advanceCursor(event.id);
        setLastSyncedAt(new Date());
      });
      socket.on('notification:new', (n: AppNotification) => {
        setUnreadCount((c) => c + 1);
        notifListeners.current.forEach((l) => l(n));
      });
      socket.on('notification:read', (info: { unreadCount?: number }) => {
        if (typeof info?.unreadCount === 'number') setUnreadCount(info.unreadCount);
      });
      socket.on('auth:expired', () => {
        // socket.io reconnects automatically and the auth callback fetches a fresh token
      });
    });

    return () => {
      cancelled = true;
      if (retryTimer.current) clearTimeout(retryTimer.current);
      socketRef.current?.disconnect();
      socketRef.current = null;
    };
  }, [user, catchUp, dispatch, advanceCursor]);

  // Connectivity changes: go offline / resync as soon as the network returns
  useEffect(() => {
    const unsub = NetInfo.addEventListener((state) => {
      const online = state.isConnected !== false && state.isInternetReachable !== false;
      setIsOnline(online);
      if (!online) {
        setStatus('offline');
      } else if (uidRef.current) {
        if (!socketRef.current?.connected) socketRef.current?.connect();
        catchUp();
      }
    });
    return () => unsub();
  }, [catchUp]);

  // App returns to the foreground: resync (mobile background suspends sockets)
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && uidRef.current) {
        if (!socketRef.current?.connected) socketRef.current?.connect();
        catchUp();
      }
    });
    return () => sub.remove();
  }, [catchUp]);

  const subscribe = useCallback((listener: EventListener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const subscribeNotifications = useCallback((listener: NotificationListener) => {
    notifListeners.current.add(listener);
    return () => {
      notifListeners.current.delete(listener);
    };
  }, []);

  const registerSyncTask = useCallback((name: string, task: SyncTask) => {
    tasks.current.set(name, task);
    return () => {
      tasks.current.delete(name);
    };
  }, []);

  const syncNow = useCallback(async () => {
    if (!socketRef.current?.connected) socketRef.current?.connect();
    await catchUp();
  }, [catchUp]);

  return (
    <SyncContext.Provider
      value={{
        status,
        isOnline,
        lastSyncedAt,
        lastError,
        unreadCount,
        pendingChanges,
        setPendingChanges,
        refreshUnread,
        setUnreadCount,
        subscribe,
        subscribeNotifications,
        registerSyncTask,
        syncNow,
      }}
    >
      {children}
    </SyncContext.Provider>
  );
}

export function useSync(): SyncContextValue {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error('useSync must be used within a SyncProvider');
  return ctx;
}

/** Subscribes a screen to sync events for its lifetime. */
export function useSyncEvents(listener: EventListener) {
  const { subscribe } = useSync();
  const ref = useRef(listener);
  ref.current = listener;
  useEffect(() => subscribe((e) => ref.current(e)), [subscribe]);
}
