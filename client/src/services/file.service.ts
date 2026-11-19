import { Platform } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { apiRequest, getApiBaseUrl, getAuthToken, uploadFileWithProgress } from './api';
import { FileItem, UploadProgress } from '@/types/explorer';

/** Result of a download on a native device: the file lives in the app cache until saved/shared. */
export interface NativeDownloadResult {
  uri: string;
  name: string;
  mimeType: string;
}

/** Makes a filename safe to use on the device file system. */
function toSafeLocalName(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|\x00-\x1f]/g, '_').trim();
  return cleaned || 'download';
}

/** Turns native download errors (which only carry the HTTP status) into readable messages. */
function describeDownloadError(err: any): string {
  const msg = String(err?.message || err || '');
  if (/\b401\b/.test(msg)) return 'Your session has expired. Please sign in again.';
  if (/\b403\b/.test(msg)) return 'You do not have permission to download this file.';
  if (/\b404\b/.test(msg)) return 'This file no longer exists on the server.';
  if (/\b429\b/.test(msg)) return 'Too many requests. Please wait a moment and try again.';
  return msg ? `Download failed: ${msg}` : 'Download failed. Please check your connection.';
}

export interface SelectedFile {
  name: string;
  size?: number;
  type?: string;
  uri?: string;
  fileObject?: any; // Native web File/Blob instance if on web
}

export const fileService = {
  /**
   * Opens the native document picker (Android/iOS) and returns the chosen file,
   * or null if the user cancelled. The file is copied to the app cache so it can be uploaded.
   */
  async pickNativeFile(): Promise<SelectedFile | null> {
    const result = await DocumentPicker.getDocumentAsync({
      type: '*/*',
      multiple: false,
      copyToCacheDirectory: true,
    });

    if (result.canceled || !result.assets || result.assets.length === 0) {
      return null;
    }

    const asset = result.assets[0];
    return {
      name: asset.name,
      size: asset.size,
      type: asset.mimeType || 'application/octet-stream',
      uri: asset.uri,
    };
  },

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
   * Web: downloads the file and triggers the browser's save dialog.
   * Native: downloads the file into the app cache (with progress) and returns its location,
   * so the caller can let the user save or share it.
   */
  async downloadFile(
    id: string,
    fileName: string,
    onProgress?: (progress: UploadProgress) => void
  ): Promise<NativeDownloadResult | null> {
    const token = await getAuthToken();
    const baseUrl = getApiBaseUrl();
    const url = `${baseUrl}/api/files/${encodeURIComponent(id)}/download`;

    if (Platform.OS !== 'web') {
      const downloadDir = new Directory(Paths.cache, 'downloads');
      if (!downloadDir.exists) {
        downloadDir.create({ intermediates: true, idempotent: true });
      }
      // Prefix with the file id so two files with the same name never overwrite each other
      const destination = new File(downloadDir, `${id}_${toSafeLocalName(fileName)}`);

      let downloaded: File;
      try {
        downloaded = await File.downloadFileAsync(url, destination, {
          headers: { Authorization: `Bearer ${token}` },
          idempotent: true,
          onProgress: ({ bytesWritten, totalBytes }) => {
            if (!onProgress) return;
            const total = totalBytes > 0 ? totalBytes : 0;
            onProgress({
              loaded: bytesWritten,
              total,
              percent: total ? Math.min(100, Math.round((bytesWritten / total) * 100)) : 0,
            });
          },
        });
      } catch (err) {
        throw new Error(describeDownloadError(err));
      }

      return {
        uri: downloaded.uri,
        name: fileName,
        mimeType: downloaded.type || 'application/octet-stream',
      };
    }

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
    const blobUrl = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = blobUrl;
    anchor.download = fileName;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(blobUrl);
    return null;
  },

  /**
   * Android only: asks the user to pick a folder on the device (e.g. Downloads)
   * and writes the downloaded file there. Returns false if the user cancelled.
   */
  async saveToDeviceFolder(download: NativeDownloadResult): Promise<boolean> {
    let targetDir: Directory;
    try {
      targetDir = await Directory.pickDirectoryAsync();
    } catch {
      return false; // user dismissed the folder picker
    }
    if (!targetDir) return false;

    const source = new File(download.uri);
    const target = targetDir.createFile(toSafeLocalName(download.name), download.mimeType);
    target.write(await source.bytes());
    return true;
  },

  /**
   * Opens the system share sheet for a downloaded file.
   * On iOS this includes "Save to Files"; on Android it lets the user open or send the file.
   */
  async shareDownloadedFile(download: NativeDownloadResult): Promise<void> {
    if (!(await Sharing.isAvailableAsync())) {
      throw new Error('Sharing is not available on this device.');
    }
    await Sharing.shareAsync(download.uri, {
      mimeType: download.mimeType,
      dialogTitle: download.name,
    });
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
