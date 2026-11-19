import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Alert, Platform } from 'react-native';
import { folderService } from '@/services/folder.service';
import { fileService, SelectedFile, NativeDownloadResult } from '@/services/file.service';
import { shareService } from '@/services/share.service';
import { Note, notesService } from '@/services/notes.service';
import { offlineService } from '@/services/offline.service';
import { useSyncEvents } from '@/context/SyncContext';
import type { ApiError } from '@/services/api';
import type { ShareTarget } from '@/components/explorer/modals/ShareModal';
import {
  FileItem,
  FolderItem,
  BreadcrumbItem,
  ViewMode,
  SortField,
  SortDirection,
  UploadProgress,
  AccessLevel,
} from '@/types/explorer';

/** 'mine' = your own workspace; 'shared' = items other people shared with you. */
export type ExplorerMode = 'mine' | 'shared';

/** Who shared an item and with which permission (only for top-level items in 'shared' mode). */
export interface SharedItemInfo {
  permission: AccessLevel;
  ownerName: string;
}

export function useFileExplorer(mode: ExplorerMode = 'mine') {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: null, name: mode === 'shared' ? 'Shared with me' : 'Home' },
  ]);

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [allFolders, setAllFolders] = useState<FolderItem[]>([]);

  // Access level in the folder currently open (owner in your own workspace)
  const [currentAccess, setCurrentAccess] = useState<AccessLevel>(mode === 'shared' ? 'viewer' : 'owner');
  // Sharing details for the top level of 'shared' mode, keyed "folder:<id>" / "file:<id>"
  const [sharedInfo, setSharedInfo] = useState<Record<string, SharedItemInfo>>({});
  const [itemToShare, setItemToShare] = useState<ShareTarget | null>(null);
  // Notes in the open folder, files available offline, file receiving a new version
  const [notes, setNotes] = useState<Note[]>([]);
  const [offlineIds, setOfflineIds] = useState<Set<string>>(new Set());
  const [fileToReplace, setFileToReplace] = useState<FileItem | null>(null);
  const [offlineBusyId, setOfflineBusyId] = useState<string | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Download state (one download at a time) and a transient status message for actions
  const [downloadingFile, setDownloadingFile] = useState<FileItem | null>(null);
  const [downloadProgress, setDownloadProgress] = useState<UploadProgress | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [sortField, setSortField] = useState<SortField>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Modal control states
  const [isCreateFolderOpen, setIsCreateFolderOpen] = useState<boolean>(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [itemToRename, setItemToRename] = useState<{ type: 'file' | 'folder'; item: FileItem | FolderItem } | null>(null);
  const [fileToMove, setFileToMove] = useState<FileItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<{ type: 'file' | 'folder'; item: FileItem | FolderItem } | null>(null);

  /**
   * Loads items (folders and files) in the current active folder.
   */
  const loadDirectory = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);

    try {
      if (mode === 'shared' && currentFolderId === null) {
        // Top level of "Shared with me": everything shared directly with this user
        const shared = await shareService.getSharedWithMe();
        const info: Record<string, SharedItemInfo> = {};
        setFolders(
          shared.folders.map((f) => {
            info[`folder:${f.folder_id}`] = { permission: f.permission, ownerName: f.owner_name };
            return { id: String(f.folder_id), name: f.name, created_at: f.created_at, updated_at: f.updated_at, access: f.permission };
          })
        );
        setFiles(
          shared.files.map((f) => {
            info[`file:${f.file_id}`] = { permission: f.permission, ownerName: f.owner_name };
            return {
              id: String(f.file_id),
              name: f.name,
              size: f.size,
              mime_type: f.mime_type,
              created_at: f.created_at,
              updated_at: f.updated_at,
              access: f.permission,
            };
          })
        );
        setSharedInfo(info);
        setCurrentAccess('viewer');
      } else if (mode === 'shared' && currentFolderId !== null) {
        // Inside a shared folder: one call returns contents + our access level
        const folder = await folderService.getFolderById(currentFolderId);
        setFolders(folder.subfolders || []);
        setFiles(folder.files || []);
        setCurrentAccess(folder.access || 'viewer');
      } else {
        const [fetchedFolders, fetchedFiles] = await Promise.all([
          folderService.getFolders(currentFolderId),
          fileService.getFiles(currentFolderId),
        ]);
        setFolders(fetchedFolders);
        setFiles(fetchedFiles);
        setCurrentAccess('owner');
      }
      // Notes that live in this folder (or the workspace root); none at the "Shared with me" top level
      if (mode === 'shared' && currentFolderId === null) {
        setNotes([]);
      } else {
        notesService
          .list({ folderId: currentFolderId })
          .then((r) => setNotes(r.notes))
          .catch(() => setNotes([]));
      }
      offlineService.list().then((l) => setOfflineIds(new Set(l.map((e) => e.id)))).catch(() => {});
    } catch (err: any) {
      console.error('Error loading directory contents:', err);
      if (mode === 'shared' && (err?.status === 403 || err?.status === 404)) {
        setError('This item is no longer shared with you.');
      } else {
        setError(err.message || 'Failed to load files and folders.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentFolderId, mode]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  // ---------------------------------------------------------------------------
  // Real-time sync: refresh when something in the open folder changes on any device
  // ---------------------------------------------------------------------------
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => loadDirectory(true), 250);
  }, [loadDirectory]);
  useEffect(() => () => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
  }, []);

  useSyncEvents((event) => {
    if (event.type === 'reset') {
      scheduleRefresh();
      return;
    }
    const e = event as import('@/services/sync.service').SyncEvent;
    const here = currentFolderId;
    const previousFolder = e.payload?.previousFolderId ?? null;
    const touchesHere =
      String(e.folderId ?? '') === String(here ?? '') ||
      String(previousFolder ?? '') === String(here ?? '') ||
      (e.resourceType === 'folder' && here !== null && e.resourceId === here);

    // The open folder itself was deleted or access to it was removed
    if (here !== null && e.resourceId === here && (e.type === 'folder.deleted' || e.type === 'share.revoked')) {
      setNotice({ type: 'error', message: e.type === 'folder.deleted' ? 'This folder was deleted on another device.' : 'Your access to this folder was removed.' });
      setCurrentFolderId(null);
      setBreadcrumbs((prev) => prev.slice(0, 1));
      return;
    }
    if (mode === 'shared' && here === null && e.type.startsWith('share.')) {
      scheduleRefresh();
      return;
    }
    if (touchesHere && !e.type.startsWith('link.')) scheduleRefresh();
  });

  /**
   * Loads all folders for folder-tree selection (e.g. Move modal).
   */
  const loadAllFolders = useCallback(async () => {
    try {
      const all = await folderService.getAllFolders();
      setAllFolders(all);
    } catch (err) {
      console.error('Error fetching all folders:', err);
    }
  }, []);

  /**
   * Navigates into a subfolder.
   */
  const navigateToFolder = useCallback((folder: FolderItem) => {
    setCurrentFolderId(folder.id);
    setBreadcrumbs((prev) => [...prev, { id: folder.id, name: folder.name }]);
    setSearchQuery('');
  }, []);

  /**
   * Navigates to a specific breadcrumb index.
   */
  const navigateToBreadcrumb = useCallback((index: number) => {
    setBreadcrumbs((prev) => {
      const target = prev[index];
      setCurrentFolderId(target.id);
      return prev.slice(0, index + 1);
    });
    setSearchQuery('');
  }, []);

  /**
   * Navigates up to the parent folder.
   */
  const navigateUp = useCallback(() => {
    if (breadcrumbs.length <= 1) return;
    const parentIndex = breadcrumbs.length - 2;
    navigateToBreadcrumb(parentIndex);
  }, [breadcrumbs, navigateToBreadcrumb]);

  /**
   * Creates a new folder in the current directory.
   */
  const handleCreateFolder = async (name: string): Promise<void> => {
    await folderService.createFolder(name, currentFolderId);
    await loadDirectory(true);
    setIsCreateFolderOpen(false);
  };

  /**
   * Renames a folder or file.
   */
  const handleRename = async (newName: string): Promise<void> => {
    if (!itemToRename) return;
    if (itemToRename.type === 'folder') {
      await folderService.renameFolder(itemToRename.item.id, newName);
      // If current folder was renamed, update breadcrumb
      if (itemToRename.item.id === currentFolderId) {
        setBreadcrumbs((prev) =>
          prev.map((b) => (b.id === itemToRename.item.id ? { ...b, name: newName } : b))
        );
      }
    } else {
      await fileService.renameFile(itemToRename.item.id, newName);
    }
    await loadDirectory(true);
    setItemToRename(null);
  };

  /**
   * Moves a file to another folder or root.
   */
  const handleMoveFile = async (targetFolderId: string | null): Promise<void> => {
    if (!fileToMove) return;
    await fileService.moveFile(fileToMove.id, targetFolderId);
    await loadDirectory(true);
    setFileToMove(null);
  };

  /**
   * Deletes a folder or file permanently.
   */
  const handleDelete = async (): Promise<void> => {
    if (!itemToDelete) return;
    if (itemToDelete.type === 'folder') {
      await folderService.deleteFolder(itemToDelete.item.id);
    } else {
      await fileService.deleteFile(itemToDelete.item.id);
    }
    await loadDirectory(true);
    setItemToDelete(null);
  };

  /**
   * Uploads a file into the current directory with real-time progress tracking.
   */
  const handleUploadFile = async (file: SelectedFile): Promise<void> => {
    setUploading(true);
    setUploadProgress({ loaded: 0, total: 100, percent: 0 });
    try {
      await fileService.uploadFile(file, currentFolderId, (progress) => {
        setUploadProgress(progress);
      });
      await loadDirectory(true);
      setIsUploadModalOpen(false);
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  /**
   * Triggers download of a file.
   */
  const handleDownloadFile = async (file: FileItem): Promise<void> => {
    if (downloadingFile) {
      setNotice({ type: 'error', message: `Please wait until "${downloadingFile.name}" finishes downloading.` });
      return;
    }

    setNotice(null);
    setDownloadingFile(file);
    setDownloadProgress({ loaded: 0, total: Number(file.size) || 0, percent: 0 });

    let result: NativeDownloadResult | null = null;
    try {
      result = await fileService.downloadFile(file.id, file.name, setDownloadProgress);
    } catch (err: any) {
      setNotice({ type: 'error', message: err?.message || 'Download failed.' });
      return;
    } finally {
      setDownloadingFile(null);
      setDownloadProgress(null);
    }

    // Web: the browser already handled saving the file
    if (!result || Platform.OS === 'web') return;

    // Native: let the user choose where the file goes
    const downloaded = result;
    const runAction = async (action: () => Promise<boolean | void>, successMessage: string) => {
      try {
        const done = await action();
        if (done !== false) setNotice({ type: 'success', message: successMessage });
      } catch (err: any) {
        setNotice({ type: 'error', message: err?.message || 'Could not save the file.' });
      }
    };

    const buttons: { text: string; style?: 'cancel'; onPress?: () => void }[] = [];
    if (Platform.OS === 'android') {
      buttons.push({
        text: 'Save to device',
        onPress: () =>
          runAction(() => fileService.saveToDeviceFolder(downloaded), `"${file.name}" saved to your device.`),
      });
    }
    buttons.push({
      text: Platform.OS === 'ios' ? 'Save / Share' : 'Open / Share',
      onPress: () => runAction(() => fileService.shareDownloadedFile(downloaded), `"${file.name}" is ready.`),
    });
    buttons.push({ text: 'Close', style: 'cancel' });

    Alert.alert(
      'Download complete',
      Platform.OS === 'ios'
        ? `"${file.name}" was downloaded. Choose "Save / Share", then "Save to Files" to keep it.`
        : `"${file.name}" was downloaded. Save it to a folder on your device or open it in another app.`,
      buttons
    );
  };

  /**
   * Uploads a new version of an existing file. Conflict-safe: if the file changed on another
   * device since it was loaded, the server refuses (409) and the list is refreshed.
   */
  const handleReplaceFile = async (file: SelectedFile): Promise<void> => {
    if (!fileToReplace) return;
    setUploading(true);
    setUploadProgress({ loaded: 0, total: 100, percent: 0 });
    try {
      await fileService.replaceFile(fileToReplace.id, file, fileToReplace.version, (p) => setUploadProgress(p));
      setNotice({ type: 'success', message: `New version of "${fileToReplace.name}" uploaded.` });
      setFileToReplace(null);
      setIsUploadModalOpen(false);
      await loadDirectory(true);
    } catch (err) {
      const e = err as ApiError;
      if (e.code === 'CONFLICT') {
        await loadDirectory(true);
        throw new Error('This file was changed on another device. The list was refreshed — check the latest version and try again.');
      }
      throw err;
    } finally {
      setUploading(false);
      setUploadProgress(null);
    }
  };

  /** Keeps (or stops keeping) a private copy on this device for offline use. */
  const toggleOffline = async (file: FileItem): Promise<void> => {
    setOfflineBusyId(file.id);
    try {
      if (offlineIds.has(String(file.id))) {
        await offlineService.remove(file.id);
        setNotice({ type: 'success', message: `"${file.name}" is no longer kept offline.` });
      } else {
        await offlineService.add(file);
        setNotice({ type: 'success', message: `"${file.name}" is now available offline.` });
      }
      const l = await offlineService.list();
      setOfflineIds(new Set(l.map((e) => e.id)));
    } catch (err: any) {
      setNotice({ type: 'error', message: err?.message || 'Could not update offline copy.' });
    } finally {
      setOfflineBusyId(null);
    }
  };

  /**
   * Filtered and sorted folders.
   */
  const filteredFolders = useMemo(() => {
    let result = [...folders];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((f) => f.name.toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === 'updated_at') {
        comparison = (a.updated_at || '').localeCompare(b.updated_at || '');
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return result;
  }, [folders, searchQuery, sortField, sortDirection]);

  /**
   * Filtered and sorted files.
   */
  const filteredFiles = useMemo(() => {
    let result = [...files];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((f) => f.name.toLowerCase().includes(q));
    }
    result.sort((a, b) => {
      let comparison = 0;
      if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === 'size') {
        const sizeA = Number(a.size) || 0;
        const sizeB = Number(b.size) || 0;
        comparison = sizeA - sizeB;
      } else if (sortField === 'updated_at') {
        comparison = (a.updated_at || '').localeCompare(b.updated_at || '');
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return result;
  }, [files, searchQuery, sortField, sortDirection]);

  return {
    mode,
    notes,
    offlineIds,
    offlineBusyId,
    offlineSupported: offlineService.isSupported(),
    toggleOffline,
    fileToReplace,
    setFileToReplace,
    handleReplaceFile,
    currentAccess,
    sharedInfo,
    itemToShare,
    setItemToShare,
    currentFolderId,
    breadcrumbs,
    folders: filteredFolders,
    files: filteredFiles,
    rawFolderCount: folders.length,
    rawFileCount: files.length,
    allFolders,
    loading,
    refreshing,
    uploading,
    uploadProgress,
    downloadingFile,
    downloadProgress,
    notice,
    dismissNotice: () => setNotice(null),
    error,
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    // Navigation
    navigateToFolder,
    navigateToBreadcrumb,
    navigateUp,
    refresh: () => loadDirectory(true),
    loadAllFolders,
    // Modals
    isCreateFolderOpen,
    setIsCreateFolderOpen,
    isUploadModalOpen,
    setIsUploadModalOpen,
    itemToRename,
    setItemToRename,
    fileToMove,
    setFileToMove,
    itemToDelete,
    setItemToDelete,
    // Action handlers
    handleCreateFolder,
    handleRename,
    handleMoveFile,
    handleDelete,
    handleUploadFile,
    handleDownloadFile,
  };
}
