import { useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { useSync, useSyncEvents } from '@/context/SyncContext';
import { notesService } from '@/services/notes.service';
import { offlineService } from '@/services/offline.service';

/**
 * Background synchronisation jobs that run after every successful catch-up
 * (app start, reconnect, network back, app foregrounded):
 *  - send note edits made while offline (outbox)
 *  - refresh "available offline" files (new versions, revoked access)
 */
export function SyncTasks() {
  const { user } = useAuth();
  const { registerSyncTask, setPendingChanges } = useSync();

  useEffect(() => {
    if (!user) return;
    const updatePending = () => notesService.pendingCount().then(setPendingChanges).catch(() => {});
    updatePending();
    const offNotes = registerSyncTask('notes-outbox', async () => {
      await notesService.flushOutbox();
      await updatePending();
    });
    const offFiles = registerSyncTask('offline-files', async () => {
      await offlineService.refresh();
    });
    const timer = setInterval(updatePending, 5000);
    return () => {
      offNotes();
      offFiles();
      clearInterval(timer);
    };
  }, [user, registerSyncTask, setPendingChanges]);

  // Keep offline copies current when a file changes on another device
  useSyncEvents((event) => {
    if ('resourceType' in event && event.resourceType === 'file' && event.resourceId &&
        (event.type === 'file.updated' || event.type === 'file.deleted' || event.type === 'file.moved')) {
      offlineService.isOffline(event.resourceId).then((yes) => {
        if (yes) offlineService.refresh([event.resourceId!]).catch(() => {});
      });
    }
    if ('resourceType' in event && event.type === 'share.revoked') {
      offlineService.refresh().catch(() => {});
    }
  });

  return null;
}
