import { useState, useEffect, useCallback, useMemo } from 'react';
import { folderService } from '@/services/folder.service';
import { fileService, SelectedFile } from '@/services/file.service';
import {
  FileItem,
  FolderItem,
  BreadcrumbItem,
  ViewMode,
  SortField,
  SortDirection,
  UploadProgress,
} from '@/types/explorer';

export function useFileExplorer() {
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<BreadcrumbItem[]>([
    { id: null, name: 'Home' },
  ]);

  const [folders, setFolders] = useState<FolderItem[]>([]);
  const [files, setFiles] = useState<FileItem[]>([]);
  const [allFolders, setAllFolders] = useState<FolderItem[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [uploading, setUploading] = useState<boolean>(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      const [fetchedFolders, fetchedFiles] = await Promise.all([
        folderService.getFolders(currentFolderId),
        fileService.getFiles(currentFolderId),
      ]);
      setFolders(fetchedFolders);
      setFiles(fetchedFiles);
    } catch (err: any) {
      console.error('Error loading directory contents:', err);
      setError(err.message || 'Failed to load files and folders.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [currentFolderId]);

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

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
    await fileService.downloadFile(file.id, file.name);
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
