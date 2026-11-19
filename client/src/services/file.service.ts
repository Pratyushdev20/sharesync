import { Platform } from 'react-native';
import { apiRequest, getApiBaseUrl, getAuthToken, uploadFileWithProgress } from './api';
import { FileItem, UploadProgress } from '@/types/explorer';

export interface SelectedFile {
  name: string;
  size?: number;
  type?: string;
  uri?: string;
  fileObject?: any; // Native web File/Blob instance if on web
}

export const fileService = {
  /**
   * Retrieves files in a given folder (or root if folderId is null).
   */
  async getFiles(folderId?: string | null): Promise<FileItem[]> {
    const query = folderId ? `?folder_id=${encodeURIComponent(folderId)}` : '?folder_id=root';
    const response = await apiRequest<FileItem[]>(`/api/files${query}`);
    return response.data || [];
  },

  /**
   * Retrieves metadata of a single file.
   */
  async getFileById(id: string): Promise<FileItem> {
    const response = await apiRequest<FileItem>(`/api/files/${encodeURIComponent(id)}`);
    if (!response.data) {
      throw new Error('File data is missing in response.');
    }
    return response.data;
  },

  /**
   * Uploads a file with real-time progress tracking.
   */
  async uploadFile(
    file: SelectedFile,
    folderId?: string | null,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<FileItem> {
    const formData = new FormData();

    if (Platform.OS === 'web' && file.fileObject) {
      formData.append('file', file.fileObject, file.name);
    } else {
      formData.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.type || 'application/octet-stream',
      } as any);
    }

    if (folderId) {
      formData.append('folder_id', folderId);
    }

    const response = await uploadFileWithProgress('/api/files/upload', formData, onProgress);
    if (!response.data) {
      throw new Error('File upload completed but no file data returned.');
    }
    return response.data;
  },

  /**
   * Downloads a file and saves it or prompts download in the browser.
   */
  async downloadFile(id: string, fileName: string): Promise<void> {
    const token = await getAuthToken();
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/files/${encodeURIComponent(id)}/download`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      let errMsg = `Download failed with status ${response.status}`;
      try {
        const errJson = await response.json();
        if (errJson.message) errMsg = errJson.message;
      } catch {}
      throw new Error(errMsg);
    }

    const blob = await response.blob();

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const blobUrl = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = blobUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      window.URL.revokeObjectURL(blobUrl);
    } else {
      // In mobile environments without expo-file-system, createObjectURL is simulated or alert user
      console.log(`File ${fileName} downloaded successfully (${blob.size} bytes).`);
    }
  },

  /**
   * Renames a file.
   */
  async renameFile(id: string, newName: string): Promise<FileItem> {
    const response = await apiRequest<FileItem>(`/api/files/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ name: newName.trim() }),
    });
    if (!response.data) {
      throw new Error('Failed to rename file: No data returned.');
    }
    return response.data;
  },

  /**
   * Moves a file to another folder (or root if targetFolderId is null).
   */
  async moveFile(id: string, targetFolderId: string | null): Promise<FileItem> {
    const response = await apiRequest<FileItem>(`/api/files/${encodeURIComponent(id)}/move`, {
      method: 'PATCH',
      body: JSON.stringify({ target_folder_id: targetFolderId || null }),
    });
    if (!response.data) {
      throw new Error('Failed to move file: No data returned.');
    }
    return response.data;
  },

  /**
   * Deletes a file permanently.
   */
  async deleteFile(id: string): Promise<{ id: string; name: string }> {
    const response = await apiRequest<{ id: string; name: string }>(`/api/files/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
    return response.data || { id, name: '' };
  },
};
