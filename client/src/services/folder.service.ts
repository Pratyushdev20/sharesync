import { apiRequest } from './api';
import { FolderItem } from '@/types/explorer';

export const folderService = {
  /**
   * Retrieves folders in a given parent directory (or root folders if parentId is null).
   */
  async getFolders(parentId?: string | null): Promise<FolderItem[]> {
    const query = parentId ? `?parent_folder_id=${encodeURIComponent(parentId)}` : '?parent_folder_id=root';
    const response = await apiRequest<FolderItem[]>(`/api/folders${query}`);
    return response.data || [];
  },

  /**
   * Retrieves all folders belonging to the user (used for folder selector in move modal).
   */
  async getAllFolders(): Promise<FolderItem[]> {
    const response = await apiRequest<FolderItem[]>('/api/folders');
    return response.data || [];
  },

  /**
   * Retrieves a single folder by ID, including subfolders and contained files.
   */
  async getFolderById(id: string): Promise<FolderItem> {
    const response = await apiRequest<FolderItem>(`/api/folders/${encodeURIComponent(id)}`);
    if (!response.data) {
      throw new Error('Folder data is missing in response.');
    }
    return response.data;
  },

  /**
   * Creates a new folder inside parentFolderId (or root if null).
   */
  async createFolder(name: string, parentFolderId?: string | null): Promise<FolderItem> {
    const response = await apiRequest<FolderItem>('/api/folders', {
      method: 'POST',
      body: JSON.stringify({
        name: name.trim(),
        parent_folder_id: parentFolderId || null,
      }),
    });
    if (!response.data) {
      throw new Error('Failed to create folder: No data returned.');
    }
    return response.data;
  },

  /**
   * Renames an existing folder.
   */
  async renameFolder(id: string, newName: string): Promise<FolderItem> {
    const response = await apiRequest<FolderItem>(`/api/folders/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (!response.data) {
      throw new Error('Failed to rename folder: No data returned.');
    }
    return response.data;
  },

  /**
   * Deletes an empty folder.
   */
  async deleteFolder(id: string): Promise<{ id: string; name: string }> {
    const response = await apiRequest<{ id: string; name: string }>(`/api/folders/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return response.data || { id, name: '' };
  },
};
