import { auth } from '@/config/firebase';
import { apiRequest, getApiBaseUrl } from './api';
import { fileService, NativeDownloadResult } from './file.service';
import {
  ApiResponse,
  CreatedShareLink,
  PublicLinkContents,
  PublicLinkInfo,
  ResourceAccess,
  ResourceType,
  SharedWithMe,
  SharePermission,
  UploadProgress,
} from '@/types/explorer';

export interface CreateLinkOptions {
  /** Hours until the link stops working; null = never */
  expiresInHours: number | null;
  /** Optional password (4-128 characters) */
  password?: string;
  /** Only signed-in ShareSync users can open it */
  requireSignIn?: boolean;
}

/** Error thrown by share-link requests; `code` tells the UI what to ask for. */
export type LinkError = Error & { status?: number; code?: string };

/** Headers for public link requests: optional login token + optional link password. */
async function publicHeaders(password?: string | null): Promise<Record<string, string>> {
  const headers: Record<string, string> = {};
  if (auth.currentUser) {
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  }
  if (password) headers['X-Share-Password'] = password;
  return headers;
}

async function publicRequest<T>(path: string, password?: string | null): Promise<T> {
  const response = await fetch(`${getApiBaseUrl()}${path}`, { headers: await publicHeaders(password) });
  let data: ApiResponse<T>;
  try {
    data = await response.json();
  } catch {
    data = { success: false, message: response.statusText || 'Unexpected server response' };
  }
  if (!response.ok) {
    const err = new Error(data.message || `Request failed (${response.status})`) as LinkError;
    err.status = response.status;
    err.code = data.code;
    throw err;
  }
  return data.data as T;
}

export const shareService = {
  // ---------------- signed-in sharing ----------------

  /** Shares a file/folder with a registered ShareSync user by email. */
  async shareWithUser(resourceType: ResourceType, resourceId: string, email: string, permission: SharePermission) {
    const res = await apiRequest('/api/shares', {
      method: 'POST',
      body: JSON.stringify({ resourceType, resourceId, email: email.trim(), permission }),
    });
    return res;
  },

  /** People and links that can access a resource (owner only). */
  async getResourceAccess(resourceType: ResourceType, resourceId: string): Promise<ResourceAccess> {
    const res = await apiRequest<ResourceAccess>(
      `/api/shares/resource/${resourceType}/${encodeURIComponent(resourceId)}`
    );
    return res.data as ResourceAccess;
  },

  async updatePermission(resourceType: ResourceType, shareId: string, permission: SharePermission) {
    await apiRequest(`/api/shares/${resourceType}/${encodeURIComponent(shareId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ permission }),
    });
  },

  async revokeShare(resourceType: ResourceType, shareId: string) {
    await apiRequest(`/api/shares/${resourceType}/${encodeURIComponent(shareId)}`, { method: 'DELETE' });
  },

  /** Creates a view-only link. The token is only ever returned here, once. */
  async createLink(resourceType: ResourceType, resourceId: string, options: CreateLinkOptions): Promise<CreatedShareLink> {
    const res = await apiRequest<CreatedShareLink>('/api/shares/links', {
      method: 'POST',
      body: JSON.stringify({
        resourceType,
        resourceId,
        expiresInHours: options.expiresInHours,
        password: options.password || undefined,
        requireSignIn: options.requireSignIn === true,
      }),
    });
    return res.data as CreatedShareLink;
  },

  async revokeLink(linkId: string) {
    await apiRequest(`/api/shares/links/${encodeURIComponent(linkId)}`, { method: 'DELETE' });
  },

  async getSharedWithMe(): Promise<SharedWithMe> {
    const res = await apiRequest<SharedWithMe>('/api/shares/with-me');
    return res.data || { files: [], folders: [] };
  },

  // ---------------- public link access ----------------

  getLinkInfo(token: string, password?: string | null) {
    return publicRequest<PublicLinkInfo>(`/api/public/links/${encodeURIComponent(token)}`, password);
  },

  getLinkContents(token: string, password?: string | null, folderId?: string | null) {
    const q = folderId ? `?folder_id=${encodeURIComponent(folderId)}` : '';
    return publicRequest<PublicLinkContents>(`/api/public/links/${encodeURIComponent(token)}/contents${q}`, password);
  },

  /** Downloads a file through a link (web: browser download, native: cached copy to save/share). */
  async downloadViaLink(
    token: string,
    fileName: string,
    password?: string | null,
    fileId?: string | null,
    onProgress?: (p: UploadProgress) => void
  ): Promise<NativeDownloadResult | null> {
    const q = fileId ? `?file_id=${encodeURIComponent(fileId)}` : '';
    const url = `${getApiBaseUrl()}/api/public/links/${encodeURIComponent(token)}/download${q}`;
    // Cache key from a short token prefix + file id; the full token is never written to disk names
    const cacheKey = `link_${token.slice(0, 8)}_${fileId || 'file'}`;
    return fileService.downloadFromUrl(url, await publicHeaders(password), cacheKey, fileName, onProgress);
  },
};
